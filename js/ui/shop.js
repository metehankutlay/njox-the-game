window.NJOX = window.NJOX || {};

// ─── Shop UI ─────────────────────────────────────────────────────────────────
// 3-mode rendering:
//   Mode 1 — Compact bar: single "🛒 MAĞAZA" button + gold display
//   Mode 2 — Modal open:  dark overlay + item list panel
//   Mode 3 — Confirm:     selected item highlighted + ONAYLA / VAZGEÇ buttons

NJOX.ShopUI = {

    // Hit-area rects (populated each render)
    _openBtn:    null,  // compact bar open button
    _closeBtn:   null,  // ✕ in modal header
    _itemBtns:   [],    // { id, x, y, w, h } per item
    _confirmBtn: null,  // ONAYLA button
    _cancelBtn:  null,  // VAZGEÇ button

    // ── Render ────────────────────────────────────────────────────────────────
    render(ctx, game) {
        const shop = game.shopSystem;
        if (!shop || !shop.enabled) return;

        if (shop._modalOpen) {
            if (shop._pendingItem) {
                this._renderConfirm(ctx, game);
            } else {
                this._renderModal(ctx, game);
            }
        } else {
            this._renderBar(ctx, game);
        }
    },

    // ── Mode 1: Compact bar ───────────────────────────────────────────────────
    _renderBar(ctx, game) {
        const y = NJOX.SHOP_Y;
        const h = NJOX.SHOP_H;
        const W = NJOX.CANVAS_W;

        // Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, y, W, h);

        // Separator line
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();

        // Gold display (top-right corner)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰 ' + (game.gold || 0) + 'g', W - 12, y + 18);

        // Big MAĞAZA button
        const btnW = W - 24;
        const btnH = 44;
        const btnX = 12;
        const btnY = y + (h - btnH) / 2 + 4;

        ctx.fillStyle = 'rgba(233,69,96,0.18)';
        NJOX.Utils.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,69,96,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛒  SHOP', W / 2, btnY + btnH / 2);

        this._openBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    },

    // ── Mode 2: Modal ─────────────────────────────────────────────────────────
    _renderModal(ctx, game) {
        const shop = game.shopSystem;
        const W = NJOX.CANVAS_W;
        const H = NJOX.CANVAS_H;

        // Also draw compact bar underneath so modal can be dismissed by backdrop
        this._renderBar(ctx, game);

        // Dark overlay (covers game area only, not bar)
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, W, NJOX.SHOP_Y);

        // Modal panel
        const panelW = W - 20;
        const panelH = 440;
        const panelX = 10;
        const panelY = (NJOX.SHOP_Y - panelH) / 2;

        ctx.fillStyle = '#0d1428';
        NJOX.Utils.roundRect(ctx, panelX, panelY, panelW, panelH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,69,96,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Header
        const headerH = 48;
        ctx.fillStyle = 'rgba(233,69,96,0.15)';
        NJOX.Utils.roundRect(ctx, panelX, panelY, panelW, headerH, 12);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛒  SHOP', W / 2, panelY + headerH / 2);

        // Gold (header right)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('💰 ' + (game.gold || 0) + 'g', panelX + panelW - 12, panelY + headerH / 2);

        // Close button
        const closeSize = 28;
        const closeX = panelX + 8;
        const closeY = panelY + (headerH - closeSize) / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        NJOX.Utils.roundRect(ctx, closeX, closeY, closeSize, closeSize, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', closeX + closeSize / 2, closeY + closeSize / 2);
        this._closeBtn = { x: closeX, y: closeY, w: closeSize, h: closeSize };

        // Item rows
        this._itemBtns = [];
        const rowH = 78;
        const rowGap = 6;
        const startY = panelY + headerH + 8;

        for (let i = 0; i < shop.items.length; i++) {
            const item = shop.items[i];
            const ry = startY + i * (rowH + rowGap);
            const rx = panelX + 8;
            const rw = panelW - 16;

            const canAfford = shop.canAfford(item.id, game.gold);
            const alpha = canAfford ? 1.0 : 0.45;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Row background
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            NJOX.Utils.roundRect(ctx, rx, ry, rw, rowH, 7);
            ctx.fill();
            ctx.strokeStyle = canAfford ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Color accent bar (left side)
            ctx.fillStyle = item.color;
            ctx.fillRect(rx, ry + 8, 4, rowH - 16);

            // Icon circle
            const iconX = rx + 28;
            const iconY = ry + rowH / 2;
            ctx.beginPath();
            ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
            ctx.fillStyle = item.color + '33';
            ctx.fill();
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.font = '20px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Extract just the emoji part
            const emoji = item.label.split(' ')[0];
            ctx.fillText(emoji, iconX, iconY);

            // Item name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            // Label without emoji
            const nameText = item.label.split(' ').slice(1).join(' ');
            ctx.fillText(nameText, rx + 54, ry + 14);

            // Description
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '11px monospace';
            ctx.fillText(item.desc, rx + 54, ry + 34);

            // Price / FREE badge
            const priceStr = item.firstFree ? 'FREE' : item.cost + 'g';
            const priceColor = item.firstFree ? '#4ecca3' : canAfford ? '#ffd700' : 'rgba(255,215,0,0.4)';

            // Buy button
            const bW = 90, bH = 32;
            const bX = rx + rw - bW - 8;
            const bY = ry + (rowH - bH) / 2;

            ctx.fillStyle = canAfford
                ? (item.firstFree ? 'rgba(78,204,163,0.25)' : 'rgba(255,215,0,0.2)')
                : 'rgba(255,255,255,0.04)';
            NJOX.Utils.roundRect(ctx, bX, bY, bW, bH, 6);
            ctx.fill();
            ctx.strokeStyle = canAfford
                ? (item.firstFree ? '#4ecca3' : '#ffd700')
                : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = priceColor;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(priceStr + ' →BUY', bX + bW / 2, bY + bH / 2);

            ctx.restore();

            if (canAfford) {
                this._itemBtns.push({ id: item.id, x: bX, y: bY, w: bW, h: bH });
            }
        }
    },

    // ── Mode 3: Confirmation ──────────────────────────────────────────────────
    _renderConfirm(ctx, game) {
        const shop = game.shopSystem;
        const W = NJOX.CANVAS_W;
        const item = shop.items.find(i => i.id === shop._pendingItem);
        if (!item) return;

        // Also draw bar + full overlay
        this._renderBar(ctx, game);

        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillRect(0, 0, W, NJOX.SHOP_Y);

        // Confirmation panel
        const panelW = W - 40;
        const panelH = 260;
        const panelX = 20;
        const panelY = (NJOX.SHOP_Y - panelH) / 2;

        ctx.fillStyle = '#0d1428';
        NJOX.Utils.roundRect(ctx, panelX, panelY, panelW, panelH, 12);
        ctx.fill();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PURCHASE CONFIRM', W / 2, panelY + 30);

        // Divider
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 16, panelY + 50);
        ctx.lineTo(panelX + panelW - 16, panelY + 50);
        ctx.stroke();

        // Item icon + name
        const midY = panelY + 95;
        const iconX = panelX + 36;
        ctx.beginPath();
        ctx.arc(iconX, midY, 22, 0, Math.PI * 2);
        ctx.fillStyle = item.color + '33';
        ctx.fill();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label.split(' ')[0], iconX, midY);

        const nameText = item.label.split(' ').slice(1).join(' ');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(nameText, panelX + 68, panelY + 68);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '12px monospace';
        ctx.fillText(item.desc, panelX + 68, panelY + 88);

        // Price
        const costStr = item.firstFree ? 'FREE' : '-' + item.cost + 'g';
        const costColor = item.firstFree ? '#4ecca3' : '#ffd700';
        ctx.fillStyle = costColor;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(costStr, W / 2, panelY + 135);

        // ONAYLA button
        const btnW = (panelW - 24) / 2;
        const btnH = 44;
        const btn1X = panelX + 8;
        const btn2X = panelX + panelW - btnW - 8;
        const btnY2 = panelY + panelH - btnH - 12;

        ctx.fillStyle = 'rgba(78,204,163,0.25)';
        NJOX.Utils.roundRect(ctx, btn1X, btnY2, btnW, btnH, 8);
        ctx.fill();
        ctx.strokeStyle = '#4ecca3';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#4ecca3';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓ CONFIRM', btn1X + btnW / 2, btnY2 + btnH / 2);
        this._confirmBtn = { x: btn1X, y: btnY2, w: btnW, h: btnH };

        // VAZGEÇ button
        ctx.fillStyle = 'rgba(233,69,96,0.15)';
        NJOX.Utils.roundRect(ctx, btn2X, btnY2, btnW, btnH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,69,96,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#e94560';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕ CANCEL', btn2X + btnW / 2, btnY2 + btnH / 2);
        this._cancelBtn = { x: btn2X, y: btnY2, w: btnW, h: btnH };
    },

    // ── Handle click ──────────────────────────────────────────────────────────
    handleClick(x, y, game) {
        const shop = game.shopSystem;
        if (!shop || !shop.enabled) return false;

        const inRect = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

        // ── Confirm mode ──────────────────────────────────────────────────
        if (shop._pendingItem) {
            if (inRect(this._confirmBtn)) {
                // Execute purchase
                const purchase = shop.purchase(shop._pendingItem, game);
                if (purchase) shop.applyEffect(purchase, game);
                shop._pendingItem = null;
                shop._modalOpen   = false;
                NJOX.Sound.ballPickup && NJOX.Sound.ballPickup();
                return true;
            }
            if (inRect(this._cancelBtn)) {
                shop._pendingItem = null;  // back to modal
                return true;
            }
            return true; // absorb all clicks while in confirm mode
        }

        // ── Modal open mode ───────────────────────────────────────────────
        if (shop._modalOpen) {
            // Close button
            if (inRect(this._closeBtn)) {
                shop._modalOpen = false;
                return true;
            }
            // Item buy button
            for (const btn of this._itemBtns) {
                if (inRect(btn)) {
                    shop._pendingItem = btn.id;
                    return true;
                }
            }
            // Click outside modal panel (on overlay) → close
            const panelW = NJOX.CANVAS_W - 20;
            const panelH = 440;
            const panelX = 10;
            const panelY = (NJOX.SHOP_Y - panelH) / 2;
            const inPanel = x >= panelX && x <= panelX + panelW && y >= panelY && y <= panelY + panelH;
            if (!inPanel) {
                shop._modalOpen = false;
            }
            return true;
        }

        // ── Bar mode ──────────────────────────────────────────────────────
        if (inRect(this._openBtn)) {
            shop._modalOpen = true;
            return true;
        }

        return false;
    }
};
