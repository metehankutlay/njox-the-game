window.NJOX = window.NJOX || {};

NJOX.Input = class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.aimAngle = -Math.PI / 2; // straight up
        this.isAiming = false;
        this.launchRequested = false;
        this.mouseX = 0;
        this.mouseY = 0;

        // Launch origin — where balls come from (bottom center)
        this.launchX = NJOX.CANVAS_W / 2;
        this.launchY = NJOX.FLOOR_Y;

        this._onDown = this._onDown.bind(this);
        this._onMove = this._onMove.bind(this);
        this._onUp = this._onUp.bind(this);

        canvas.addEventListener('mousedown', this._onDown);
        canvas.addEventListener('mousemove', this._onMove);
        canvas.addEventListener('mouseup', this._onUp);
        canvas.addEventListener('touchstart', this._onDown, { passive: false });
        canvas.addEventListener('touchmove', this._onMove, { passive: false });
        canvas.addEventListener('touchend', this._onUp);
    }

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = NJOX.CANVAS_W / rect.width;
        const scaleY = NJOX.CANVAS_H / rect.height;
        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    _onDown(e) {
        e.preventDefault();
        // Unlock audio on first gesture — required by browser autoplay policy
        if (window.NJOX && NJOX.Sound) NJOX.Sound.unlock();
        const pos = this._getPos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;
        this.isAiming = true;
        this._updateAngle();
    }

    _onMove(e) {
        e.preventDefault();
        if (!this.isAiming) return;
        const pos = this._getPos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;
        this._updateAngle();
    }

    _onUp(e) {
        if (this.isAiming) {
            this.launchRequested = true;
        }
        this.isAiming = false;
    }

    _updateAngle() {
        const dx = this.mouseX - this.launchX;
        const dy = this.mouseY - this.launchY;
        let angle = Math.atan2(dy, dx);
        // Clamp to upward direction (between -170 and -10 degrees)
        const minAngle = -Math.PI * 0.95;
        const maxAngle = -Math.PI * 0.05;
        angle = NJOX.Utils.clamp(angle, minAngle, maxAngle);
        this.aimAngle = angle;
    }

    consumeLaunch() {
        if (this.launchRequested) {
            this.launchRequested = false;
            return true;
        }
        return false;
    }

    // Update launch origin (set to where first ball landed last turn)
    setLaunchOrigin(x) {
        this.launchX = NJOX.Utils.clamp(x, NJOX.BALL_RADIUS, NJOX.CANVAS_W - NJOX.BALL_RADIUS);
        this.launchY = NJOX.FLOOR_Y;
    }
};
