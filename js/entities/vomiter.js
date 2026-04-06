window.NJOX = window.NJOX || {};

// ─── Vomiter ────────────────────────────────────────────────────────────────
// Sickly olive-yellow creature with animated bile drips hanging from its mouth.
// On death it regurgitates 2 new BasicMonster creatures into the same row at
// random columns, each with ~55% of the Vomiter's original HP.

NJOX.Vomiter = class Vomiter extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.VOMITER);
        this._bilePhase   = Math.random() * Math.PI * 2;
        this._bubblePhase = Math.random() * Math.PI * 2;
    }

    getColor() { return NJOX.COLORS.VOMITER; }
    getLabel()  { return 'Vomiter'; }

    update(dt) {
        super.update(dt);
        this._bilePhase   += dt * 2.8;
        this._bubblePhase += dt * 1.6;
    }

    // ── Spawn 2 BasicMonsters in the same row on death ──────────────────────
    onDeath() {
        const childHp = Math.max(1, Math.floor(this.maxHp * 0.55));
        const cols    = NJOX.GRID_COLS;
        const myCol   = Math.round(this.x / NJOX.CELL_SIZE);
        const used    = new Set([myCol]);
        const spawns  = [];

        for (let i = 0; i < 2; i++) {
            let col, tries = 0;
            do {
                col = NJOX.Utils.randInt(0, cols - 1);
                tries++;
            } while (used.has(col) && tries < 12);
            used.add(col);

            const sp    = new NJOX.BasicMonster(col * NJOX.CELL_SIZE + 2, this.y, childHp);
            sp.targetY  = this.targetY;
            sp.isStressed = this.isStressed || !!NJOX._cardVomitPanic; // kart veya parent stres
            spawns.push(sp);
        }
        return spawns;
    }

    // ── Render: base creature + bile drips overlay ──────────────────────────
    render(ctx) {
        if (!this.alive && this.animState !== 'death') return;

        // Base rendering (body, face, HP badge, stressed overlay)
        super.render(ctx);

        if (this.animState === 'death') return; // no drips during death anim

        const cx     = this.x + this.w / 2;
        const mouthY = this.y + this.h * 0.66; // mouth area
        const t      = this._bilePhase;

        ctx.save();
        ctx.lineCap = 'round';

        // ── Bile drip strands (3 strands from mouth) ──────────────────────
        for (let i = 0; i < 3; i++) {
            const mx      = cx + (i - 1) * 6;
            const dripLen = 7 + Math.sin(t + i * 1.2) * 4;
            const blobR   = 2.8 + Math.sin(t * 1.3 + i * 0.9) * 1;

            // Strand
            ctx.strokeStyle = NJOX.COLORS.VOMITER_BILE;
            ctx.lineWidth   = 2.5;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.moveTo(mx, mouthY);
            ctx.lineTo(mx, mouthY + dripLen);
            ctx.stroke();

            // Drip blob at end
            ctx.fillStyle   = NJOX.COLORS.VOMITER_BILE;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(mx, mouthY + dripLen + blobR * 0.4, blobR, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Bile bubble inside mouth (oscillating) ────────────────────────
        const bubR = 3 + Math.abs(Math.sin(this._bubblePhase)) * 2;
        ctx.fillStyle   = NJOX.COLORS.VOMITER_BILE;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(cx, mouthY - 2, bubR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
};
