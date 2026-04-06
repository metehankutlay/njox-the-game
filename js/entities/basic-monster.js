window.NJOX = window.NJOX || {};

NJOX.BasicMonster = class BasicMonster extends NJOX.Creature {
    constructor(x, y, hp) {
        super(x, y, hp, NJOX.CREATURE_TYPES.BASIC);
    }

    getColor() {
        return NJOX.COLORS.BASIC;
    }

    getLabel() {
        return 'Slack Monster';
    }
};
