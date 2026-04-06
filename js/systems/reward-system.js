window.NJOX = window.NJOX || {};

NJOX.RewardSystem = class RewardSystem {
    constructor() {
        this.initialCounts = {};
        this.currentCounts = {};
        this.rewardsGranted = {};
        this.pendingReward = null;
        this.rewardMessage = '';
        this.rewardTimer = 0;
    }

    initForLevel(creatures) {
        this.initialCounts = {};
        this.currentCounts = {};
        this.rewardsGranted = {};
        this.pendingReward = null;

        for (const c of creatures) {
            this.initialCounts[c.type] = (this.initialCounts[c.type] || 0) + 1;
            this.currentCounts[c.type] = (this.currentCounts[c.type] || 0) + 1;
        }
    }

    onCreatureKilled(type) {
        if (!this.currentCounts[type]) return;
        this.currentCounts[type]--;

        if (this.currentCounts[type] <= 0 && !this.rewardsGranted[type]) {
            this.rewardsGranted[type] = true;
            this.pendingReward = this._getRewardForType(type);
        }
    }

    _getRewardForType(type) {
        switch (type) {
            case NJOX.CREATURE_TYPES.BASIC:
                return { type: 'extraBalls', amount: 1, message: 'All Monsters cleared! +1 Ball!' };
            case NJOX.CREATURE_TYPES.SPLITTER:
                return { type: 'pierce', message: 'All Splitters cleared! Piercing balls next turn!' };
            case NJOX.CREATURE_TYPES.EATER:
                return { type: 'doubleDamage', message: 'All Eaters cleared! 2x Damage next turn!' };
            case NJOX.CREATURE_TYPES.COUNTER:
                return { type: 'skipAdvance', message: 'All Counters cleared! Creatures skip advance!' };
            case NJOX.CREATURE_TYPES.REACTIVE:
                return { type: 'extraBalls', amount: 2, message: 'All Reactives cleared! +2 Balls!' };
            default:
                return null;
        }
    }

    consumeReward() {
        const reward = this.pendingReward;
        this.pendingReward = null;
        return reward;
    }

    // Apply a reward to game state
    applyReward(reward, ballManager) {
        if (!reward) return;
        this.rewardMessage = reward.message;
        this.rewardTimer = 2.0;

        switch (reward.type) {
            case 'extraBalls':
                ballManager.addBalls(reward.amount || 1);
                break;
            case 'pierce':
                ballManager.pierceActive = true;
                break;
            case 'doubleDamage':
                ballManager.doubleDamage = true;
                break;
            case 'skipAdvance':
                // Handled by caller — skip advanceRows
                break;
        }
    }

    update(dt) {
        if (this.rewardTimer > 0) {
            this.rewardTimer -= dt;
        }
    }

    render(ctx) {
        if (this.rewardTimer > 0) {
            const alpha = Math.min(1, this.rewardTimer);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.rewardMessage, NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 40);
            ctx.restore();
        }
    }
};
