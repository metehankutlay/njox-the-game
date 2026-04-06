window.NJOX = window.NJOX || {};

NJOX.Boss = class Boss extends NJOX.Creature {
    constructor(level, name) {
        const bossHp = 35; // requires 35 hits
        const x = (NJOX.CANVAS_W - 150) / 2;
        const y = NJOX.GRID_TOP + 20;
        super(x, y, bossHp, 'boss');
        this.w = 150;
        this.h = 120;
        this.name = name || 'STRESS';
        this.targetY = y;

        // Phase system
        this.phase = 1;
        this.phaseThresholds = [0.66, 0.33];

        // Compatibility — main.js references boss.minions
        this.minions = [];

        // Boss mechanics
        this.blackHole = null;
        this.defenseOrbs = [];
        this.defenseTimer = 5;
        this.chest = null;
        this.rage = false;

        // Vulnerability window — döngüsel zayıf nokta, o an 3x hasar
        this.vulnTimer      = 6.0;   // saniye sayacı: kapanık → açık → kapanık
        this.vulnOpen       = false;  // true iken parlayan nokta aktif → 3x hasar
        this.vulnDuration   = 2.5;   // açık kalma süresi
        this.vulnCooldown   = 5.5;   // sonraki açılmaya kadar bekleme
        this.vulnPhase      = 0;     // görsel animasyon fazı
        this.vulnX          = 0;     // zayıf nokta merkez X (boss içi)
        this.vulnY          = 0;     // zayıf nokta merkez Y
        this.vulnRadius     = 18;    // çarpışma yarıçapı

        // Visual states
        this.mouthOpen = 0;
        this.mouthTarget = 0;
        this.entranceTimer = 0;
        this.attackFlashTimer = 0;
        this.trackX = NJOX.CANVAS_W / 2;

        // Initialize mechanics
        this._initBlackHole();
        this._initChest();
    }

    _initBlackHole() {
        // Static object near boss that absorbs balls
        const side = Math.random() > 0.5 ? 1 : -1;
        this.blackHole = {
            x: this.x + this.w / 2 + side * 100,
            y: this.y + this.h / 2 + 30,
            radius: 20,
            pullRadius: 60,
            active: true,
            phase: 0, // animation phase
        };
        // Keep in bounds
        this.blackHole.x = NJOX.Utils.clamp(this.blackHole.x, 40, NJOX.CANVAS_W - 40);
    }

    _initChest() {
        // Treasure chest in a random top corner
        const isLeft = Math.random() > 0.5;
        this.chest = {
            x: isLeft ? 20 : NJOX.CANVAS_W - 60,
            y: NJOX.GRID_TOP + 10,
            w: 40,
            h: 35,
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

    update(dt) {
        // Death animation — decrement timer so TURN_END can detect it
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

        // Phase check — her phase geçişinde minyon dalgası
        const hpRatio = this.hp / this.maxHp;
        if (this.phase === 1 && hpRatio <= this.phaseThresholds[0]) {
            this.phase = 2;
            this.mouthTarget = 1;
            this._spawnMinionWave(2);   // Phase 2: 2 küçük minyon
        } else if (this.phase === 2 && hpRatio <= this.phaseThresholds[1]) {
            this.phase = 3;
            this.rage = true;
            this.mouthTarget = 1;
            this._spawnMinionWave(3);   // Phase 3: 3 minyon + rage
        }

        // Vulnerability window — her vulnCooldown saniyede bir açılır
        this.vulnTimer  -= dt;
        this.vulnPhase  += dt * 4;
        if (!this.vulnOpen) {
            if (this.vulnTimer <= 0) {
                // Aç
                this.vulnOpen  = true;
                this.vulnTimer = this.vulnDuration * (this.phase === 3 ? 0.7 : 1);
                // Rastgele konumlandır — boss gövdesi içinde
                const margin  = 24;
                this.vulnX    = this.x + margin + Math.random() * (this.w - margin * 2);
                this.vulnY    = this.y + margin + Math.random() * (this.h - margin * 2);
            }
        } else {
            if (this.vulnTimer <= 0) {
                // Kapat
                this.vulnOpen  = false;
                // Phase 3'te daha sık açılır
                this.vulnTimer = this.vulnCooldown * (this.phase === 3 ? 0.5 : 1);
            }
        }

        // Black hole animation
        if (this.blackHole && this.blackHole.active) {
            this.blackHole.phase += dt * 3;
        }

        // Defense ring timer (max 30 orbs to prevent lag)
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

        // Chest hit flash
        if (this.chest && this.chest.hitFlash > 0) {
            this.chest.hitFlash -= dt;
        }

        // Smooth row advancement (from creature base)
        if (Math.abs(this.y - this.targetY) > 0.5) {
            this.y = NJOX.Utils.lerp(this.y, this.targetY, dt * 8);
        }
    }

    // Belirli sayıda BasicMonster minyonu boss'un altına yerleştirir
    _spawnMinionWave(count) {
        const cx = this.x + this.w / 2;
        const minionHp = Math.max(1, Math.floor(this.maxHp * 0.12));
        for (let i = 0; i < count; i++) {
            const mx = cx + (i - (count - 1) / 2) * 68;
            const my = this.y + this.h + 18;
            const m  = new NJOX.BasicMonster(mx - NJOX.CELL_SIZE / 2 + 2, my, minionHp);
            m.targetY = my;
            // Minyon görsel kimliği: stresli
            m.isStressed = true;
            this.minions.push(m);
        }
    }

    _emitDefenseOrbs() {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const count = 8 + this.phase * 4; // 12, 16, 20 orbs
        const speed = 120 + this.phase * 30;

        this.mouthTarget = 0.6;
        this.attackFlashTimer = 0.2;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            this.defenseOrbs.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 5,
                life: 2.5,
            });
        }
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;
        this.hitFlashTimer = 0.1;
        this.mouthTarget   = 0.4;

        // Vulnerability window: top zayıf noktaya isabet ediyorsa 3x hasar
        let dmg = 1;
        if (this.vulnOpen) {
            const dx = ball.x - this.vulnX;
            const dy = ball.y - this.vulnY;
            if (dx * dx + dy * dy <= this.vulnRadius * this.vulnRadius) {
                dmg = 3;
                // Zayıf noktanın üzerine hit efekti için kısa flash
                this.vulnHitFlash = 0.25;
            }
        }
        this.hp -= dmg;

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.animState = 'death';
            this.deathTimer = 1.0;
            return { absorbed: false, killed: true, spawns: [], vulnHit: dmg === 3 };
        }
        return { absorbed: false, killed: false, vulnHit: dmg === 3 };
    }

    // Check if balls interact with boss mechanics
    checkMechanics(balls, game) {
        // Black hole: absorb nearby balls
        if (this.blackHole && this.blackHole.active) {
            for (const ball of balls) {
                if (!ball.active) continue;
                const dist = NJOX.Utils.distance(ball.x, ball.y, this.blackHole.x, this.blackHole.y);

                // Pull effect (slow down balls near black hole)
                if (dist < this.blackHole.pullRadius) {
                    const pullStrength = 0.98;
                    ball.vx *= pullStrength;
                    ball.vy *= pullStrength;
                }

                // Absorb
                if (dist < this.blackHole.radius + ball.radius) {
                    ball.active = false;
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

        // Rage mode: slight random perturbation (not every frame — every 10th)
        if (this.rage && Math.random() < 0.1) {
            for (const ball of balls) {
                if (!ball.active) continue;
                ball.vx += (Math.random() - 0.5) * 15;
                ball.vy += (Math.random() - 0.5) * 15;
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
                    // Bounce ball off chest
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

        // === Render boss mechanics ===

        // Black hole
        if (this.blackHole && this.blackHole.active) {
            const bh = this.blackHole;
            ctx.save();
            // Swirl effect
            const gradient = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.radius * 2);
            gradient.addColorStop(0, 'rgba(30,0,60,0.9)');
            gradient.addColorStop(0.5, 'rgba(80,0,120,0.4)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, bh.radius * 2, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = '#0a0020';
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
            ctx.fill();

            // Spinning ring
            ctx.strokeStyle = 'rgba(180,80,255,0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bh.x, bh.y, bh.radius + 5 + Math.sin(bh.phase) * 3, 0, Math.PI * 2);
            ctx.stroke();
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

        // Vulnerability window — parlayan zayıf nokta
        if (this.vulnOpen && this.animState !== 'death') {
            const vp    = this.vulnPhase;
            const pulse = 0.6 + Math.abs(Math.sin(vp)) * 0.4;
            const r     = this.vulnRadius;
            ctx.save();

            // Dış halka parıltısı
            const grad = ctx.createRadialGradient(
                this.vulnX, this.vulnY, 0,
                this.vulnX, this.vulnY, r * 2.5
            );
            grad.addColorStop(0,   `rgba(255,220,0,${pulse * 0.9})`);
            grad.addColorStop(0.4, `rgba(255,140,0,${pulse * 0.5})`);
            grad.addColorStop(1,   'rgba(255,80,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.vulnX, this.vulnY, r * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // İç parlak çekirdek
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur  = 18;
            ctx.fillStyle   = `rgba(255,230,0,${pulse})`;
            ctx.beginPath();
            ctx.arc(this.vulnX, this.vulnY, r * 0.55, 0, Math.PI * 2);
            ctx.fill();

            // "3×" etiketi
            ctx.shadowBlur  = 0;
            ctx.fillStyle   = '#fff';
            ctx.font        = 'bold 11px monospace';
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('3×', this.vulnX, this.vulnY + r + 11);

            // Hit flash varsa beyaz parlaması
            if (this.vulnHitFlash > 0) {
                this.vulnHitFlash -= 0.016;
                ctx.fillStyle = `rgba(255,255,255,${this.vulnHitFlash * 3})`;
                ctx.beginPath();
                ctx.arc(this.vulnX, this.vulnY, r * 1.4, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        } else if (!this.vulnOpen && this.animState !== 'death') {
            // Kapalı ama yaklaşıyor — soluk nabız (uyarı)
            const remain = this.vulnTimer;
            if (remain < 1.5) {
                const alpha = (1.5 - remain) / 1.5 * 0.3;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle   = '#ffd700';
                ctx.beginPath();
                ctx.arc(this.vulnX || this.x + this.w / 2, this.vulnY || this.y + this.h / 2,
                        this.vulnRadius * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Treasure chest
        if (this.chest && this.chest.alive) {
            const ch = this.chest;
            ctx.save();
            // Chest body
            ctx.fillStyle = ch.hitFlash > 0 ? '#fff' : '#8B4513';
            NJOX.Utils.roundRect(ctx, ch.x, ch.y, ch.w, ch.h, 4);
            ctx.fill();
            // Gold stripe
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(ch.x + 2, ch.y + ch.h * 0.4, ch.w - 4, 6);
            // Lock
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(ch.x + ch.w / 2, ch.y + ch.h * 0.5, 5, 0, Math.PI * 2);
            ctx.fill();
            // HP
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch.hp, ch.x + ch.w / 2, ch.y + ch.h - 8);
            ctx.restore();
        }
    }
};
