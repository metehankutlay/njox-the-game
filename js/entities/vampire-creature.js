window.NJOX = window.NJOX || {};

// Vampire — rare purple burning creature that drains 1 ball on each hit
NJOX.VampireCreature = class VampireCreature extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.VAMPIRE);
        this.flamePhase    = Math.random() * Math.PI * 2;
        this.drainTotal    = 0;
        this._storedBalls  = 0;   // ilk 5 top buraya emilir
        this._maxStore     = 5;
        this._hasAbsorbed  = false; // 5 top emildikten sonra true — bir daha emmez
        this._readyToFire  = true;  // doğuştan atar — her raund 3 mor top fırlatır
    }

    getColor() {
        return NJOX.COLORS.VAMPIRE;
    }

    getLabel() {
        return 'Vampire';
    }

    update(dt) {
        super.update(dt);
        this.flamePhase += dt * 6;
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (this.animState === 'death') return null;

        const result = super.onHit(ball, face, damageMultiplier);
        if (!result) return result;

        if (!this._hasAbsorbed && this._storedBalls < this._maxStore) {
            // İlk 5 top emilir: top kaybolur ama totalCount düşmez
            this._storedBalls++;
            result.absorbed = true;
            result.drained  = false;
            if (this._storedBalls >= this._maxStore) {
                this._hasAbsorbed = true;
                this._readyToFire = true; // kalıcı — ölene kadar her raund atar
            }
        }
        // Depo doluysa ya da zaten emdi → normal vuruş, top kaybı yok

        return result;
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const color = NJOX.COLORS.VAMPIRE;
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

        // Breath sway
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.008;
        ctx.translate(cx, cy);
        ctx.scale(breathScale, breathScale);
        ctx.rotate(Math.sin(this.swayPhase) * 0.01);
        ctx.translate(-cx, -cy);

        // Purple glow
        ctx.shadowColor = NJOX.COLORS.VAMPIRE_FLAME;
        ctx.shadowBlur = 14 + Math.sin(this.flamePhase) * 4;

        // Body — dark purple
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#fff' : color;
        NJOX.Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Purple border
        ctx.strokeStyle = NJOX.COLORS.VAMPIRE_FLAME;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Flames on top of the body (3 tongues of purple fire)
        for (let i = 0; i < 3; i++) {
            const fx = this.x + (i + 0.5) * (this.w / 3);
            const fwHalf = 4 + Math.sin(this.flamePhase + i * 2.1) * 2;
            const fh = 12 + Math.sin(this.flamePhase * 1.4 + i * 1.7) * 5;

            const grad = ctx.createRadialGradient(fx, this.y - fh * 0.3, 0, fx, this.y, fwHalf * 2);
            grad.addColorStop(0, 'rgba(220,100,255,0.95)');
            grad.addColorStop(0.5, 'rgba(120,0,200,0.6)');
            grad.addColorStop(1, 'rgba(60,0,120,0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(fx, this.y - fh * 0.4, fwHalf, fh * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eyes (red vampire eyes — override Renderer.drawFace style)
        const eyeSpacing = this.w * 0.18;
        const eyeY = cy - this.h * 0.12;
        const eyeR = 5;
        const eyeH = eyeR * 2 * (1 - this.blinkState * 0.9);

        // Angry brow lines
        ctx.strokeStyle = 'rgba(255,200,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - eyeSpacing - eyeR, eyeY - eyeR * 1.6);
        ctx.lineTo(cx - eyeSpacing + eyeR, eyeY - eyeR * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + eyeSpacing + eyeR, eyeY - eyeR * 1.6);
        ctx.lineTo(cx + eyeSpacing - eyeR, eyeY - eyeR * 0.9);
        ctx.stroke();

        // Eye whites
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, eyeY, eyeR, Math.max(eyeH / 2, 1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, eyeY, eyeR, Math.max(eyeH / 2, 1), 0, 0, Math.PI * 2);
        ctx.fill();

        // Red pupils
        if (this.blinkState < 0.7) {
            ctx.fillStyle = '#ff0033';
            ctx.beginPath();
            ctx.arc(cx - eyeSpacing, eyeY, eyeR * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + eyeSpacing, eyeY, eyeR * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }

        // Mouth with fangs
        const mouthY = cy + this.h * 0.18;
        ctx.strokeStyle = 'rgba(255,200,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, mouthY + 4, this.w * 0.2, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();

        // Fangs — two white pointed teeth
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#cc00ff';
        ctx.shadowBlur = 3;
        // Left fang
        ctx.beginPath();
        ctx.moveTo(cx - 5, mouthY - 1);
        ctx.lineTo(cx - 7, mouthY + 9);
        ctx.lineTo(cx - 3, mouthY - 1);
        ctx.closePath();
        ctx.fill();
        // Right fang
        ctx.beginPath();
        ctx.moveTo(cx + 3, mouthY - 1);
        ctx.lineTo(cx + 7, mouthY + 9);
        ctx.lineTo(cx + 5, mouthY - 1);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Emilen toplar — mor daireler (depo göstergesi)
        const stored = this._storedBalls;
        if (stored > 0) {
            for (let i = 0; i < stored; i++) {
                const pulse = 0.7 + 0.3 * Math.sin(this.flamePhase + i);
                ctx.globalAlpha = pulse;
                ctx.shadowColor = '#cc44ff';
                ctx.shadowBlur  = 6;
                ctx.fillStyle   = '#cc44ff';
                ctx.beginPath();
                ctx.arc(this.x + 4 + i * 8, this.y + this.h - 7, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur  = 0;
                ctx.globalAlpha = 1;
            }
        }
        // "▼ ATIYOR" — her zaman göster (doğuştan atar)
        {
            const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.flamePhase * 2));
            ctx.globalAlpha = pulse;
            ctx.fillStyle   = this._hasAbsorbed ? '#ff44ff' : '#cc88ff';
            ctx.font        = 'bold 7px monospace';
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▼ ATIYOR', cx, this.y + this.h + 8);
            ctx.globalAlpha = 1;
        }

        // HP badge
        this._renderHP(ctx);

        ctx.restore();
    }
};
