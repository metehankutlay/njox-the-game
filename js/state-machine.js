window.NJOX = window.NJOX || {};

NJOX.StateMachine = class StateMachine {
    constructor() {
        this.states = {};
        this.current = null;
        this.currentName = null;
    }

    add(name, stateObj) {
        // stateObj must have: enter(data), update(dt), render(ctx), exit()
        this.states[name] = stateObj;
    }

    transition(name, data) {
        if (this.current && this.current.exit) {
            this.current.exit();
        }
        this.currentName = name;
        this.current = this.states[name];
        if (this.current && this.current.enter) {
            this.current.enter(data);
        }
    }

    update(dt) {
        if (this.current && this.current.update) {
            this.current.update(dt);
        }
    }

    render(ctx) {
        if (this.current && this.current.render) {
            this.current.render(ctx);
        }
    }
};
