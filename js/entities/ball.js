window.NJOX = window.NJOX || {};

NJOX.Ball = class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = NJOX.BALL_RADIUS;
        this.active = false;
        this.pierce = false;
        this.type = 'normal'; // 'normal', 'fire', 'ice'
        this.trail = [];
        this.wallBounces = 0; // consecutive side-wall bounces without hitting a creature
    }

    launch(angle) {
        this.vx = Math.cos(angle) * NJOX.BALL_SPEED;
        this.vy = Math.sin(angle) * NJOX.BALL_SPEED;
        this.active = true;
        this.trail = [];
    }

    getDamageMultiplier() {
        if (this.type === 'fire')  return NJOX._fireBoostActive ? 5 : 3;
        if (this.type === 'ghost') return 2; // pierces + 2x damage
        if (this.type === 'bomb')  return 1; // AoE handled separately in physics
        return 1;
    }

    update(dt) {
        if (!this.active) return;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.shift();
    }

    render(ctx) {
        if (!this.active) return;

        // Trail color based on type
        const trailColor = this.type === 'fire'  ? '255,80,50'
            : this.type === 'ice'   ? '130,220,255'
            : this.type === 'bomb'  ? '255,120,0'
            : this.type === 'ghost' ? '180,180,255'
            : '255,255,255';

        for (let i = 0; i < this.trail.length; i++) {
            const alpha = (i / this.trail.length) * 0.3;
            const r = this.radius * (0.3 + 0.7 * i / this.trail.length);
            ctx.fillStyle = `rgba(${trailColor},${alpha})`;
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ball color + glow based on type
        if (this.type === 'fire') {
            ctx.fillStyle = 'rgba(255,80,50,0.3)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = NJOX.COLORS.FIRE;
        } else if (this.type === 'ice') {
            ctx.fillStyle = 'rgba(130,220,255,0.3)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = NJOX.COLORS.ICE;
        } else if (this.type === 'bomb') {
            // Bomb: dark orange with bright core
            ctx.fillStyle = 'rgba(255,100,0,0.25)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = NJOX.COLORS.BOMB_BALL;
        } else if (this.type === 'ghost') {
            // Ghost: semi-transparent lavender
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = 'rgba(180,180,255,0.25)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = NJOX.COLORS.GHOST_BALL;
        } else {
            ctx.fillStyle = NJOX.COLORS.BALL_GLOW;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = NJOX.COLORS.BALL;
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1; // restore after ghost transparency

        if (this.pierce && this.type !== 'ghost') {
            ctx.strokeStyle = '#ff0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
};
