window.NJOX = window.NJOX || {};

NJOX.Modal = class Modal {
    constructor() {
        this.visible = false;
        this.alpha = 0;
        this.title = '';
        this.body = '';
        this.showInput = false;
        this.inputValue = '';
        this.buttons = []; // { text, callback }
        this.onSubmit = null;

        // HTML input element (for boss prompt)
        this.inputEl = null;
        this.submitBtn = null;
    }

    show(opts) {
        this.visible = true;
        this.alpha = 0;
        this.title = opts.title || '';
        this.body = opts.body || '';
        this.showInput = opts.showInput || false;
        this.buttons = opts.buttons || [];
        this.onSubmit = opts.onSubmit || null;
        this.onSkip   = opts.onSkip   || null;
        this.inputValue = '';
        this._placeholder = opts.placeholder || '';
        this._submitText  = opts.submitText  || '';

        if (this.showInput) {
            this._createInputEl();
        }
    }

    hide() {
        this.visible = false;
        this.alpha = 0;
        this._removeInputEl();
    }

    _createInputEl() {
        if (this.inputEl) return;

        const container = document.getElementById('modal-container');
        container.style.display = 'flex';

        this.inputEl = document.createElement('input');
        this.inputEl.type = 'text';
        this.inputEl.placeholder = this._placeholder || 'Type here...';
        this.inputEl.id = 'boss-input';
        this.inputEl.maxLength = 30;

        this.submitBtn = document.createElement('button');
        this.submitBtn.textContent = this._submitText || 'FIGHT IT';
        this.submitBtn.id = 'boss-submit';

        container.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'modal-title';
        title.textContent = this.title;
        container.appendChild(title);

        if (this.body) {
            const body = document.createElement('div');
            body.className = 'modal-body';
            body.textContent = this.body;
            container.appendChild(body);
        }

        container.appendChild(this.inputEl);
        container.appendChild(this.submitBtn);

        // Optional skip button (for rename-after-replay flow)
        if (this.onSkip) {
            const skipBtn = document.createElement('button');
            skipBtn.textContent = 'SKIP';
            skipBtn.id = 'boss-skip';
            skipBtn.style.cssText = 'margin-top:6px;background:transparent;color:rgba(255,255,255,0.45);border:1px solid rgba(255,255,255,0.2);padding:6px 24px;cursor:pointer;font-family:monospace;border-radius:4px;';
            container.appendChild(skipBtn);
            skipBtn.addEventListener('click', () => {
                if (this.onSkip) this.onSkip();
                this.hide();
            });
        }

        this.inputEl.focus();

        const handleSubmit = () => {
            const val = this.inputEl.value.trim();
            if (val && this.onSubmit) {
                this.onSubmit(val);
                this.hide();
            }
        };

        this.submitBtn.addEventListener('click', handleSubmit);
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSubmit();
        });
    }

    _removeInputEl() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.inputEl = null;
        this.submitBtn = null;
    }

    update(dt) {
        if (this.visible) {
            this.alpha = Math.min(1, this.alpha + dt * 4);
        }
    }

    render(ctx) {
        if (!this.visible || this.showInput) return; // HTML handles input modal

        ctx.save();
        ctx.globalAlpha = this.alpha;

        // Backdrop
        ctx.fillStyle = NJOX.COLORS.MODAL_BG;
        ctx.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

        // Box
        const boxW = 300;
        const boxH = 180;
        const boxX = (NJOX.CANVAS_W - boxW) / 2;
        const boxY = (NJOX.CANVAS_H - boxH) / 2;

        ctx.fillStyle = '#1a1a2e';
        NJOX.Utils.roundRect(ctx, boxX, boxY, boxW, boxH, 12);
        ctx.fill();
        ctx.strokeStyle = NJOX.COLORS.FLOOR;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Title
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.title, NJOX.CANVAS_W / 2, boxY + 40);

        // Body
        if (this.body) {
            ctx.fillStyle = NJOX.COLORS.TEXT_DIM;
            ctx.font = '13px monospace';
            // Word wrap
            const words = this.body.split(' ');
            let line = '';
            let lineY = boxY + 70;
            for (const word of words) {
                const test = line + word + ' ';
                if (ctx.measureText(test).width > boxW - 40) {
                    ctx.fillText(line, NJOX.CANVAS_W / 2, lineY);
                    line = word + ' ';
                    lineY += 18;
                } else {
                    line = test;
                }
            }
            ctx.fillText(line, NJOX.CANVAS_W / 2, lineY);
        }

        // Buttons
        const btnY = boxY + boxH - 45;
        const btnW = 100;
        const btnH = 30;
        const totalBtnW = this.buttons.length * (btnW + 10) - 10;
        let btnX = (NJOX.CANVAS_W - totalBtnW) / 2;

        for (const btn of this.buttons) {
            ctx.fillStyle = NJOX.COLORS.BUTTON;
            NJOX.Utils.roundRect(ctx, btnX, btnY, btnW, btnH, 6);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(btn.text, btnX + btnW / 2, btnY + btnH / 2);

            btn._x = btnX;
            btn._y = btnY;
            btn._w = btnW;
            btn._h = btnH;

            btnX += btnW + 10;
        }

        ctx.restore();
    }

    handleClick(x, y) {
        if (!this.visible || this.showInput) return;
        for (const btn of this.buttons) {
            if (x >= btn._x && x <= btn._x + btn._w &&
                y >= btn._y && y <= btn._y + btn._h) {
                if (btn.callback) btn.callback();
                return true;
            }
        }
        return false;
    }
};
