window.NJOX = window.NJOX || {};

NJOX.AimLine = {
    // Draw dotted aim line with bounce preview
    render(ctx, originX, originY, angle) {
        const maxBounces = 3;
        const maxLength = 800;

        let x = originX;
        let y = originY;
        let dx = Math.cos(angle);
        let dy = Math.sin(angle);

        ctx.save();
        ctx.setLineDash([4, 8]);
        ctx.strokeStyle = NJOX.COLORS.AIM_LINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);

        let bounces = 0;
        let totalDist = 0;

        while (bounces < maxBounces && totalDist < maxLength) {
            // Ray march to next wall/ceiling
            let minT = Infinity;
            let hitType = null;

            // Left wall
            if (dx < 0) {
                const t = (NJOX.BALL_RADIUS - x) / dx;
                if (t > 0 && t < minT) { minT = t; hitType = 'left'; }
            }
            // Right wall
            if (dx > 0) {
                const t = (NJOX.CANVAS_W - NJOX.BALL_RADIUS - x) / dx;
                if (t > 0 && t < minT) { minT = t; hitType = 'right'; }
            }
            // Ceiling
            if (dy < 0) {
                const t = (NJOX.BALL_RADIUS - y) / dy;
                if (t > 0 && t < minT) { minT = t; hitType = 'top'; }
            }
            // Floor
            if (dy > 0) {
                const t = (NJOX.FLOOR_Y - y) / dy;
                if (t > 0 && t < minT) { minT = t; hitType = 'floor'; }
            }

            if (minT === Infinity) break;

            x += dx * minT;
            y += dy * minT;
            totalDist += minT;

            ctx.lineTo(x, y);

            if (hitType === 'floor') break;

            // Bounce
            if (hitType === 'left' || hitType === 'right') {
                dx = -dx;
            } else if (hitType === 'top') {
                dy = -dy;
            }

            bounces++;
        }

        ctx.stroke();
        ctx.restore();

        // Draw small circle at end point
        ctx.fillStyle = NJOX.COLORS.AIM_LINE;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
};
