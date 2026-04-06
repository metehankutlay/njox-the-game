window.NJOX = window.NJOX || {};

NJOX.ShopUI = {
    // Render shop bar below the floor line
    render(ctx, game) {
        const shop = game.shopSystem;
        if (!shop || !shop.enabled) return;

        const y = NJOX.SHOP_Y;
        const h = NJOX.SHOP_H;

        // Background
        ctx.fillStyle = NJOX.COLORS.SHOP_BG;
        ctx.fillRect(0, y, NJOX.CANVAS_W, h);

        // Divider line
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(NJOX.CANVAS_W, y);
        ctx.stroke();

        // "SHOP" label
        ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('SHOP', NJOX.CANVAS_W / 2, y + 2);

        // 4 item slots
        const slotW = 90;
        const slotH = 55;
        const gap = 6;
        const totalW = shop.items.length * slotW + (shop.items.length - 1) * gap;
        let startX = (NJOX.CANVAS_W - totalW) / 2;
        const slotY = y + 16;

        for (let i = 0; i < shop.items.length; i++) {
            const item = shop.items[i];
            const sx = startX + i * (slotW + gap);

            // Store hit area for click detection
            item._hitX = sx;
            item._hitY = slotY;
            item._hitW = slotW;
            item._hitH = slotH;

            const canAfford = shop.canAfford(item.id, game.gold);
            const alpha = item.unlocked ? (canAfford ? 1 : 0.4) : 0.2;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Slot background
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            NJOX.Utils.roundRect(ctx, sx, slotY, slotW, slotH, 6);
            ctx.fill();

            // Border
            ctx.strokeStyle = canAfford ? item.color : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = canAfford ? 1.5 : 0.5;
            ctx.stroke();

            // Icon circle
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(sx + slotW / 2, slotY + 16, 10, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, sx + slotW / 2, slotY + 16);

            // Cost
            ctx.font = '8px monospace';
            if (item.firstFree) {
                ctx.fillStyle = '#4ecca3';
                ctx.fillText('FREE', sx + slotW / 2, slotY + 34);
            } else {
                ctx.fillStyle = '#ffd700';
                ctx.fillText('$' + item.cost, sx + slotW / 2, slotY + 34);
            }

            // Description
            ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
            ctx.font = '7px monospace';
            ctx.fillText(item.desc, sx + slotW / 2, slotY + 46);

            ctx.restore();
        }
    },

    // Handle click on shop
    handleClick(x, y, game) {
        const shop = game.shopSystem;
        if (!shop || !shop.enabled) return false;

        for (const item of shop.items) {
            if (!item._hitX) continue;
            if (x >= item._hitX && x <= item._hitX + item._hitW &&
                y >= item._hitY && y <= item._hitY + item._hitH) {
                if (shop.canAfford(item.id, game.gold)) {
                    const purchase = shop.purchase(item.id, game);
                    if (purchase) {
                        shop.applyEffect(purchase, game);
                        return true;
                    }
                }
            }
        }
        return false;
    }
};
