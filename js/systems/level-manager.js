window.NJOX = window.NJOX || {};

NJOX.LevelManager = class LevelManager {
    constructor() {
        this.currentLevel = 0;
        this.turnCount    = 0;
        this.creatures    = [];
        this.pickups      = [];
    }

    // ── HP FORMULA ────────────────────────────────────────────────────────────
    // HP is always proportional to current ball count so difficulty stays
    // meaningful even as the player grows stronger.
    //   ratio   = base + level_bonus + round_bonus
    //   baseHP  = ballCount × ratio
    //   result  = baseHP ± 30% variance
    _calcHP(ballCount, level, round) {
        const ratio = NJOX.HP_BALL_RATIO_BASE
            + (level - 1) * NJOX.HP_BALL_RATIO_LEVEL
            + (round - 1) * NJOX.HP_BALL_RATIO_ROUND;
        const base    = Math.max(1, ballCount * ratio);
        const spread  = base * NJOX.HP_VARIANCE;
        return Math.max(1, Math.round(base + NJOX.Utils.randFloat(-spread, spread)));
    }

    // ── LEVEL GENERATION ──────────────────────────────────────────────────────
    // ballCount is passed from game state so HP scales with player strength.
    generateLevel(levelNum, ballCount) {
        this.currentLevel = levelNum;
        this.turnCount    = 0;
        this.creatures    = [];
        this.pickups      = [];

        // Level 1: kasıtlı olarak dar koridor bırak — ilk atışta "Bounce anı" garantili
        if (levelNum === 1) {
            return this._generateEngineeredLevel1(ballCount);
        }

        // Early levels start sparse; max 5 rows
        const rows = Math.min(1 + Math.floor(levelNum / 3), 5);
        const cols = NJOX.GRID_COLS;

        // Density: level 1 = 40% empty, level 5+ = 25% empty
        const emptyChance = Math.max(0.25, 0.52 - (levelNum - 1) * 0.05);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (Math.random() < emptyChance) continue;

                const x  = col * NJOX.CELL_SIZE + 2;
                const y  = NJOX.GRID_TOP + row * NJOX.CELL_SIZE + 2;
                const hp = this._calcHP(ballCount, levelNum, 1); // start at round 1

                const type    = this._pickType(levelNum);
                const creature = this._createCreature(type, x, y, hp);
                creature.targetY = creature.y;
                this.creatures.push(creature);
            }
        }

        // Place 1-2 ball pickups in the starting layout
        this._placeStartPickups(ballCount);

        return this.creatures;
    }

    // Level 1: İlk atışta "Bounce" hissini garanti eden tasarım
    // Satır 1: tüm kolonlar dolu — 10 yaratık tam sıra
    _generateEngineeredLevel1(ballCount) {
        // Satır 1: tüm kolonlar dolu
        for (let col = 0; col < NJOX.GRID_COLS; col++) {
            const x  = col * NJOX.CELL_SIZE + 2;
            const y  = NJOX.GRID_TOP + 2;
            const hp = this._calcHP(ballCount, 1, 1);
            const c  = new NJOX.BasicMonster(x, y, hp);
            c.targetY = y;
            this.creatures.push(c);
        }

        // Satır 2: seyrek, karışık tipler
        for (let col = 0; col < NJOX.GRID_COLS; col++) {
            if (Math.random() < 0.55) continue;
            const x  = col * NJOX.CELL_SIZE + 2;
            const y  = NJOX.GRID_TOP + NJOX.CELL_SIZE + 2;
            const hp = this._calcHP(ballCount, 1, 1);
            const t  = Math.random() < 0.7 ? NJOX.CREATURE_TYPES.BASIC : NJOX.CREATURE_TYPES.COUNTER;
            const c  = this._createCreature(t, x, y, hp);
            c.targetY = y;
            this.creatures.push(c);
        }

        this._placeStartPickups(ballCount);
        return this.creatures;
    }

    // ── NEW ROW SPAWN ──────────────────────────────────────────────────────────
    // Called after every shot. ballCount drives HP; roundIndex drives density.
    spawnNewRow(roundIndex, ballCount) {
        this.turnCount++;
        const round = roundIndex || 1;
        const cols  = NJOX.GRID_COLS;

        // Density: round 1 = 45% empty → round 5 = 30% empty
        const emptyChance = Math.max(0.28, 0.50 - round * 0.05);

        for (let col = 0; col < cols; col++) {
            if (Math.random() < emptyChance) continue;

            const x = col * NJOX.CELL_SIZE + 2;
            const y = NJOX.GRID_TOP + 2;

            // No overlap: skip if this column already has a creature near the top
            const occupied = this.creatures.some(c =>
                c.alive &&
                Math.abs(c.x - x) < 2 &&
                c.targetY < NJOX.GRID_TOP + NJOX.CELL_SIZE
            );
            if (occupied) continue;

            const hp = this._calcHP(ballCount, this.currentLevel, round);

            const type     = this._pickType(this.currentLevel);
            const creature = this._createCreature(type, x, y, hp);
            creature.targetY = creature.y;
            this.creatures.push(creature);
        }

        // Ball pickup — chance DECREASES as you own more balls
        const pickupChance = Math.max(
            NJOX.PICKUP_BALL_MIN,
            NJOX.PICKUP_BALL_BASE - ballCount * NJOX.PICKUP_BALL_DECAY
        );
        if (Math.random() < pickupChance) {
            this._placePickup('ball', null, ballCount);
        }

        // Gold pickup — her round ~22% şans, miktar level ile artar
        if (Math.random() < 0.22) {
            this._placePickup('gold', NJOX.Utils.randInt(2, 3 + this.currentLevel), ballCount);
        }
    }

    // ── PICKUP PLACEMENT ──────────────────────────────────────────────────────
    _placeStartPickups(ballCount) {
        // Guarantee 1 ball pickup visible at level start (tutorial hint)
        this._placePickup('ball', null, ballCount);

        // Small chance of a 2nd one if player has very few balls
        if (ballCount <= 5 && Math.random() < 0.5) {
            this._placePickup('ball', null, ballCount);
        }
    }

    _placePickup(type, amount, ballCount) {
        const cols = NJOX.GRID_COLS;

        // Pick a random column that doesn't already have a pickup at the top
        let col = NJOX.Utils.randInt(0, cols - 1);
        for (let tries = 0; tries < 4; tries++) {
            const cx = col * NJOX.CELL_SIZE + NJOX.CELL_SIZE / 2;
            const clash = this.pickups.some(p =>
                !p.collected &&
                Math.abs(p.x - cx) < NJOX.CELL_SIZE &&
                p.y < NJOX.GRID_TOP + NJOX.CELL_SIZE * 2
            );
            if (!clash) break;
            col = NJOX.Utils.randInt(0, cols - 1);
        }

        const pickup = {
            x: col * NJOX.CELL_SIZE + NJOX.CELL_SIZE / 2,
            y: NJOX.GRID_TOP + NJOX.CELL_SIZE / 2,
            type,
            collected: false,
            radius: type === 'ball' ? 8 : 7,
        };
        if (type === 'gold') pickup.amount = amount;
        this.pickups.push(pickup);
    }

    // ── PICKUP COLLISION ───────────────────────────────────────────────────────
    checkPickupCollisions(balls, ballManager, game) {
        for (const p of this.pickups) {
            if (p.collected) continue;
            for (const ball of balls) {
                if (!ball.active) continue;
                if (NJOX.Utils.distance(ball.x, ball.y, p.x, p.y) < ball.radius + p.radius) {
                    p.collected = true;
                    if (p.type === 'ball') {
                        ballManager.addBalls(1);
                        NJOX.Sound.ballPickup();
                    } else if (p.type === 'gold') {
                        game.gold = (game.gold || 0) + p.amount;
                        NJOX.Sound.goldPickup();
                    }
                    break;
                }
            }
        }
        this.pickups = this.pickups.filter(p => !p.collected);
    }

    // ── ADVANCE ROWS ──────────────────────────────────────────────────────────
    advancePickups() {
        const advance = NJOX.CELL_SIZE * (NJOX.ROW_ADVANCE || 0.5);
        for (const p of this.pickups) {
            if (!p.collected) p.y += advance;
        }
        this.pickups = this.pickups.filter(p => !p.collected && p.y < NJOX.FLOOR_Y);
    }

    advanceRows() {
        for (const c of this.creatures) {
            if (c.alive) c.advanceRow();
        }
        this.advancePickups();
    }

    // ── RENDER PICKUPS ────────────────────────────────────────────────────────
    renderPickups(ctx) {
        for (const p of this.pickups) {
            if (p.collected) continue;
            ctx.save();

            if (p.type === 'ball') {
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a1a2e';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', p.x, p.y);
            } else if (p.type === 'gold') {
                ctx.fillStyle = 'rgba(255,215,0,0.2)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#b8860b';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('$', p.x, p.y);
            }

            ctx.restore();
        }
    }

    // ── CREATURE TYPE SELECTION ───────────────────────────────────────────────
    _pickType(level) {
        const r = Math.random();

        // ── Special types (priority-ordered, cumulative %) ────────────────
        // Vampire:         5%  (level 2+)
        if (level >= 2 && r < 0.05) return NJOX.CREATURE_TYPES.VAMPIRE;
        // Stress Spreader: 8%  (level 1+) — biraz azaltıldı (was 10%)
        if (r < 0.08) return NJOX.CREATURE_TYPES.STRESS_SPREADER;
        // Ball Carrier:    5%  (all levels) — artırıldı (was 3%)
        if (r < 0.13) return NJOX.CREATURE_TYPES.BALL_CARRIER;
        // Vomiter:         5%  (all levels)
        if (r < 0.18) return NJOX.CREATURE_TYPES.VOMITER;
        // Shield:          4%  (level 3+) — sadece üstten vurulabilir
        if (level >= 3 && r < 0.22) return NJOX.CREATURE_TYPES.SHIELD;
        // Chained:         4%  (level 3+) — iki vuruş ister
        if (level >= 3 && r < 0.26) return NJOX.CREATURE_TYPES.CHAINED;

        // ── Main types ────────────────────────────────────────────────────
        const r2 = Math.random();
        if (level <= 2) {
            // Tutorial: mostly basic, a few counter
            if (r2 < 0.82) return NJOX.CREATURE_TYPES.BASIC;
            if (r2 < 0.94) return NJOX.CREATURE_TYPES.COUNTER;
            return NJOX.CREATURE_TYPES.REACTIVE;
        } else if (level <= 5) {
            if (r2 < 0.48) return NJOX.CREATURE_TYPES.BASIC;
            if (r2 < 0.64) return NJOX.CREATURE_TYPES.COUNTER;
            if (r2 < 0.77) return NJOX.CREATURE_TYPES.REACTIVE;
            if (r2 < 0.90) return NJOX.CREATURE_TYPES.SPLITTER;
            return NJOX.CREATURE_TYPES.EATER;
        } else {
            if (r2 < 0.22) return NJOX.CREATURE_TYPES.BASIC;
            if (r2 < 0.42) return NJOX.CREATURE_TYPES.COUNTER;
            if (r2 < 0.60) return NJOX.CREATURE_TYPES.REACTIVE;
            if (r2 < 0.80) return NJOX.CREATURE_TYPES.SPLITTER;
            return NJOX.CREATURE_TYPES.EATER;
        }
    }

    _createCreature(type, x, y, hp) {
        switch (type) {
            case NJOX.CREATURE_TYPES.SPLITTER:       return new NJOX.Splitter(x, y, hp);
            case NJOX.CREATURE_TYPES.EATER:          return new NJOX.DirectionalEater(x, y, hp);
            case NJOX.CREATURE_TYPES.COUNTER:        return new NJOX.CounterCreature(x, y, hp);
            case NJOX.CREATURE_TYPES.REACTIVE:       return new NJOX.ReactiveCreature(x, y, hp);
            case NJOX.CREATURE_TYPES.VAMPIRE:        return new NJOX.VampireCreature(x, y, hp);
            case NJOX.CREATURE_TYPES.BALL_CARRIER:   return new NJOX.BallCarrier(x, y, hp);
            case NJOX.CREATURE_TYPES.VOMITER:        return new NJOX.Vomiter(x, y, hp);
            case NJOX.CREATURE_TYPES.STRESS_SPREADER:return new NJOX.StressSpreader(x, y, hp);
            case NJOX.CREATURE_TYPES.SHIELD:         return new NJOX.ShieldCreature(x, y, hp);
            case NJOX.CREATURE_TYPES.CHAINED:        return new NJOX.ChainedCreature(x, y, hp);
            default:                                 return new NJOX.BasicMonster(x, y, hp);
        }
    }

    // ── Stress spread ─────────────────────────────────────────────────────
    // Called once per round (at round end in TURN_END).
    // Each StressSpreader picks 1 random alive creature and stresses it:
    //   → isStressed = true  (red overlay + flames rendered on that creature)
    //   → HP += 3, maxHp += 3
    // Returns array of { x, y } events for floating "+3 Stress" text.
    applyStressSpread() {
        const spreaders = this.creatures.filter(c =>
            c.alive && c.type === NJOX.CREATURE_TYPES.STRESS_SPREADER
        );
        if (spreaders.length === 0) return [];

        const events    = [];
        const toConvert = []; // { idx, newSpreader } — dönüştürme sıraya alınır

        for (const sp of spreaders) {
            const spCX = sp.x + sp.w / 2;
            const spCY = sp.y + sp.h / 2;

            // Bitişik, stres yayıcı olmayan canlı yaratıklar
            const adjacent = this.creatures.filter(c => {
                if (!c.alive || c === sp) return false;
                if (c.type === NJOX.CREATURE_TYPES.STRESS_SPREADER) return false;
                const dx = (c.x + c.w / 2) - spCX;
                const dy = (c.y + c.h / 2) - spCY;
                return Math.sqrt(dx * dx + dy * dy) <= NJOX.CELL_SIZE * 1.55;
            });

            if (adjacent.length === 0) continue;

            // Tüm komşulara +3 HP stres bulaştır (was +5 — hafifletildi)
            for (const t of adjacent) {
                t.isStressed = true;
                t.hp        += 3;
                t.maxHp     += 3;
                events.push({ x: t.x + t.w / 2, y: t.y, amount: '+3 Stress' });
            }

            // Dönüşüm limiti: her yayıcı tüm oyun boyunca MAX 2 kez dönüştürür
            // Komşuları hâlâ strese sokar ama artık kendini kopyalamaz
            if (!sp._convertCount) sp._convertCount = 0;
            if (sp._convertCount >= 2) continue;  // bu yayıcı yoruldu
            sp._convertCount++;

            // 1 rastgele komşu → +6 ek HP + stres yayıcıya dönüşür (was +10)
            const victim = adjacent[NJOX.Utils.randInt(0, adjacent.length - 1)];
            victim.hp   += 6;
            victim.maxHp += 6;

            // Zıplama animasyonu
            if (typeof sp.triggerJump === 'function') {
                sp.triggerJump(victim.x + victim.w / 2, victim.y + victim.h / 2);
            }

            // Dönüştürme: kurbanı yeni StressSpreader ile değiştir
            const newSP = new NJOX.StressSpreader(victim.x, victim.y, victim.hp);
            newSP.maxHp  = victim.maxHp;
            newSP.targetY = victim.targetY !== undefined ? victim.targetY : victim.y;
            const idx = this.creatures.indexOf(victim);
            if (idx !== -1) toConvert.push({ idx, newSP });

            events.push({ x: victim.x + victim.w / 2, y: victim.y - 12, amount: '🔥 BULAŞTI!' });
        }

        // Dönüştürmeleri uygula
        for (const { idx, newSP } of toConvert) {
            this.creatures[idx] = newSP;
        }

        return events;
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    addCreatures(newCreatures) {
        this.creatures.push(...newCreatures);
    }

    removeDeadCreatures() {
        this.creatures = this.creatures.filter(c => c.alive || c.animState === 'death');
    }

    isGameOver() {
        return this.creatures.some(c => c.alive && c.targetY + c.h >= NJOX.FLOOR_Y - 5);
    }

    isLevelClear() {
        return this.creatures.filter(c => c.alive).length === 0;
    }

    isBossLevel(level) {
        return level > 0 && level % NJOX.BOSS_EVERY === 0;
    }

    getTypeCounts() {
        const counts = {};
        for (const c of this.creatures) {
            if (!c.alive) continue;
            counts[c.type] = (counts[c.type] || 0) + 1;
        }
        return counts;
    }
};
