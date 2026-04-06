window.NJOX = window.NJOX || {};

NJOX.DirectionalEater = class DirectionalEater extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.EATER);
        this.mouthOpenAmount = 0;
        this.absorbing = false;
        this._absorbCooldown = 0; // prevent absorbing multiple balls per shot
    }

    getColor() {
        return NJOX.COLORS.EATER;
    }

    getLabel() {
        return 'Eater';
    }

    update(dt) {
        super.update(dt);
        if (this._absorbCooldown > 0) this._absorbCooldown -= dt;
        // Animate mouth
        if (this.absorbing) {
            this.mouthOpenAmount = NJOX.Utils.lerp(this.mouthOpenAmount, 1, dt * 10);
            this.absorbing = false; // reset each frame
        } else {
            this.mouthOpenAmount = NJOX.Utils.lerp(this.mouthOpenAmount, 0, dt * 5);
        }
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;

        if (face === 'top' && this._absorbCooldown <= 0) {
            // Absorb ONE ball, then bounce the rest for this shot
            this._absorbCooldown = 1.5;
            this.hp -= 0.5 * damageMultiplier;
            this.absorbing = true;
            this.hitFlashTimer = 0.08;
            this.animState = 'hit';

            if (this.hp <= 0) {
                this.hp = 0;
                this.alive = false;
                this.animState = 'death';
                this.deathTimer = 0.3;
                return { absorbed: true, killed: true, spawns: this.onDeath() };
            }
            return { absorbed: true, killed: false };
        } else {
            const damage = 2 * damageMultiplier;
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
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = this.getColor();
        ctx.save();

        // Death animation
        if (this.animState === 'death') {
            const t = this.deathTimer / 0.3;
            ctx.globalAlpha = t;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(t, t);
            ctx.translate(-cx, -cy);
        }

        // Breath
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.008;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(breathScale, breathScale);
        ctx.rotate(Math.sin(this.swayPhase) * 0.01);
        ctx.translate(-cx, -cy);

        // Body
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#fff' : color;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arrow indicator on top (front face)
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(cx - 6, this.y + 6);
        ctx.lineTo(cx, this.y + 2);
        ctx.lineTo(cx + 6, this.y + 6);
        ctx.closePath();
        ctx.fill();

        // Face — expression + mouth open
        NJOX.Renderer.drawFace(ctx, cx, cy, this.w, this.h, {
            blinkPhase: this.blinkState,
            mouthOpen: Math.max(this.mouthOpenAmount, this.expression === 'surprised' ? 0.5 : 0),
            expression: this.expression,
            color: '#fff',
            scale: 1,
        });

        // HP badge
        this._renderHP(ctx);

        ctx.restore();
    }
};
