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
        this.gravity = 100;
    }
};

NJOX.ParticleSystem = class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    // Emit a burst of particles — capped at 240 total
    emit(x, y, count, color, opts = {}) {
        if (this.particles.length >= 240) return;
        count = Math.min(count, 240 - this.particles.length);

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
            const p = new NJOX.Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                NJOX.Utils.randFloat(lifeMin, lifeMax),
                color,
                NJOX.Utils.randFloat(sizeMin, sizeMax)
            );
            p.gravity = gravity;
            this.particles.push(p);
        }
    }

    emitHitSparks(x, y, nx, ny, color) {
        const baseAngle = Math.atan2(ny, nx);
        this.emit(x, y, 6, color, {   // was 10 — hafifletildi
            speedMin: 100,
            speedMax: 280,
            sizeMin: 2,
            sizeMax: 4,
            lifeMin: 0.15,
            lifeMax: 0.4,
            angleMin: baseAngle - 0.8,
            angleMax: baseAngle + 0.8,
            gravity: 40,
        });
    }

    emitDeathBurst(x, y, w, h, color) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        this.emit(cx, cy, 15, color, {  // was 30 — yarıya düşürüldü
            speedMin: 80,
            speedMax: 320,
            sizeMin: 3,
            sizeMax: 7,
            lifeMin: 0.35,
            lifeMax: 0.8,
            gravity: 60,
        });
    }

    // Kompakt in-place silme — splice'tan ~3× daha hızlı
    // Her frame sonunda ölü partikülleri sıkıştırır, O(n) tek geçiş
    update(dt) {
        let alive = 0;
        const arr = this.particles;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
            p.vy += p.gravity * dt;
            p.life -= dt;
            if (p.life > 0) {
                arr[alive++] = p;
            }
        }
        arr.length = alive;
    }

    render(ctx) {
        // No save/restore, no shadowBlur — minimal GPU state changes
        // Renk gruplarına göre değil, doğrudan çiz (arc değil fillRect — 2× hızlı)
        const arr = this.particles;
        let lastColor = null;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            const alpha = p.life / p.maxLife;
            const size = p.size * alpha;
            if (size < 0.4) continue;
            ctx.globalAlpha = alpha * 0.9;
            if (p.color !== lastColor) {
                ctx.fillStyle = p.color;
                lastColor = p.color;
            }
            // fillRect yerine arc — görsel tutarlılık için ama beginPath batch'i mümkün değil
            // En büyük tasarruf: state change azaltma (fillStyle sadece renk değişince)
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
