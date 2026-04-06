window.NJOX = window.NJOX || {};

NJOX.Splitter = class Splitter extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.SPLITTER);
    }

    getColor() {
        return NJOX.COLORS.SPLITTER;
    }

    getLabel() {
        return 'Splitter';
    }

    onDeath() {
        // Spawn 2 smaller basic monsters at flanking positions
        const childHp = Math.max(1, Math.floor(this.maxHp * 0.4));
        const halfW = this.w / 2;
        const spawns = [];

        // Left child
        const lx = NJOX.Utils.clamp(this.x - halfW / 2, 0, NJOX.CANVAS_W - halfW - 4);
        spawns.push(new NJOX.BasicMonster(lx, this.y, childHp));
        spawns[0].w = halfW;
        spawns[0].h = this.h * 0.7;
        spawns[0].targetY = this.targetY;

        // Right child
        const rx = NJOX.Utils.clamp(this.x + this.w / 2 + 2, 0, NJOX.CANVAS_W - halfW - 4);
        spawns.push(new NJOX.BasicMonster(rx, this.y, childHp));
        spawns[1].w = halfW;
        spawns[1].h = this.h * 0.7;
        spawns[1].targetY = this.targetY;

        return spawns;
    }

    render(ctx) {
        super.render(ctx);
        if (!this.alive && this.animState !== 'death') return;

        // Visual indicator: vertical line down the middle
        const cx = this.x + this.w / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, this.y + 4);
        ctx.lineTo(cx, this.y + this.h - 4);
        ctx.stroke();
        ctx.restore();
    }
};
