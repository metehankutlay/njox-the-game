window.NJOX = window.NJOX || {};

NJOX.BallManager = class BallManager {
    constructor() {
        this.balls = [];
        this.totalCount = NJOX.INITIAL_BALLS;
        this.launchQueue = 0;
        this.launchTimer = 0;
        this.launchAngle = 0;
        this.launchX = NJOX.CANVAS_W / 2;
        this.launching = false;
        this.firstLandX = null;

        // Power-ups
        this.pierceActive = false;
        this.doubleDamage = false;
        this.bonusDamage  = 0;   // Iron Fist skill + Rage Mode card

        // Ball modifiers queue: [{type: 'fire', remaining: 5}, ...]
        this.modifierQueue = [];
    }

    // Queue a modifier for the next N balls
    queueModifier(type, count) {
        this.modifierQueue.push({ type, remaining: count });
    }

    // Get the next ball type from modifier queue
    _consumeModifier() {
        if (this.modifierQueue.length === 0) return 'normal';
        const mod = this.modifierQueue[0];
        mod.remaining--;
        const type = mod.type;
        if (mod.remaining <= 0) this.modifierQueue.shift();
        return type;
    }

    startLaunch(angle, originX) {
        this.launchAngle = angle;
        this.launchX = originX;
        this.launchQueue = this.totalCount;
        this.launchTimer = 0;
        this.launching = true;
        this.firstLandX = null;
        this.balls = [];
    }

    update(dt) {
        if (this.launching && this.launchQueue > 0) {
            this.launchTimer -= dt;
            if (this.launchTimer <= 0) {
                const ball = new NJOX.Ball(this.launchX, NJOX.FLOOR_Y);
                ball.launch(this.launchAngle);
                ball.type = this._consumeModifier();
                if (this.pierceActive || ball.type === 'ghost') ball.pierce = true;
                this.balls.push(ball);
                this.launchQueue--;
                this.launchTimer = NJOX.LAUNCH_INTERVAL;
                if (this.launchQueue <= 0) {
                    this.launching = false;
                }
            }
        }

        for (const ball of this.balls) {
            ball.update(dt);
        }
    }

    render(ctx) {
        for (const ball of this.balls) {
            ball.render(ctx);
        }

        if (this.allReturned() && !this.launching) {
            ctx.fillStyle = NJOX.COLORS.BALL;
            ctx.beginPath();
            ctx.arc(this.launchX, NJOX.FLOOR_Y, NJOX.BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    allReturned() {
        if (this.launching) return false;
        return this.balls.every(b => !b.active);
    }

    activeCount() {
        return this.balls.filter(b => b.active).length;
    }

    onBallLand(ball) {
        if (this.firstLandX === null) {
            this.firstLandX = ball.x;
        }
    }

    addBalls(count) {
        this.totalCount += count;
    }

    resetPowerUps() {
        this.pierceActive = false;
        this.doubleDamage = false;
    }

    getDamage() {
        const base = this.doubleDamage ? 2 : 1;
        // Iron Fist: +12% per level (multiplicative) — max 3 levels = +36%
        const ironFistMult = 1 + (this.bonusDamage || 0) * 0.12;
        return base * ironFistMult;
    }
};
