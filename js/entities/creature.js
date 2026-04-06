window.NJOX = window.NJOX || {};

NJOX.Creature = class Creature {
    constructor(x, y, hp, type) {
        this.x = x;
        this.y = y;
        this.w = NJOX.CELL_SIZE - 4;
        this.h = NJOX.CELL_SIZE - 4;
        this.hp = hp;
        this.maxHp = hp;
        this.type = type || NJOX.CREATURE_TYPES.BASIC;
        this.alive = true;

        // Animation
        this.animState = 'idle'; // idle, hit, death
        this.hitFlashTimer = 0;
        this.deathTimer = 0;
        this.facePhase = Math.random() * Math.PI * 2;
        this.blinkTimer = Math.random() * 3;
        this.blinkState = 0; // 0 = open, ramps to 1 = closed
        this.swayPhase = Math.random() * Math.PI * 2;
        this.breathPhase = Math.random() * Math.PI * 2;

        // Drift
        this.originX = x;
        this.driftDir = Math.random() > 0.5 ? 1 : -1;
        this.driftSpeed = 0;
        this.driftRange = 0;

        // Frozen state (ice ball)
        this.frozen = false;

        // Stressed state — applied by StressSpreader each round
        // isStressed: true → red overlay + flames on head + boosted HP
        this.isStressed      = false;
        this.stressFlamePhase = Math.random() * Math.PI * 2;

        // Expression state — updated each frame
        this.expression = 'normal'; // 'normal' | 'angry' | 'scared' | 'surprised'

        // Target position for row advancement (smooth movement)
        this.targetY = y;
    }

    update(dt) {
        // Blink cycle
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
            this.blinkState = 1;
            this.blinkTimer = 2 + Math.random() * 3;
        }
        if (this.blinkState > 0) {
            this.blinkState -= dt * 8;
            if (this.blinkState < 0) this.blinkState = 0;
        }

        // Sway animation
        this.swayPhase += dt * 1.5;
        this.breathPhase += dt * 2;

        // Stress flame animation
        if (this.isStressed) this.stressFlamePhase += dt * 5.5;

        // Hit flash decay
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) {
                this.animState = 'idle';
            }
        }

        // Expression — updates every frame based on HP ratio and hit state
        const hpRatio = this.hp / this.maxHp;
        if (this.hitFlashTimer > 0.06) {
            this.expression = 'surprised';
        } else if (hpRatio < 0.2) {
            this.expression = 'scared';
        } else if (hpRatio < 0.5) {
            this.expression = 'angry';
        } else {
            this.expression = 'normal';
        }

        // Death animation
        if (this.animState === 'death') {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.alive = false;
            }
        }

        // Drift disabled — causes visual jitter at high framerates

        // Smooth row advancement
        if (Math.abs(this.y - this.targetY) > 0.5) {
            this.y = NJOX.Utils.lerp(this.y, this.targetY, dt * 8);
        } else {
            this.y = this.targetY;
        }
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;

        const damage = 1 * damageMultiplier;
        this.hp -= damage;
        this.hitFlashTimer = 0.12;
        this.animState = 'hit';

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.animState = 'death';
            this.deathTimer = 0.3;
            return { absorbed: false, killed: true, spawns: this.onDeath() };
        }

        return { absorbed: false, killed: false };
    }

    onDeath() {
        // Override in subclasses to spawn new creatures
        return [];
    }

    advanceRow() {
        if (this.frozen) {
            // frozenTurns destekli çözülme (ice_storm kartı ile 2 round)
            this.frozenTurns = (this.frozenTurns || 1) - 1;
            if (this.frozenTurns <= 0) this.frozen = false;
            return; // bu round ilerlemez
        }
        this.targetY += NJOX.CELL_SIZE * (NJOX.ROW_ADVANCE || 0.5);
        this.originX = this.x;
    }

    getColor() {
        return NJOX.COLORS.BASIC;
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = this.getColor();

        ctx.save();

        // Death animation — shrink and fade
        if (this.animState === 'death') {
            const t = this.deathTimer / 0.3;
            ctx.globalAlpha = t;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(t, t);
            ctx.translate(-cx, -cy);
        }

        // Breath scale (subtle to avoid jitter between adjacent creatures)
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.008;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.translate(cx, cy);
        ctx.scale(breathScale, breathScale);
        // Sway (very subtle)
        ctx.rotate(Math.sin(this.swayPhase) * 0.01);
        ctx.translate(-cx, -cy);

        // Glow effect behind creature
        ctx.shadowColor = color;
        ctx.shadowBlur = this.hitFlashTimer > 0 ? 15 : 4;

        // Body
        if (this.hitFlashTimer > 0) {
            ctx.fillStyle = '#fff';
        } else {
            ctx.fillStyle = color;
        }
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 10);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Body border — brighter
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Face — expression driven by HP ratio
        NJOX.Renderer.drawFace(ctx, cx, cy, this.w, this.h, {
            blinkPhase: this.blinkState,
            mouthOpen: this.expression === 'surprised' ? 0.6 : 0,
            expression: this.expression,
            color: '#fff',
            scale: 1,
        });

        // HP badge
        this._renderHP(ctx);

        // Frozen overlay
        if (this.frozen) {
            ctx.fillStyle = 'rgba(130,220,255,0.3)';
            NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 8);
            ctx.fill();
            ctx.strokeStyle = NJOX.COLORS.ICE;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Stressed overlay — red tint + flames on head
        if (this.isStressed) this._renderStressedOverlay(ctx);

        ctx.restore();
    }

    // Renders the visual "stressed" state: red tint + orange head flames
    _renderStressedOverlay(ctx) {
        const cx = this.x + this.w / 2;
        const t  = this.stressFlamePhase;

        // Subtle red body tint
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ff2200';
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 10);
        ctx.fill();
        ctx.restore();

        // Pulsing red border
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.35 * Math.abs(Math.sin(t * 0.8));
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth   = 2;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 10);
        ctx.stroke();
        ctx.restore();

        // Small orange-yellow flames above HP badge (3 tongues)
        for (let i = 0; i < 3; i++) {
            const fx = cx + (i - 1) * 9;
            const fh = 7 + Math.sin(t + i * 1.4) * 3.5;
            const fw = 3.5;
            const fy = this.y - 1; // just above creature top

            ctx.save();
            const grad = ctx.createLinearGradient(fx, fy - fh, fx, fy);
            grad.addColorStop(0,   'rgba(255,200,0,0)');
            grad.addColorStop(0.3, 'rgba(255,160,0,0.75)');
            grad.addColorStop(1,   'rgba(255,80,0,0.85)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(fx, fy - fh / 2, fw, fh / 2 + 1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // HP badge — dark pill on FOREHEAD (top of creature), always readable
    _renderHP(ctx) {
        const cx = this.x + this.w / 2;
        const hpStr = '' + Math.ceil(this.hp);
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(hpStr).width;
        const bw = tw + 10;
        const bh = 14;
        const bx = cx - bw / 2;
        const by = this.y + 2; // forehead — top of creature
        // Dark pill background
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        NJOX.Utils.roundRect(ctx, bx, by, bw, bh, 5);
        ctx.fill();
        // White text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(hpStr, cx, by + bh / 2);
    }

    // Type label for HUD
    getLabel() {
        return 'Monster';
    }

    getIcon() {
        return this.getColor();
    }
};
