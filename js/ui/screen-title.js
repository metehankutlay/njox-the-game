window.NJOX = window.NJOX || {};

NJOX.TitleScreen = {
    time: 0,
    // Decorative floating balls
    balls: [],

    init() {
        this.time = 0;
        this.balls = [];
        for (let i = 0; i < 15; i++) {
            this.balls.push({
                x: Math.random() * NJOX.CANVAS_W,
                y: Math.random() * NJOX.CANVAS_H,
                vx: (Math.random() - 0.5) * 60,
                vy: (Math.random() - 0.5) * 60,
                radius: 3 + Math.random() * 4,
                alpha: 0.1 + Math.random() * 0.3,
            });
        }
    },

    update(dt) {
        this.time += dt;
        for (const b of this.balls) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < 0 || b.x > NJOX.CANVAS_W) b.vx *= -1;
            if (b.y < 0 || b.y > NJOX.CANVAS_H) b.vy *= -1;
        }
    },

    render(ctx) {
        // Background
        NJOX.Renderer.drawBackground(ctx, NJOX.CANVAS_W, NJOX.CANVAS_H);

        // Floating balls
        for (const b of this.balls) {
            ctx.fillStyle = `rgba(255,255,255,${b.alpha})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Title
        const bounce = Math.sin(this.time * 2) * 8;
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NJOX', NJOX.CANVAS_W / 2, 220 + bounce);

        // Subtitle
        ctx.fillStyle = NJOX.COLORS.FLOOR;
        ctx.font = '14px monospace';
        ctx.fillText('Fight Your Stress', NJOX.CANVAS_W / 2, 270 + bounce * 0.5);

        // Stress name section
        this._changeBtnRect = null;
        if (NJOX._stressName) {
            const CX    = NJOX.CANVAS_W / 2;
            const baseY = 290 + bounce * 0.4;

            // Hedef etiketi
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font      = '11px monospace';
            ctx.fillText('HEDEF', CX, baseY);

            // İsim kutusu — glow'lu, belirgin
            const nameW = 260, nameH = 40;
            const nameX = CX - nameW / 2;
            const nameY = baseY + 10;

            ctx.shadowColor = 'rgba(233,69,96,0.5)';
            ctx.shadowBlur  = 18;
            ctx.fillStyle   = 'rgba(233,69,96,0.15)';
            NJOX.Utils.roundRect(ctx, nameX, nameY, nameW, nameH, 10);
            ctx.fill();
            ctx.shadowBlur  = 0;

            ctx.strokeStyle = '#e94560';
            ctx.lineWidth   = 1.5;
            NJOX.Utils.roundRect(ctx, nameX, nameY, nameW, nameH, 10);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font      = 'bold 18px monospace';
            ctx.fillText(NJOX._stressName, CX, nameY + nameH / 2 + 1);

            // "Değiştir" butonu — belirgin, renkli
            const btnW = 160, btnH = 32;
            const btnX = CX - btnW / 2;
            const btnY = nameY + nameH + 10;

            ctx.fillStyle = '#e94560';
            NJOX.Utils.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
            ctx.fill();

            ctx.strokeStyle = '#ff6b81';
            ctx.lineWidth   = 1.5;
            NJOX.Utils.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font      = 'bold 13px monospace';
            ctx.fillText('✏  STRESİNİ DEĞİŞTİR', CX, btnY + btnH / 2 + 1);

            this._changeBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        // Tap to start — pulsing
        const hasName = !!NJOX._stressName;
        const tapY    = hasName ? 520 : 400;
        const pulse   = Math.sin(this.time * 3) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
        ctx.font = '16px monospace';
        ctx.fillText('Tap to Start', NJOX.CANVAS_W / 2, tapY);
        ctx.globalAlpha = 1;

        // Decorative creature
        const creatureY = (hasName ? 440 : 320) + Math.sin(this.time * 1.5) * 5;
        ctx.fillStyle = NJOX.COLORS.BASIC;
        NJOX.Utils.roundRect(ctx, NJOX.CANVAS_W / 2 - 25, creatureY, 50, 50, 8);
        ctx.fill();
        NJOX.Renderer.drawFace(ctx, NJOX.CANVAS_W / 2, creatureY + 25, 50, 50, {
            blinkPhase: Math.sin(this.time * 0.5) > 0.9 ? 1 : 0,
            mouthOpen: 0,
            angry: false,
            color: '#fff',
            scale: 1,
        });

        ctx.restore();
    }
};
