window.NJOX = window.NJOX || {};

// ─── StressSpreader ─────────────────────────────────────────────────────────
// Dark-red "hastalıklı" creature with animated orange-red flames on its head.
// At the end of each round it infects 1 random creature:
//   → that creature turns red (isStressed = true)
//   → its head catches fire (stressed flame overlay)
//   → HP +3, "+3 Stress" floating text appears
// This is handled externally in level-manager.applyStressSpread().

NJOX.StressSpreader = class StressSpreader extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.STRESS_SPREADER);
        this._flamePhase  = Math.random() * Math.PI * 2;
        this._attackFlash = 0;
        this._jumpAnim    = null; // { progress, dx, dy }
    }

    getColor() { return NJOX.COLORS.STRESS_SPREADER; }
    getLabel()  { return 'Stress'; }

    update(dt) {
        super.update(dt);
        this._flamePhase  += dt * 5.5;
        if (this._attackFlash > 0) this._attackFlash -= dt;
        if (this._jumpAnim) {
            this._jumpAnim.progress = Math.min(1, this._jumpAnim.progress + dt / 0.45);
            if (this._jumpAnim.progress >= 1) this._jumpAnim = null;
        }
    }

    // Zıplayıp hedefe doğru fırlama animasyonu başlat
    triggerJump(targetCX, targetCY) {
        this._attackFlash = 0.65;
        this._jumpAnim = {
            progress: 0,
            dx: (targetCX - (this.x + this.w / 2)) * 0.65,
            dy: (targetCY - (this.y + this.h / 2)) * 0.65,
        };
    }

    // Called by level-manager when this creature spreads stress this round
    triggerAttackFlash() {
        this._attackFlash = 0.5;
    }

    // ── Full custom render ───────────────────────────────────────────────────
    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = NJOX.COLORS.STRESS_SPREADER;
        const cx    = this.x + this.w / 2;
        const cy    = this.y + this.h / 2;
        const t     = this._flamePhase;

        ctx.save();

        // ── Death shrink ──────────────────────────────────────────────────
        if (this.animState === 'death') {
            const td = this.deathTimer / 0.3;
            ctx.globalAlpha = td;
            ctx.translate(cx, cy);
            ctx.scale(td, td);
            ctx.translate(-cx, -cy);
        }

        // ── Breath / sway ─────────────────────────────────────────────────
        const bs = 1 + Math.sin(this.breathPhase) * 0.008;
        ctx.translate(cx, cy);
        ctx.scale(bs, bs);
        ctx.rotate(Math.sin(this.swayPhase) * 0.012);
        ctx.translate(-cx, -cy);

        // ── Zıplama animasyonu — hedefe doğru yay yörüngesi ───────────────
        if (this._jumpAnim) {
            const jt = Math.sin(this._jumpAnim.progress * Math.PI); // 0→1→0
            ctx.translate(
                this._jumpAnim.dx * jt,
                this._jumpAnim.dy * jt - jt * 22  // yay: biraz yukarı arc
            );
        }

        // ── Pulsing sick-red glow ─────────────────────────────────────────
        ctx.shadowColor = '#ff3300';
        ctx.shadowBlur  = this.hitFlashTimer > 0 ? 22 : 10 + Math.sin(t) * 5;

        // ── Body ──────────────────────────────────────────────────────────
        const bodyColor = this.hitFlashTimer > 0  ? '#ffffff'
                        : this._attackFlash > 0.2 ? '#cc2200'
                        : color;
        ctx.fillStyle = bodyColor;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Pulsing border
        const borderA = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.7));
        ctx.strokeStyle = `rgba(255,60,0,${borderA.toFixed(2)})`;
        ctx.lineWidth   = 2.5;
        ctx.stroke();

        // ── HEAD FLAMES — 4 orange-red tongues ───────────────────────────
        for (let i = 0; i < 4; i++) {
            const fx     = this.x + (i + 0.5) * (this.w / 4);
            const fwHalf = 3.5 + Math.sin(t + i * 1.9) * 1.8;
            const fh     = 11 + Math.sin(t * 1.2 + i * 2.3) * 6;

            const grad = ctx.createRadialGradient(fx, this.y - fh * 0.2, 0, fx, this.y, fwHalf * 2.5);
            grad.addColorStop(0,   'rgba(255,210,0,0.95)');
            grad.addColorStop(0.35,'rgba(255,90,0,0.75)');
            grad.addColorStop(1,   'rgba(160,0,0,0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(fx, this.y - fh * 0.42, fwHalf, fh * 0.72, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Fevered angry face ────────────────────────────────────────────
        NJOX.Renderer.drawFace(ctx, cx, cy, this.w, this.h, {
            blinkPhase: this.blinkState,
            mouthOpen:  0,
            expression: 'angry',
            color:      '#ffbbaa',
            scale:      1,
        });

        // ── Attack flash label ────────────────────────────────────────────
        if (this._attackFlash > 0.25) {
            const labelAlpha = Math.min(1, (this._attackFlash - 0.25) / 0.15);
            ctx.save();
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle   = '#ff5500';
            ctx.font        = 'bold 8px monospace';
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('STRES!', cx, cy + 10);
            ctx.restore();
        }

        // ── HP badge ──────────────────────────────────────────────────────
        this._renderHP(ctx);

        // ── Stressed overlay (if also stressed by another spreader) ───────
        if (this.isStressed) this._renderStressedOverlay(ctx);

        ctx.restore();
    }
};
