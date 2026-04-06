window.NJOX = window.NJOX || {};

// Boss flow is managed via states in the main game state machine.
// This module provides helper functions for the boss encounter sequence.

NJOX.BossFlow = {
    boss: null,
    introTimer: 0,
    victoryTimer: 0,

    startPrompt(modal, callback) {
        modal.show({
            title: 'BOSS INCOMING',
            body: 'What is stressing you the most right now?',
            showInput: true,
            onSubmit: (answer) => {
                callback(answer);
            }
        });
    },

    createBoss(level, name) {
        this.boss = new NJOX.Boss(level, name);
        this.boss.entranceTimer = 1.0;
        this.introTimer = 1.5;
        return this.boss;
    },

    isBossDefeated() {
        return this.boss && !this.boss.alive && this.boss.animState !== 'death';
    },

    update(dt) {
        if (this.introTimer > 0) {
            this.introTimer -= dt;
        }
        if (this.victoryTimer > 0) {
            this.victoryTimer -= dt;
        }
    },

    isIntroPlaying() {
        return this.introTimer > 0;
    }
};
