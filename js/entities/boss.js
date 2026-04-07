window.NJOX = window.NJOX || {};

NJOX.Boss = class Boss extends NJOX.Creature {
    constructor(chapter, name, ballCount) {
        // HP scaling: ball count × chapter ratio × multiplier
        const bc = Math.max(4, ballCount || 4);
        const ratio = NJOX.BOSS_HP_RATIO_BASE + (chapter - 1) * NJOX.BOSS_HP_RATIO_PER_CH;
        const bossHp = Math.max(20, Math.round(bc * ratio * NJOX.BOSS_HP_MULTIPLIER));
        const x = (NJOX.CANVAS_W - 150) / 2;
        const y = NJOX.GRID_TOP + 20;
        super(x, y, bossHp, 'boss');
        this.w = 150;
        this.h = 120;
        this.name = name || 'STRESS';
        this.targetY = y;
        this.chapter = chapter;

        // Phase system
        this.phase = 1;
        this.phaseThresholds = [0.66, 0.33];

        // Compatibility — main.js references boss.minions
        this.minions = [];

        // ── New mechanics ───────────────────────────────────────────
        this.shields       = [];
        this.deflectors    = [];
        this.defenseOrbs   = [];
        this.defenseTimer  = 5;
        this.chest         = null;
        this.beam          = null;   // {chargeTimer, y, sweepSpeed, width, active, dir}
        this.regenRate     = 0;      // HP/s — active in phase 2+
        this._turnCount    = 0;      // incremented by performTurnAction

        // Vulnerability window — chapter-scaled
        this.vulnTimer      = 6.0;
        this.vulnOpen       = false;
        this.vulnDuration   = Math.max(1.5, 2.5 - chapter * 0.08);
        this.vulnCooldown   = Math.min(7.0, 5.5 + chapter * 0.12);
        this.vulnPhase      = 0;
        this.vulnX          = 0;
        this.vulnY          = 0;
        this.vulnRadius     = Math.max(14, 18 - chapter * 0.3);
        this.vulnHitFlash   = 0;

        // Visual states
        this.mouthOpen = 0;
        this.mouthTarget = 0;
        this.entranceTimer = 0;
        this.attackFlashTimer = 0;
        this.trackX = NJOX.CANVAS_W / 2;
        this.rage = false;

        // Initialize
        this._initDeflectors(1);  // Phase 1: 1 deflektör
        this._spawnShields(2, 3); // Phase 1: 2 shield, 3 HP each
        this._initChest();
    }

    // ── Deflectors (replaces black hole) ─────────────────────────────
    _initDeflectors(count) {
        this.deflectors = [];
        const bcx = this.x + this.w / 2;
        const bcy = this.y + this.h / 2;
        for (let i = 0; i < count; i++) {
            const startAngle = (Math.PI * 2 * i) / count;
            this.deflectors.push({
                orbitAngle: startAngle,
                orbitSpeed: 1.2 + i * 0.3,
                orbitRadius: 85 + i * 15,
                pullRadius: 55,
                pullStrength: 5500,
                x: bcx + Math.cos(startAngle) * 85,
                y: bcy + Math.sin(startAngle) * 85,
                phase: Math.random() * Math.PI * 2, // visual anim
                pulse: false,  // Phase 3: periodic strength boost
                pulseTimer: 0,
            });
        }
    }

    // ── Shields ──────────────────────────────────────────────────────
    _spawnShields(count, hp) {
        this.shields = [];
        const bossBottom = this.y + this.h + 20;
        const midY = (bossBottom + NJOX.CANVAS_H * 0.55) / 2;
        const w = 60, h = 14;
        for (let i = 0; i < count; i++) {
            const sx = 40 + Math.random() * (NJOX.CANVAS_W - 80 - w);
            const sy = bossBottom + 10 + (i / Math.max(1, count - 1)) * (midY - bossBottom);
            this.shields.push({
                x: sx, y: sy, w, h,
                hp, maxHp: hp,
                flash: 0,
                spawnScale: 0, // animasyon: 0→1
            });
        }
    }

    _initChest() {
        const isLeft = Math.random() > 0.5;
        this.chest = {
            x: isLeft ? 20 : NJOX.CANVAS_W - 60,
            y: NJOX.GRID_TOP + 10,
            w: 40, h: 35,
            hp: 8,
            alive: true,
            goldReward: 50,
            hitFlash: 0,
        };
    }

    getColor() {
        if (this.rage) return NJOX.COLORS.BOSS_RAGE;
        if (this.phase === 3) return NJOX.COLORS.BOSS_PHASE3;
        if (this.phase === 2) return NJOX.COLORS.BOSS_PHASE2;
        return NJOX.COLORS.BOSS_PHASE1;
    }

    // ── performTurnAction — called from BOSS_BETWEEN_TURNS ──────────
    performTurnAction() {
        this._turnCount++;

        // Enrage safety valve: after 8 turns, self-damage
        if (this._turnCount > 8) {
            const selfDmg = Math.ceil(this.maxHp * 0.05);
            this.hp = Math.max(1, this.hp - selfDmg);
        }

        // Shield respawn based on phase
        const shieldInterval = this.phase === 3 ? 1 : this.phase === 2 ? 2 : 3;
        if (this._turnCount % shieldInterval === 0 || this.shields.length === 0) {
            const cnt = this.phase === 3 ? 4 : this.phase === 2 ? 3 : 2;
            const hp  = this.phase === 3 ? 5 : this.phase === 2 ? 4 : 3;
            this._spawnShields(cnt, hp);
        }

        // Minion spawning
        const minionInterval = this.phase === 3 ? 1 : this.phase === 2 ? 2 : 3;
        if (this._turnCount % minionInterval === 0 && this.minions.filter(m => m.alive).length < 8) {
            const cnt = this.phase === 3
                ? 2 + Math.floor(Math.random() * 3) // 2-4
                : this.phase === 2
                    ? 2 + Math.floor(Math.random() * 2) // 2-3
                    : 1 + Math.floor(Math.random() * 2); // 1-2
            const mhp = Math.max(2, Math.floor(this.maxHp * (0.03 + this.phase * 0.02)));
            this._spawnMinionWave(cnt, mhp);
        }

        // Beam attack (phase 2+)
        if (this.phase >= 2 && !this.beam) {
            const beamInterval = this.phase === 3 ? 1 : 2;
            if (this._turnCount % beamInterval === 0) {
                this._startBeamAttack();
            }
        }
    }

    // ── Beam attack ─────────────────────────────────────────────────
    _startBeamAttack() {
        this.mouthTarget = 1.0;
        this.beam = {
            chargeTimer: 1.2,
            y: this.y + this.h + 10,
            sweepSpeed: 260,
            width: 20,
            active: false,
            dir: 1, // 1=down
        };
        // Phase 3: add a second beam going up
        if (this.phase === 3) {
            this.beam.secondY = NJOX.FLOOR_Y - 10;
            this.beam.secondDir = -1;
        }
    }

    update(dt) {
        // Death animation
        if (this.animState === 'death') {
            this.deathTimer -= dt;
            return;
        }

        if (this.entranceTimer > 0) {
            this.entranceTimer -= dt;
            return;
        }

        // Blink
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
            this.blinkState = 1;
            this.blinkTimer = 1.5 + Math.random() * 2;
        }
        if (this.blinkState > 0) {
            this.blinkState -= dt * 8;
            if (this.blinkState < 0) this.blinkState = 0;
        }

        this.swayPhase += dt * 1.2;
        this.breathPhase += dt * 1.5;
        if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;

        // Mouth animation
        this.mouthOpen = NJOX.Utils.lerp(this.mouthOpen, this.mouthTarget, dt * 8);
        if (this.mouthTarget > 0) this.mouthTarget = Math.max(0, this.mouthTarget - dt * 2);

        // Phase check
        const hpRatio = this.hp / this.maxHp;
        if (this.phase === 1 && hpRatio <= this.phaseThresholds[0]) {
            this.phase = 2;
            this.mouthTarget = 1;
            this.regenRate = this.maxHp * 0.008;
            this._initDeflectors(2);
            this._spawnShields(3, 4);
            this._spawnMinionWave(3, Math.max(2, Math.floor(this.maxHp * 0.07)));
        } else if (this.phase === 2 && hpRatio <= this.phaseThresholds[1]) {
            this.phase = 3;
            this.rage = true;
            this.mouthTarget = 1;
            this.regenRate = this.maxHp * 0.015;
            this._initDeflectors(3);
            this._spawnShields(4, 5);
            this._spawnMinionWave(4, Math.max(2, Math.floor(this.maxHp * 0.10)));
        }

        // HP regen (phase 2+, only when vuln closed)
        if (this.regenRate > 0 && !this.vulnOpen && this.alive) {
            // Cannot regen past previous phase threshold
            const cap = this.phase === 3
                ? this.maxHp * this.phaseThresholds[1] // cap at 33%
                : this.phase === 2
                    ? this.maxHp * this.phaseThresholds[0] // cap at 66%
                    : this.maxHp;
            this.hp = Math.min(cap, this.hp + this.regenRate * dt);
        }

        // Vulnerability window
        this.vulnTimer -= dt;
        this.vulnPhase += dt * 4;
        if (!this.vulnOpen) {
            if (this.vulnTimer <= 0) {
                this.vulnOpen  = true;
                this.vulnTimer = this.vulnDuration * (this.phase === 3 ? 0.7 : 1);
                const margin   = 24;
                this.vulnX     = this.x + margin + Math.random() * (this.w - margin * 2);
                this.vulnY     = this.y + margin + Math.random() * (this.h - margin * 2);
            }
        } else {
            if (this.vulnTimer <= 0) {
                this.vulnOpen  = false;
                this.vulnTimer = this.vulnCooldown * (this.phase === 3 ? 0.5 : 1);
            }
        }

        // Deflectors orbit
        const bcx = this.x + this.w / 2;
        const bcy = this.y + this.h / 2;
        for (const d of this.deflectors) {
            d.orbitAngle += d.orbitSpeed * dt;
            d.x = bcx + Math.cos(d.orbitAngle) * d.orbitRadius;
            d.y = bcy + Math.sin(d.orbitAngle) * d.orbitRadius;
            d.phase += dt * 3;
            // Phase 3 pulse
            if (this.phase === 3) {
                d.pulseTimer += dt;
                d.pulse = (d.pulseTimer % 3.0) < 0.5;
            }
        }

        // Defense ring timer
        this.defenseTimer -= dt;
        if (this.defenseTimer <= 0 && this.animState !== 'death' && this.defenseOrbs.length < 30) {
            this._emitDefenseOrbs();
            this.defenseTimer = 5 - this.phase * 0.5;
        }

        // Update defense orbs
        for (let i = this.defenseOrbs.length - 1; i >= 0; i--) {
            const orb = this.defenseOrbs[i];
            orb.x += orb.vx * dt;
            orb.y += orb.vy * dt;
            orb.life -= dt;
            if (orb.life <= 0 || orb.x < -20 || orb.x > NJOX.CANVAS_W + 20 ||
                orb.y < -20 || orb.y > NJOX.FLOOR_Y + 20) {
                this.defenseOrbs.splice(i, 1);
            }
        }

        // Beam attack update
        if (this.beam) {
            if (this.beam.chargeTimer > 0) {
                this.beam.chargeTimer -= dt;
                if (this.beam.chargeTimer <= 0) this.beam.active = true;
            } else if (this.beam.active) {
                this.beam.y += this.beam.dir * this.beam.sweepSpeed * dt;
                if (this.beam.secondY !== undefined) {
                    this.beam.secondY += this.beam.secondDir * this.beam.sweepSpeed * dt;
                }
                // Check if sweep is complete
                if (this.beam.y > NJOX.FLOOR_Y + 20 ||
                    (this.beam.secondY !== undefined && this.beam.secondY < this.y)) {
                    this.beam = null;
                }
            }
        }

        // Shield spawn animation
        for (const sh of this.shields) {
            if (sh.spawnScale < 1) sh.spawnScale = Math.min(1, sh.spawnScale + dt * 4);
            if (sh.flash > 0) sh.flash -= dt;
        }

        // Chest hit flash
        if (this.chest && this.chest.hitFlash > 0) this.chest.hitFlash -= dt;

        // Smooth row advancement
        if (Math.abs(this.y - this.targetY) > 0.5) {
            this.y = NJOX.Utils.lerp(this.y, this.targetY, dt * 8);
        }
    }

    _spawnMinionWave(count, minionHp) {
        if (!minionHp) minionHp = Math.max(1, Math.floor(this.maxHp * 0.12));
        const cx = this.x + this.w / 2;
        for (let i = 0; i < count; i++) {
            const mx = cx + (i - (count - 1) / 2) * 68;
            const my = this.y + this.h + 18;
            const m  = new NJOX.BasicMonster(mx - NJOX.CELL_SIZE / 2 + 2, my, minionHp);
            m.targetY = my;
            m.isStressed = true;
            this.minions.push(m);
        }
    }

    _emitDefenseOrbs() {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const count = 8 + this.phase * 4;
        const speed = 120 + this.phase * 30;
        this.mouthTarget = 0.6;
        this.attackFlashTimer = 0.2;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            this.defenseOrbs.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 5, life: 2.5,
            });
        }
    }

    // ── onHit — NOW respects damageMultiplier ───────────────────────
    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;
        this.hitFlashTimer = 0.1;
        this.mouthTarget   = 0.4;

        let dmg = Math.max(1, Math.round(damageMultiplier));
        if (this.vulnOpen) {
            const dx = ball.x - this.vulnX;
            const dy = ball.y - this.vulnY;
            if (dx * dx + dy * dy <= this.vulnRadius * this.vulnRadius) {
                dmg = Math.round(damageMultiplier * 3);
                this.vulnHitFlash = 0.25;
            }
        }
        this.hp -= dmg;

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.animState = 'death';
            this.deathTimer = 1.0;
            return { absorbed: false, killed: true, spawns: [], vulnHit: dmg > damageMultiplier };
        }
        return { absorbed: false, killed: false, vulnHit: dmg > damageMultiplier };
    }

    // ── checkMechanics ──────────────────────────────────────────────
    checkMechanics(balls, game) {
        // Deflectors: gravitational pull on balls
        for (const d of this.deflectors) {
            const str = d.pulse ? d.pullStrength * 3 : d.pullStrength;
            for (const ball of balls) {
                if (!ball.active) continue;
                const dx = d.x - ball.x;
                const dy = d.y - ball.y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);
                if (dist < d.pullRadius && dist > 5) {
                    const force = str / distSq;
                    ball.vx += (dx / dist) * force;
                    ball.vy += (dy / dist) * force;
                }
            }
        }

        // Shields: bounce balls, take damage
        for (let i = this.shields.length - 1; i >= 0; i--) {
            const sh = this.shields[i];
            if (sh.spawnScale < 0.5) continue; // still spawning
            for (const ball of balls) {
                if (!ball.active) continue;
                const col = NJOX.Utils.circleVsRect(
                    ball.x, ball.y, ball.radius,
                    sh.x, sh.y, sh.w * sh.spawnScale, sh.h
                );
                if (col) {
                    sh.hp--;
                    sh.flash = 0.1;
                    // Bounce ball off shield
                    if (col.nx !== undefined) {
                        ball.x += col.nx * col.overlap;
                        ball.y += col.ny * col.overlap;
                        const dot = NJOX.Utils.dot(ball.vx, ball.vy, col.nx, col.ny);
                        ball.vx -= 2 * dot * col.nx;
                        ball.vy -= 2 * dot * col.ny;
                    }
                    if (sh.hp <= 0) {
                        this.shields.splice(i, 1);
                    }
                    break;
                }
            }
        }

        // Defense orbs: destroy balls on contact
        for (const orb of this.defenseOrbs) {
            for (const ball of balls) {
                if (!ball.active) continue;
                const dist = NJOX.Utils.distance(ball.x, ball.y, orb.x, orb.y);
                if (dist < orb.radius + ball.radius) {
                    ball.active = false;
                }
            }
        }

        // Beam: deactivate balls in sweep path
        if (this.beam && this.beam.active) {
            const hw = this.beam.width / 2;
            for (const ball of balls) {
                if (!ball.active) continue;
                if (ball.y > this.beam.y - hw && ball.y < this.beam.y + hw) {
                    ball.active = false;
                }
                // Second beam (phase 3)
                if (this.beam.secondY !== undefined) {
                    if (ball.y > this.beam.secondY - hw && ball.y < this.beam.secondY + hw) {
                        ball.active = false;
                    }
                }
            }
        }

        // Chest: check ball collision
        if (this.chest && this.chest.alive) {
            for (const ball of balls) {
                if (!ball.active) continue;
                const col = NJOX.Utils.circleVsRect(
                    ball.x, ball.y, ball.radius,
                    this.chest.x, this.chest.y, this.chest.w, this.chest.h
                );
                if (col) {
                    this.chest.hp--;
                    this.chest.hitFlash = 0.1;
                    if (this.chest.hp <= 0) {
                        this.chest.alive = false;
                        game.gold += this.chest.goldReward;
                        game.collectibles.push({
                            x: this.chest.x + this.chest.w / 2,
                            y: this.chest.y,
                            type: 'gold',
                            amount: this.chest.goldReward,
                            timer: 2.0,
                        });
                    }
                    if (col.nx !== undefined) {
                        ball.x += col.nx * col.overlap;
                        ball.y += col.ny * col.overlap;
                        const dot = NJOX.Utils.dot(ball.vx, ball.vy, col.nx, col.ny);
                        ball.vx -= 2 * dot * col.nx;
                        ball.vy -= 2 * dot * col.ny;
                    }
                    break;
                }
            }
        }
    }

    // ── Render ───────────────────────────────────────────────────────
    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = this.getColor();
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.save();

        // Death animation
        if (this.animState === 'death') {
            const t = this.deathTimer / 1.0;
            ctx.globalAlpha = t;
            ctx.translate(cx, cy);
            ctx.scale(1 + (1 - t) * 0.3, 1 + (1 - t) * 0.3);
            ctx.rotate((1 - t) * 0.3);
            ctx.translate(-cx, -cy);
        }

        // Entrance
        if (this.entranceTimer > 0) {
            const t = this.entranceTimer / 1.0;
            ctx.globalAlpha = 1 - t;
            ctx.translate(0, -100 * t);
        }

        // Breath
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.015;
        ctx.translate(cx, cy);
        ctx.scale(breathScale, breathScale);
        ctx.rotate(Math.sin(this.swayPhase) * 0.02);
        ctx.translate(-cx, -cy);

        // Rage glow
        if (this.rage) {
            ctx.shadowColor = NJOX.COLORS.BOSS_RAGE;
            ctx.shadowBlur = 20 + Math.sin(this.swayPhase * 3) * 10;
        }

        // Body
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#fff' : color;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 16);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = this.rage ? NJOX.COLORS.BOSS_RAGE : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = this.rage ? 3 : 2;
        ctx.stroke();

        // Attack flash
        if (this.attackFlashTimer > 0) {
            this.attackFlashTimer -= 0.016;
            ctx.fillStyle = `rgba(255,255,255,${this.attackFlashTimer})`;
            NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 16);
            ctx.fill();
        }

        // Eyes with tracking
        const eyeSpacing = this.w * 0.18;
        const eyeY = cy - this.h * 0.1;
        const eyeR = 8;
        const lookDx = NJOX.Utils.clamp((this.trackX - cx) / 200, -1, 1);

        ctx.fillStyle = '#fff';
        const eyeH = eyeR * 2 * (1 - this.blinkState * 0.9);
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, eyeY, eyeR, Math.max(eyeH / 2, 1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, eyeY, eyeR, Math.max(eyeH / 2, 1), 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.blinkState < 0.7) {
            ctx.fillStyle = this.rage ? '#ff0033' : '#1a1a2e';
            const pupilR = eyeR * 0.55;
            ctx.beginPath();
            ctx.arc(cx - eyeSpacing + lookDx * 3, eyeY, pupilR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + eyeSpacing + lookDx * 3, eyeY, pupilR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Angry eyebrows
        if (this.rage || this.phase >= 2) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx - eyeSpacing - eyeR, eyeY - eyeR * 1.8);
            ctx.lineTo(cx - eyeSpacing + eyeR, eyeY - eyeR * 1.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + eyeSpacing + eyeR, eyeY - eyeR * 1.8);
            ctx.lineTo(cx + eyeSpacing - eyeR, eyeY - eyeR * 1.1);
            ctx.stroke();
        }

        // Mouth
        const mouthY = cy + this.h * 0.2;
        const mouthW = this.w * 0.25;
        if (this.mouthOpen > 0.1) {
            ctx.fillStyle = '#2a0000';
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, mouthW, mouthW * 0.7 * this.mouthOpen, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            if (this.mouthOpen > 0.3) {
                ctx.fillStyle = '#fff';
                const teethY = mouthY - mouthW * 0.5 * this.mouthOpen;
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.moveTo(cx + i * 8 - 3, teethY);
                    ctx.lineTo(cx + i * 8, teethY + 5);
                    ctx.lineTo(cx + i * 8 + 3, teethY);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        } else {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, mouthY + mouthW * 0.3, mouthW, -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();
        }

        ctx.restore();

        // === Render boss mechanics (outside save/restore) ===

        // Deflectors — orbiting purple energy spheres
        for (const d of this.deflectors) {
            ctx.save();
            const glow = d.pulse ? 28 : 12;
            ctx.shadowColor = '#9900ff';
            ctx.shadowBlur = glow;
            const r = d.pulse ? 11 : 8;
            // Core
            const dg = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 2);
            dg.addColorStop(0, d.pulse ? 'rgba(200,80,255,0.95)' : 'rgba(140,40,220,0.8)');
            dg.addColorStop(0.5, 'rgba(80,0,160,0.4)');
            dg.addColorStop(1, 'rgba(40,0,80,0)');
            ctx.fillStyle = dg;
            ctx.beginPath();
            ctx.arc(d.x, d.y, r * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = d.pulse ? '#cc66ff' : '#8833cc';
            ctx.beginPath();
            ctx.arc(d.x, d.y, r * 0.5, 0, Math.PI * 2);
            ctx.fill();
            // Spinning ring
            ctx.strokeStyle = `rgba(180,80,255,${d.pulse ? 0.9 : 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(d.x, d.y, r + Math.sin(d.phase) * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Shields — translucent blue bars
        for (const sh of this.shields) {
            ctx.save();
            const sc = sh.spawnScale;
            const sw = sh.w * sc;
            const sx = sh.x + (sh.w - sw) / 2;
            ctx.fillStyle = sh.flash > 0 ? '#ffffff' : `rgba(60,120,255,${0.4 + 0.3 * (sh.hp / sh.maxHp)})`;
            ctx.shadowColor = '#4488ff';
            ctx.shadowBlur = 8;
            NJOX.Utils.roundRect(ctx, sx, sh.y, sw, sh.h, 4);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(120,180,255,0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // HP number
            if (sc > 0.7) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sh.hp, sx + sw / 2, sh.y + sh.h / 2);
            }
            ctx.restore();
        }

        // Defense orbs
        for (const orb of this.defenseOrbs) {
            ctx.save();
            ctx.fillStyle = this.phase === 3 ? '#ff4444' : this.phase === 2 ? '#ffaa00' : '#44aaff';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Vulnerability window
        if (this.vulnOpen && this.animState !== 'death') {
            const vp = this.vulnPhase;
            const pulse = 0.6 + Math.abs(Math.sin(vp)) * 0.4;
            const r = this.vulnRadius;
            ctx.save();
            const grad = ctx.createRadialGradient(this.vulnX, this.vulnY, 0, this.vulnX, this.vulnY, r * 2.5);
            grad.addColorStop(0,   `rgba(255,220,0,${pulse * 0.9})`);
            grad.addColorStop(0.4, `rgba(255,140,0,${pulse * 0.5})`);
            grad.addColorStop(1,   'rgba(255,80,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.vulnX, this.vulnY, r * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 18;
            ctx.fillStyle = `rgba(255,230,0,${pulse})`;
            ctx.beginPath();
            ctx.arc(this.vulnX, this.vulnY, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('3×', this.vulnX, this.vulnY + r + 11);
            if (this.vulnHitFlash > 0) {
                this.vulnHitFlash -= 0.016;
                ctx.fillStyle = `rgba(255,255,255,${this.vulnHitFlash * 3})`;
                ctx.beginPath();
                ctx.arc(this.vulnX, this.vulnY, r * 1.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else if (!this.vulnOpen && this.animState !== 'death') {
            const remain = this.vulnTimer;
            if (remain < 1.5) {
                const alpha = (1.5 - remain) / 1.5 * 0.3;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(this.vulnX || cx, this.vulnY || cy, this.vulnRadius * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Beam attack
        if (this.beam) {
            ctx.save();
            if (!this.beam.active) {
                // Charge telegraph — pulsing red line
                const pulse = 0.3 + 0.4 * Math.abs(Math.sin(this.beam.chargeTimer * 8));
                ctx.strokeStyle = `rgba(255,40,40,${pulse})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, this.beam.y);
                ctx.lineTo(NJOX.CANVAS_W, this.beam.y);
                ctx.stroke();
                // Second beam telegraph
                if (this.beam.secondY !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(0, this.beam.secondY);
                    ctx.lineTo(NJOX.CANVAS_W, this.beam.secondY);
                    ctx.stroke();
                }
            } else {
                // Active beam sweep
                const hw = this.beam.width / 2;
                ctx.shadowColor = '#ff2200';
                ctx.shadowBlur = 14;
                const bg = ctx.createLinearGradient(0, this.beam.y - hw, 0, this.beam.y + hw);
                bg.addColorStop(0, 'rgba(255,60,0,0)');
                bg.addColorStop(0.3, 'rgba(255,80,20,0.8)');
                bg.addColorStop(0.5, 'rgba(255,200,100,1)');
                bg.addColorStop(0.7, 'rgba(255,80,20,0.8)');
                bg.addColorStop(1, 'rgba(255,60,0,0)');
                ctx.fillStyle = bg;
                ctx.fillRect(0, this.beam.y - hw, NJOX.CANVAS_W, this.beam.width);
                // Second beam
                if (this.beam.secondY !== undefined) {
                    const bg2 = ctx.createLinearGradient(0, this.beam.secondY - hw, 0, this.beam.secondY + hw);
                    bg2.addColorStop(0, 'rgba(255,60,0,0)');
                    bg2.addColorStop(0.3, 'rgba(255,80,20,0.8)');
                    bg2.addColorStop(0.5, 'rgba(255,200,100,1)');
                    bg2.addColorStop(0.7, 'rgba(255,80,20,0.8)');
                    bg2.addColorStop(1, 'rgba(255,60,0,0)');
                    ctx.fillStyle = bg2;
                    ctx.fillRect(0, this.beam.secondY - hw, NJOX.CANVAS_W, this.beam.width);
                }
                ctx.shadowBlur = 0;
            }
            ctx.restore();
        }

        // Treasure chest
        if (this.chest && this.chest.alive) {
            const ch = this.chest;
            ctx.save();
            ctx.fillStyle = ch.hitFlash > 0 ? '#fff' : '#8B4513';
            NJOX.Utils.roundRect(ctx, ch.x, ch.y, ch.w, ch.h, 4);
            ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(ch.x + 2, ch.y + ch.h * 0.4, ch.w - 4, 6);
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(ch.x + ch.w / 2, ch.y + ch.h * 0.5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch.hp, ch.x + ch.w / 2, ch.y + ch.h - 8);
            ctx.restore();
        }
    }
};
