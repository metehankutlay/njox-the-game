window.NJOX = window.NJOX || {};

NJOX.Renderer = {
    // Draw creature face — expression: 'normal' | 'angry' | 'scared' | 'surprised'
    drawFace(ctx, cx, cy, w, h, opts = {}) {
        const {
            blinkPhase = 0,
            mouthOpen = 0,
            angry = false,           // legacy compat
            expression = 'normal',
            color = '#fff',
            scale = 1,
        } = opts;

        const expr = angry ? 'angry' : expression;
        const eyeSpacing = w * 0.22 * scale;
        const baseEyeY   = cy - h * 0.08 * scale;
        const eyeRadius  = w * 0.08 * scale;
        const mouthY     = cy + h * 0.18 * scale;
        const mouthW     = w * 0.2 * scale;

        // Expression-specific eye adjustments
        const eyeSizeX = expr === 'scared' || expr === 'surprised'
            ? eyeRadius * 1.35 : eyeRadius;
        const eyeSizeY = expr === 'surprised'
            ? eyeRadius * 1.5
            : expr === 'scared' ? eyeRadius * 1.3 : eyeRadius;
        const eyeY = expr === 'scared' ? baseEyeY - 2 : baseEyeY;
        const eyeH = eyeSizeY * 2 * (1 - blinkPhase * (expr === 'surprised' ? 0.4 : 0.9));

        // Eyes
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, eyeY, eyeSizeX, Math.max(eyeH / 2, 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, eyeY, eyeSizeX, Math.max(eyeH / 2, 0.5), 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        if (blinkPhase < 0.7) {
            ctx.fillStyle = '#1a1a2e';
            const pupilR = eyeSizeX * (expr === 'scared' ? 0.6 : 0.5);
            ctx.beginPath();
            ctx.arc(cx - eyeSpacing, eyeY, pupilR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + eyeSpacing, eyeY, pupilR, 0, Math.PI * 2);
            ctx.fill();

            // Scared: sweat drops above pupils
            if (expr === 'scared') {
                ctx.fillStyle = 'rgba(150,200,255,0.7)';
                ctx.beginPath();
                ctx.ellipse(cx - eyeSpacing + eyeSizeX * 0.4, eyeY - eyeSizeY * 0.8, 1.5, 2.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(cx + eyeSpacing + eyeSizeX * 0.4, eyeY - eyeSizeY * 0.8, 1.5, 2.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Eyebrows
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * scale;
        if (expr === 'angry') {
            // Angry V-shape brows (slanted inward)
            ctx.beginPath();
            ctx.moveTo(cx - eyeSpacing - eyeRadius, eyeY - eyeRadius * 1.5);
            ctx.lineTo(cx - eyeSpacing + eyeRadius, eyeY - eyeRadius * 0.7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + eyeSpacing + eyeRadius, eyeY - eyeRadius * 1.5);
            ctx.lineTo(cx + eyeSpacing - eyeRadius, eyeY - eyeRadius * 0.7);
            ctx.stroke();
        } else if (expr === 'scared') {
            // Scared raised curved brows
            ctx.lineWidth = 1.5 * scale;
            ctx.beginPath();
            ctx.moveTo(cx - eyeSpacing - eyeRadius * 0.8, eyeY - eyeRadius * 1.4);
            ctx.quadraticCurveTo(cx - eyeSpacing, eyeY - eyeRadius * 2.2, cx - eyeSpacing + eyeRadius * 0.8, eyeY - eyeRadius * 1.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + eyeSpacing - eyeRadius * 0.8, eyeY - eyeRadius * 1.4);
            ctx.quadraticCurveTo(cx + eyeSpacing, eyeY - eyeRadius * 2.2, cx + eyeSpacing + eyeRadius * 0.8, eyeY - eyeRadius * 1.4);
            ctx.stroke();
        }

        // Mouth
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * scale;

        const effectiveMouthOpen = mouthOpen > 0.1 ? mouthOpen
            : expr === 'surprised' ? 0.7
            : expr === 'scared'    ? 0.35
            : 0;

        if (effectiveMouthOpen > 0.1) {
            const innerColor = expr === 'angry' ? '#440000'
                : expr === 'scared'    ? '#1a0030'
                : expr === 'surprised' ? '#220044'
                : '#2a0a3a';
            ctx.fillStyle = innerColor;
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, mouthW * (expr === 'surprised' ? 0.6 : 1),
                mouthW * 0.65 * effectiveMouthOpen, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.stroke();

            // Scared: sweat drops at mouth corners
        } else if (expr === 'scared') {
            // Wobbly/squiggly scared mouth
            ctx.beginPath();
            ctx.moveTo(cx - mouthW, mouthY);
            ctx.lineTo(cx - mouthW * 0.5, mouthY + 3);
            ctx.lineTo(cx,                mouthY - 3);
            ctx.lineTo(cx + mouthW * 0.5, mouthY + 3);
            ctx.lineTo(cx + mouthW,        mouthY);
            ctx.stroke();
        } else if (expr === 'angry') {
            ctx.beginPath();
            ctx.arc(cx, mouthY + mouthW * 0.5, mouthW, -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();
        } else {
            // Normal: smile
            ctx.beginPath();
            ctx.arc(cx, mouthY - mouthW * 0.3, mouthW, Math.PI * 0.2, Math.PI * 0.8);
            ctx.stroke();
        }
    },

    // Glow effect around a point
    drawGlow(ctx, x, y, radius, color, alpha = 0.3) {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, color.replace(')', `,${alpha})`).replace('rgb', 'rgba'));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    },

    // Draw a glowing ball
    drawBall(ctx, x, y, radius) {
        // Glow
        ctx.fillStyle = NJOX.COLORS.BALL_GLOW;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Core
        ctx.fillStyle = NJOX.COLORS.BALL;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    },

    // Draw background gradient
    drawBackground(ctx, w, h) {
        // Shadow state sıfırla — önceki frame'den sızan shadowColor/Blur'ü temizle
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, NJOX.COLORS.BG_GRADIENT_TOP);
        grad.addColorStop(1, NJOX.COLORS.BG_GRADIENT_BOT);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    },

    // Screen shake helper
    shakeOffset: { x: 0, y: 0 },
    shakeTimer: 0,
    shakeIntensity: 0,

    triggerShake(intensity = 5, duration = 0.2) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    },

    updateShake(dt) {
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            this.shakeOffset.x = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            this.shakeOffset.y = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            if (this.shakeTimer <= 0) {
                this.shakeOffset.x = 0;
                this.shakeOffset.y = 0;
            }
        }
    }
};
