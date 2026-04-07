window.NJOX = window.NJOX || {};

NJOX.HUD = {
    render(ctx, game) {
        const { levelManager, ballManager } = game;

        ctx.save();

        // Top bar background — 36px (text row 0-22 + stress band 22-36)
        ctx.fillStyle = NJOX.COLORS.HUD_BG;
        ctx.fillRect(0, 0, NJOX.CANVAS_W, 36);

        // Thin separator between text row and stress band
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 22);
        ctx.lineTo(NJOX.CANVAS_W, 22);
        ctx.stroke();

        // ── Text row (Y=11): chapter · gold · shots · kills ───────────────

        // Chapter + Round — left
        ctx.fillStyle = NJOX.COLORS.TEXT;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const ch       = levelManager.currentLevel || 1;
        const rnd      = game.roundIndex || 1;
        const rndTotal = NJOX.ROUNDS_PER_LEVEL;
        const roundText = game.bossMode
            ? `CH${ch} BOSS`
            : `CH${ch} R${rnd}/${rndTotal}`;
        ctx.fillText(roundText, 6, 11);

        // Gold — after chapter text (CH10 R5/5 = ~80px at 12px bold → safe at 120)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('$' + (game.gold || 0), 120, 11);

        // Shots remaining — center
        if (game.shotsRemaining != null) {
            ctx.fillStyle = game.shotsRemaining <= 5 ? '#ff4444' : NJOX.COLORS.TEXT_DIM;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(game.shotsRemaining + ' shots', NJOX.CANVAS_W / 2, 11);
        }

        // Kills — right
        if (game.totalKills != null) {
            ctx.textAlign = 'right';
            ctx.font = '11px monospace';
            ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
            ctx.fillText('☠ ' + game.totalKills, NJOX.CANVAS_W - 6, 11);
        }

        // ── Stress band (Y=22-36): drawn by main.js, BG already drawn ─────

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
