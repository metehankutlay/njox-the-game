window.NJOX = window.NJOX || {};

// ─── ShieldCreature ───────────────────────────────────────────────────────────
// Koyu mavi kalkan yaratığı.
// SADECE üstten gelen toplar hasar verir (col.face === 'top').
// Yandan veya alttan gelen toplar zıplar ama hasar vermez — kalkan flash gösterir.
// Strateji: oyuncu açıyı ayarlamalı ya da korumayı kırmayı planlamalı.

NJOX.ShieldCreature = class ShieldCreature extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.SHIELD);
        this._shieldFlash = 0;
        this._arcPhase    = Math.random() * Math.PI * 2;
    }

    getColor() { return NJOX.COLORS.SHIELD; }
    getLabel()  { return 'Shield'; }

    update(dt) {
        super.update(dt);
        this._arcPhase += dt * 2.5;
        if (this._shieldFlash > 0) this._shieldFlash -= dt * 3;
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;

        // Sadece üstten (face === 'top') gelen vuruşlar hasar verir
        if (face !== 'top') {
            // Kalkan blokladı — flash efekti, hasar yok
            this._shieldFlash = 1.0;
            this.hitFlashTimer = 0.06; // kısa body flash
            return { absorbed: false, killed: false, shielded: true };
        }

        // Üstten geldi — normal hasar
        return super.onHit(ball, face, damageMultiplier);
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        super.render(ctx); // gövde + yüz + HP + stres overlay

        if (this.animState === 'death') return;

        const cx    = this.x + this.w / 2;
        const topY  = this.y;
        const flash = Math.max(0, this._shieldFlash);
        const pulse = 0.5 + Math.abs(Math.sin(this._arcPhase)) * 0.5;

        ctx.save();

        // Dış kalkan parıltı halkası (üst yarı yay)
        if (flash > 0) {
            ctx.globalAlpha = flash * 0.55;
            ctx.fillStyle   = '#aaddff';
            ctx.beginPath();
            ctx.arc(cx, topY, this.w / 2 + 10, Math.PI, Math.PI * 2);
            ctx.fill();
        }

        // Kalkan yayı
        ctx.globalAlpha = flash > 0 ? 1.0 : 0.55 + pulse * 0.3;
        ctx.strokeStyle = flash > 0 ? '#ffffff' : NJOX.COLORS.SHIELD_ARC;
        ctx.lineWidth   = flash > 0 ? 3.5 : 2.5;
        ctx.shadowColor = NJOX.COLORS.SHIELD_ARC;
        ctx.shadowBlur  = 8 + flash * 14 + pulse * 4;
        ctx.beginPath();
        ctx.arc(cx, topY, this.w / 2 + 4, Math.PI, Math.PI * 2); // üst yarı çember
        ctx.stroke();

        // Küçük kalkan sembolü (▲) ortada
        if (flash <= 0.2) {
            ctx.globalAlpha = 0.55;
            ctx.shadowBlur  = 0;
            ctx.fillStyle   = NJOX.COLORS.SHIELD_ARC;
            ctx.font        = 'bold 10px monospace';
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▲', cx, topY - 8);
        }

        ctx.restore();
    }
};
