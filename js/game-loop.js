window.NJOX = window.NJOX || {};

NJOX.GameLoop = class GameLoop {
    constructor(updateFn, renderFn) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;
        this.lastTime = 0;
        this.running = false;
        this._tick = this._tick.bind(this);
        this._workerTimer = null;
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this._startTimer();
    }

    stop() {
        this.running = false;
        if (this._workerTimer) {
            this._workerTimer.terminate();
            this._workerTimer = null;
        }
    }

    _startTimer() {
        // Use a Web Worker to avoid background tab setTimeout throttling.
        // Web Worker timers are not throttled by the browser.
        try {
            const blob = new Blob([
                'setInterval(function(){postMessage("tick")},16)'
            ], { type: 'application/javascript' });
            this._workerTimer = new Worker(URL.createObjectURL(blob));
            this._workerTimer.onmessage = () => {
                if (this.running) this._tick(performance.now());
            };
        } catch (e) {
            // Fallback to rAF if Workers unavailable
            requestAnimationFrame(this._tick);
        }
    }

    _tick(timestamp) {
        if (!this.running) return;

        if (!timestamp) timestamp = performance.now();
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        // Skip tiny frames (worker fires faster than needed)
        if (dt < 0.001) return;

        try {
            this.updateFn(dt);
            this.renderFn();
        } catch (e) {
            console.error('Game loop error:', e);
        }

        // If no worker, schedule next via rAF
        if (!this._workerTimer) {
            requestAnimationFrame(this._tick);
        }
    }
};
