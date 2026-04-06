window.NJOX = window.NJOX || {};

NJOX.CounterCreature = class CounterCreature extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.COUNTER);
        this.driftSpeed = 5;
        this.driftRange = 6;
    }

    getColor() {
        return NJOX.COLORS.COUNTER;
    }

    getLabel() {
        return 'Counter';
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

        // Large HP number at TOP (forehead) — Counter's identity
        const hpStr = '' + Math.ceil(this.hp);
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(hpStr, cx + 1, this.y + 5); // shadow
        ctx.fillStyle = '#fff';
        ctx.fillText(hpStr, cx, this.y + 4);

        // Eyes in lower portion
        const eyeY = cy + 6;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 8, eyeY, 4, 0, Math.PI * 2);
        ctx.arc(cx + 8, eyeY, 4, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(cx - 8, eyeY, 2, 0, Math.PI * 2);
        ctx.arc(cx + 8, eyeY, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
};
