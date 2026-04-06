window.NJOX = window.NJOX || {};

NJOX.ReactiveCreature = class ReactiveCreature extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.REACTIVE);
        this.hitCount = 0;
        this.mutationThreshold = 3;
        this.mutated = false;
        this.driftSpeed = 3;
        this.driftRange = 5;
    }

    getColor() {
        return this.mutated ? NJOX.COLORS.REACTIVE_MUTATED : NJOX.COLORS.REACTIVE;
    }

    getLabel() {
        return 'Reactive';
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (this.animState === 'death') return null;

        this.hitCount++;

        // Check for mutation
        if (!this.mutated && this.hitCount >= this.mutationThreshold) {
            this.mutated = true;
            this.driftSpeed = 6;
            this.driftRange = 8;
        }

        return super.onHit(ball, face, damageMultiplier);
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = this.getColor();
        ctx.save();

        // Death animation
        if (this.animState === 'death') {
            const t = this.deathTimer / 0.3;
            ctx.globalAlpha = t;
            const ccx = this.x + this.w / 2;
            const ccy = this.y + this.h / 2;
            ctx.translate(ccx, ccy);
            ctx.scale(t, t);
            ctx.translate(-ccx, -ccy);
        }

        // Breath + mutation vibration
        let breathScale = 1 + Math.sin(this.breathPhase) * 0.008;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.translate(cx, cy);
        if (this.mutated) {
            breathScale += 0.01;
        }
        ctx.scale(breathScale, breathScale);
        ctx.rotate(Math.sin(this.swayPhase) * (this.mutated ? 0.03 : 0.01));
        ctx.translate(-cx, -cy);

        // Body
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#fff' : color;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 8);
        ctx.fill();

        // Mutation glow
        if (this.mutated) {
            ctx.shadowColor = NJOX.COLORS.REACTIVE_MUTATED;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = NJOX.COLORS.REACTIVE_MUTATED;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Face
        NJOX.Renderer.drawFace(ctx, cx, cy, this.w, this.h, {
            blinkPhase: this.blinkState,
            mouthOpen: this.animState === 'hit' ? 0.5 : 0,
            angry: this.mutated,
            color: '#fff',
            scale: 1,
        });

        // HP badge
        this._renderHP(ctx);

        // Hit count indicator (small dots)
        if (!this.mutated) {
            for (let i = 0; i < this.hitCount; i++) {
                ctx.fillStyle = NJOX.COLORS.REACTIVE_MUTATED;
                ctx.beginPath();
                ctx.arc(this.x + 6 + i * 6, this.y + 6, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
};
