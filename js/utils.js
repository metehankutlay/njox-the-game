window.NJOX = window.NJOX || {};

NJOX.Utils = {
    clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    },

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    normalize(x, y) {
        const len = Math.sqrt(x * x + y * y);
        if (len === 0) return { x: 0, y: -1 };
        return { x: x / len, y: y / len };
    },

    dot(ax, ay, bx, by) {
        return ax * bx + ay * by;
    },

    // Draw a rounded rectangle on canvas
    roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },

    // Circle vs AABB collision — returns { hit, normal, overlap, face } or null
    circleVsRect(cx, cy, cr, rx, ry, rw, rh) {
        // Closest point on rect to circle center
        const closestX = NJOX.Utils.clamp(cx, rx, rx + rw);
        const closestY = NJOX.Utils.clamp(cy, ry, ry + rh);

        const dx = cx - closestX;
        const dy = cy - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq >= cr * cr) return null;

        const dist = Math.sqrt(distSq);
        let nx, ny;
        if (dist === 0) {
            // Circle center inside rect — push out via closest edge
            const toLeft = cx - rx;
            const toRight = rx + rw - cx;
            const toTop = cy - ry;
            const toBottom = ry + rh - cy;
            const minDist = Math.min(toLeft, toRight, toTop, toBottom);
            if (minDist === toTop) { nx = 0; ny = -1; }
            else if (minDist === toBottom) { nx = 0; ny = 1; }
            else if (minDist === toLeft) { nx = -1; ny = 0; }
            else { nx = 1; ny = 0; }
        } else {
            nx = dx / dist;
            ny = dy / dist;
        }

        // Determine which face was hit
        let face;
        if (closestY <= ry + 1) face = 'top';
        else if (closestY >= ry + rh - 1) face = 'bottom';
        else if (closestX <= rx + 1) face = 'left';
        else face = 'right';

        return {
            hit: true,
            nx, ny,
            overlap: cr - dist,
            face
        };
    },

    // Random int in range [min, max]
    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // Random float in range [min, max)
    randFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    // Shuffle array in place
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};
