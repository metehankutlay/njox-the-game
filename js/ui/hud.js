window.NJOX = window.NJOX || {};

NJOX.HUD = {
    render(ctx, game) {
        const { levelManager, ballManager } = game;

        ctx.save();

        // Top bar background — 2 tier (46px total)
        ctx.fillStyle = NJOX.COLORS.HUD_BG;
        ctx.fillRect(0, 0, NJOX.CANVAS_W, 46);

        // Subtle separator between tier 1 and tier 2
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 22);
        ctx.lineTo(NJOX.CANVAS_W, 22);
        ctx.stroke();

        // ── Tier 1 (Y=11): text info ──────────────────────────────────────

        // Chapter + Round progress — left
        ctx.fillStyle = NJOX.COLORS.TEXT;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const ch       = levelManager.currentLevel || 1;
        const rnd      = game.roundIndex || 1;
        const rndTotal = NJOX.ROUNDS_PER_LEVEL;
        const roundText = game.bossMode
            ? `CH${ch}  BOSS`
            : `CH${ch}  R${rnd}/${rndTotal}`;
        ctx.fillText(roundText, 6, 11);

        // Gold counter — safely after chapter text
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('$' + (game.gold || 0), 130, 11);

        // Shots remaining — center
        if (game.shotsRemaining != null) {
            ctx.fillStyle = game.shotsRemaining <= 5 ? '#ff4444' : NJOX.COLORS.TEXT_DIM;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(game.shotsRemaining + ' shots', NJOX.CANVAS_W / 2, 11);
        }

        // Total kills counter — right
        if (game.totalKills != null) {
            ctx.textAlign = 'right';
            ctx.font = '11px monospace';
            ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
            ctx.fillText('☠ ' + game.totalKills, NJOX.CANVAS_W - 6, 11);
        }

        // ── Tier 2 (Y=22-46): stress meter drawn by main.js ──────────────

        // Floor line
        ctx.strokeStyle = NJOX.COLORS.FLOOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, NJOX.FLOOR_Y);
        ctx.lineTo(NJOX.CANVAS_W, NJOX.FLOOR_Y);
        ctx.stroke();

        // Ball count (just above floor)
        ctx.fillStyle = NJOX.COLORS.TEXT;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('x' + ballManager.totalCount, 8, NJOX.FLOOR_Y - 4);

        // Modifier indicator
        if (ballManager.modifierQueue.length > 0) {
            const mod = ballManager.modifierQueue[0];
            const modColor = mod.type === 'fire' ? NJOX.COLORS.FIRE : NJOX.COLORS.ICE;
            ctx.fillStyle = modColor;
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(mod.type.toUpperCase() + ' x' + mod.remaining, NJOX.CANVAS_W - 8, NJOX.FLOOR_Y - 4);
        }

        ctx.restore();
    }
};
