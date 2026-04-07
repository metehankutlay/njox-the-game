window.NJOX = window.NJOX || {};

NJOX.Particle = class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.alive = true;
    }
};

NJOX.ParticleSystem = class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    // Emit a burst of particles — capped at 300 total
    emit(x, y, count, color, opts = {}) {
        if (this.particles.length >= 300) return; // performance cap
        count = Math.min(count, 300 - this.particles.length);

        const {
            speedMin = 50,
            speedMax = 200,
            sizeMin = 2,
            sizeMax = 5,
            lifeMin = 0.3,
            lifeMax = 0.8,
            angleMin = 0,
            angleMax = Math.PI * 2,
            gravity = 100,
        } = opts;

        for (let i = 0; i < count; i++) {
            const angle = NJOX.Utils.randFloat(angleMin, angleMax);
            const speed = NJOX.Utils.randFloat(speedMin, speedMax);
            const size = NJOX.Utils.randFloat(sizeMin, sizeMax);
            const life = NJOX.Utils.randFloat(lifeMin, lifeMax);

            const p = new NJOX.Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                life, color, size
            );
            p.gravity = gravity;
            this.particles.push(p);
        }
    }

    emitHitSparks(x, y, nx, ny, color) {
        const baseAngle = Math.atan2(ny, nx);
        this.emit(x, y, 10, color, {
            speedMin: 100,
            speedMax: 300,
            sizeMin: 2,
            sizeMax: 5,
            lifeMin: 0.2,
            lifeMax: 0.5,
            angleMin: baseAngle - 0.8,
            angleMax: baseAngle + 0.8,
            gravity: 40,
        });
    }

    emitDeathBurst(x, y, w, h, color) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        this.emit(cx, cy, 30, color, {
            speedMin: 80,
            speedMax: 350,
            sizeMin: 3,
            sizeMax: 8,
            lifeMin: 0.4,
            lifeMax: 0.9,
            gravity: 60,
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += (p.gravity || 100) * dt;
            p.life -= dt;
            if (p.life <= 0) {
                p.alive = false;
                this.particles.splice(i, 1);
            }
        }
    }

    render(ctx) {
        // No save/restore, no shadowBlur — massive GPU savings
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            const size = p.size * alpha;
            if (size < 0.5) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    clear() {
        this.particles = [];
    }
};
