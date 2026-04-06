window.NJOX = window.NJOX || {};

// ─── ChainedCreature ─────────────────────────────────────────────────────────
// Koyu altın renkli zincirli yaratık.
// İlk "ölüm" vuruşunda HP sıfırlanır ama ölmez → "kırık" moda girer.
// Kırık modda: yavaş pulses, düşük opasite, görünür zincir kırılma efekti.
// Bir sonraki herhangi bir vuruşta kesinlikle ölür.
// Strateji: tek atışta öldürmek zor, iki kez vurman gerekir.

NJOX.ChainedCreature = class ChainedCreature extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.CHAINED);
        this._broken      = false;  // kırık mod aktif mi
        this._chainPhase  = Math.random() * Math.PI * 2;
        this._shatterFlash = 0;     // kırık moda geçişte flash
    }

    getColor() {
        return this._broken ? '#993300' : NJOX.COLORS.CHAINED;
    }
    getLabel() { return this._broken ? 'Broken' : 'Chained'; }

    update(dt) {
        super.update(dt);
        this._chainPhase  += dt * (this._broken ? 4.0 : 1.8);
        if (this._shatterFlash > 0) this._shatterFlash -= dt * 2.5;
    }

    onHit(ball, face, damageMultiplier = 1) {
        if (!this.alive) return null;

        // Kırık moddaysa: herhangi bir vuruş öldürür
        if (this._broken) {
            this.hp = 0;
            this.alive = false;
            this.animState = 'death';
            this.deathTimer = 0.3;
            return { absorbed: false, killed: true, spawns: this.onDeath() };
        }

        // Normal hasar
        const damage = 1 * damageMultiplier;
        this.hp -= damage;
        this.hitFlashTimer = 0.12;
        this.animState = 'hit';

        if (this.hp <= 0) {
            // Kırık moda geç — ölme henüz
            this.hp           = 1;
            this._broken      = true;
            this._shatterFlash = 1.0;
            this.hitFlashTimer = 0.35;
            return { absorbed: false, killed: false };
        }

        return { absorbed: false, killed: false };
    }

    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        const sf = Math.max(0, this._shatterFlash);

        // Kırık modda: opasite azalt ve titreş
        if (this._broken && this.animState !== 'death') {
            const flicker = 0.45 + Math.abs(Math.sin(this._chainPhase * 3)) * 0.35;
            ctx.save();
            ctx.globalAlpha = flicker;
        }

        super.render(ctx); // temel gövde

        if (this._broken && this.animState !== 'death') {
            ctx.restore();
        }

        if (this.animState === 'death') return;

        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.save();

        // Kırık moda geçiş flash
        if (sf > 0) {
            ctx.globalAlpha = sf * 0.7;
            ctx.fillStyle   = '#ff6600';
            ctx.beginPath();
            ctx.arc(cx, cy, this.w * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }

        // Zincir halka dekorasyonları — iki tarafta dönen halkalar
        const linkColor = this._broken ? '#ff6600' : NJOX.COLORS.CHAINED_LINK;
        ctx.strokeStyle = linkColor;
        ctx.lineWidth   = this._broken ? 2 : 2.5;
        ctx.globalAlpha = this._broken ? 0.85 : 0.65;
        ctx.shadowColor = linkColor;
        ctx.shadowBlur  = this._broken ? 10 : 4;

        const r = this.w / 2 + 7;
        for (let i = 0; i < 2; i++) {
            const angle = this._chainPhase + i * Math.PI;
            const lx    = cx + Math.cos(angle) * r;
            const ly    = cy + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.arc(lx, ly, 5, 0, Math.PI * 2);
            ctx.stroke();
            // Küçük zincir çizgisi merkeze doğru
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(cx + Math.cos(angle) * (this.w / 2 - 2),
                       cy + Math.sin(angle) * (this.h / 2 - 2));
            ctx.stroke();
        }

        // Kırık modda "!" simgesi
        if (this._broken) {
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle   = '#ffcc00';
            ctx.font        = 'bold 14px monospace';
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', cx, cy - 12);
        }

        ctx.restore();
    }
};
