window.NJOX = window.NJOX || {};

// Ball Carrier — always drops +1 ball when killed.
// Visually distinct: bright green-cyan with a glowing ball icon on body.
NJOX.BallCarrier = class BallCarrier extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.BALL_CARRIER);
        this.ballPulse = Math.random() * Math.PI * 2; // icon pulse phase
    }

    getColor() { return NJOX.COLORS.BALL_CARRIER; }
    getLabel()  { return 'Ball Carrier'; }

    update(dt) {
        super.update(dt);
        this.ballPulse += dt * 3;
    }

    onDeath() {
        // Signals main.js to award +1 ball
        return [];
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = this.getColor();
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.save();

        // Death animation
        if (this.animState === 'death') {
            const t = this.deathTimer / 0.3;
            ctx.globalAlpha = t;
            ctx.translate(cx, cy);
            ctx.scale(t, t);
            ctx.translate(-cx, -cy);
        }

        // Breath / sway
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.01;
        ctx.translate(cx, cy);
        ctx.scale(breathScale, breathScale);
        ctx.rotate(Math.sin(this.swayPhase) * 0.012);
        ctx.translate(-cx, -cy);

        // Bright glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 + Math.sin(this.ballPulse) * 4;

        // Body
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#fff' : color;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Face (upper half) — expression-driven
        NJOX.Renderer.drawFace(ctx, cx, cy - 5, this.w, this.h * 0.6, {
            blinkPhase: this.blinkState,
            mouthOpen: this.expression === 'surprised' ? 0.5 : 0,
            expression: this.expression,
            color: '#fff',
            scale: 0.85,
        });

        // Ball icon (lower half) — pulsing
        const ballY = cy + this.h * 0.22;
        const pulse = 1 + Math.sin(this.ballPulse) * 0.12;
        const ballR = 7 * pulse;

        // Glow ring
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(cx, ballY, ballR + 5, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx, ballY, ballR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // +1 label inside ball
        ctx.fillStyle = color;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+1', cx, ballY);

        // HP badge
        this._renderHP(ctx);

        ctx.restore();
    }
};
