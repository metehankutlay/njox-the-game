window.NJOX = window.NJOX || {};

NJOX.ShopSystem = class ShopSystem {
    constructor() {
        this.items = [
            { id: 'fire',  ...NJOX.SHOP.FIRE_BALL,  unlocked: true, firstFree: true },
            { id: 'bomb',  ...NJOX.SHOP.BOMB_BALL,  unlocked: false },
            { id: 'ghost', ...NJOX.SHOP.GHOST_BALL, unlocked: false },
            { id: 'ice',   ...NJOX.SHOP.ICE_BALL,   unlocked: false },
        ];
        this.enabled      = false; // enabled after level 1
        this._modalOpen   = false; // shop modal overlay visible
        this._pendingItem = null;  // item id awaiting purchase confirmation
    }

    enable() {
        this.enabled = true;
        for (const item of this.items) item.unlocked = true;
    }

    canAfford(itemId, gold) {
        const item = this.items.find(i => i.id === itemId);
        if (!item || !item.unlocked) return false;
        if (item.firstFree) return true;
        return gold >= item.cost;
    }

    purchase(itemId, game) {
        const item = this.items.find(i => i.id === itemId);
        if (!item || !item.unlocked) return null;

        const cost = item.firstFree ? 0 : item.cost;
        if (game.gold < cost) return null;

        game.gold -= cost;
        if (item.firstFree) item.firstFree = false;

        return { id: item.id, count: item.count || 1 };
    }

    // Apply purchased item effect
    applyEffect(purchase, game) {
        if (!purchase) return;
        const { ballManager, levelManager, particles } = game;

        switch (purchase.id) {
            case 'fire':
                ballManager.queueModifier('fire', purchase.count);
                break;
            case 'bomb':
                ballManager.queueModifier('bomb', purchase.count);
                break;
            case 'ghost':
                ballManager.queueModifier('ghost', purchase.count);
                break;
            case 'ice':
                ballManager.queueModifier('ice', purchase.count);
                break;
        }
    }

    _fireRocket(game) {
        const { levelManager, particles } = game;
        // Find the lowest row of alive creatures
        let maxY = -1;
        for (const c of levelManager.creatures) {
            if (c.alive && c.targetY > maxY) maxY = c.targetY;
        }
        if (maxY < 0) return;

        // Destroy all creatures in that row
        let killed = 0;
        for (const c of levelManager.creatures) {
            if (!c.alive) continue;
            if (Math.abs(c.targetY - maxY) < NJOX.CELL_SIZE * 0.6) {
                c.hp = 0;
                c.alive = false;
                c.animState = 'death';
                c.deathTimer = 0.3;
                killed++;
            }
        }

        // Single combined explosion at row center — no per-creature bursts
        if (killed > 0) {
            particles.emit(NJOX.CANVAS_W / 2, maxY + NJOX.CELL_SIZE / 2, 18, '#ff8800', {
                speedMin: 60, speedMax: 280, sizeMin: 2, sizeMax: 5,
                lifeMin: 0.25, lifeMax: 0.55, gravity: 90,
            });
            particles.emit(NJOX.CANVAS_W / 2, maxY + NJOX.CELL_SIZE / 2, 10, '#ffcc44', {
                speedMin: 40, speedMax: 180, sizeMin: 1, sizeMax: 3,
                lifeMin: 0.2, lifeMax: 0.4, gravity: 60,
            });
        }

        NJOX.Renderer.triggerShake(6, 0.25);
    }
};
