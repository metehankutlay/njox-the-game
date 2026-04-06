window.NJOX = window.NJOX || {};

NJOX.BossHPBar = {
    displayHp: 1, // smooth animation

    render(ctx, boss) {
        if (!boss || !boss.alive) return;

        const barX = 30;
        const barY = 38;
        const barW = NJOX.CANVAS_W - 60;
        const barH = 14;

        // Smooth HP animation
        const targetHp = boss.hp / boss.maxHp;
        this.displayHp = NJOX.Utils.lerp(this.displayHp, targetHp, 0.1);

        // Boss name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(boss.name.toUpperCase(), NJOX.CANVAS_W / 2, barY - 2);

        // Bar background
        ctx.fillStyle = NJOX.COLORS.HP_BAR_BG;
        NJOX.Utils.roundRect(ctx, barX, barY, barW, barH, 4);
        ctx.fill();

        // Bar fill — color changes by phase
        let fillColor;
        if (this.displayHp > 0.66) fillColor = NJOX.COLORS.BOSS_PHASE1;
        else if (this.displayHp > 0.33) fillColor = NJOX.COLORS.BOSS_PHASE2;
        else fillColor = NJOX.COLORS.BOSS_PHASE3;

        const fillW = Math.max(0, barW * this.displayHp);
        if (fillW > 0) {
            ctx.fillStyle = fillColor;
            NJOX.Utils.roundRect(ctx, barX, barY, fillW, barH, 4);
            ctx.fill();
        }

        // Phase markers
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        [0.33, 0.66].forEach(threshold => {
            const mx = barX + barW * threshold;
            ctx.beginPath();
            ctx.moveTo(mx, barY);
            ctx.lineTo(mx, barY + barH);
            ctx.stroke();
        });

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        NJOX.Utils.roundRect(ctx, barX, barY, barW, barH, 4);
        ctx.stroke();

        // HP text
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.ceil(boss.hp) + '/' + boss.maxHp, NJOX.CANVAS_W / 2, barY + barH / 2);
    }
};
