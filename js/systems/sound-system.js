window.NJOX = window.NJOX || {};

// Web Audio API synthesized sound effects — no external files needed
NJOX.Sound = {
    _ctx: null,
    muted: false,
    _activeOsc: 0,    // concurrent oscillator counter
    _MAX_OSC: 14,     // max simultaneous oscillators
    _lastToneTime: 0, // safety reset timestamp

    // Call on first user gesture AND on visibility return
    unlock() {
        if (this.muted) return;
        if (!this._ctx) {
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) { this.muted = true; return; }
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
    },

    // Call once at startup — adds visibility listener for tab-switch resume
    init() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this._ctx && this._ctx.state === 'suspended') {
                this._ctx.resume();
            }
        });
        // Also resume on any touch/click (mobile browsers require user gesture)
        const resumeOnGesture = () => this.unlock();
        document.addEventListener('touchstart', resumeOnGesture, { passive: true });
        document.addEventListener('mousedown', resumeOnGesture, { passive: true });
    },

    _get() {
        if (this.muted || !this._ctx) return null;
        if (this._ctx.state === 'suspended') this._ctx.resume();
        // Safety: onended bazen tetiklenmez (tab suspend, GC) → sayaç sıkışır
        // 2s boyunca yeni ses gelmemişse sayacı sıfırla
        if (this._activeOsc > 0 && this._lastToneTime && Date.now() - this._lastToneTime > 2000) {
            this._activeOsc = 0;
        }
        return this._ctx;
    },

    // Core tone generator — with oscillator pool limit
    _tone(freq, type, dur, vol = 0.18, freqEnd = null, delayMs = 0) {
        if (this._activeOsc >= this._MAX_OSC) return; // skip if too many
        const ctx = this._get();
        if (!ctx) return;
        const startAt = ctx.currentTime + delayMs / 1000;
        try {
            this._activeOsc++;
            this._lastToneTime = Date.now();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, startAt);
            if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, startAt + dur);
            gain.gain.setValueAtTime(vol, startAt);
            gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
            osc.start(startAt);
            osc.stop(startAt + dur);
            osc.onended = () => { this._activeOsc = Math.max(0, this._activeOsc - 1); };
        } catch(e) { this._activeOsc = Math.max(0, this._activeOsc - 1); }
    },

    // --- Ball hit sounds (per type) ---
    ballHit(ballType) {
        if (ballType === 'fire') {
            this._tone(160, 'sawtooth', 0.07, 0.18, 80);
            this._tone(280, 'square',   0.04, 0.08);
        } else if (ballType === 'ice') {
            this._tone(1400, 'sine', 0.05, 0.12, 700);
            this._tone(900,  'sine', 0.04, 0.06, 450, 20);
        } else if (ballType === 'bomb') {
            this._tone(55,  'sawtooth', 0.15, 0.28, 25);
            this._tone(180, 'square',   0.06, 0.10);
        } else if (ballType === 'ghost') {
            this._tone(500, 'sine', 0.06, 0.10, 200);
        } else {
            // normal — short click/thwack
            this._tone(240, 'square', 0.04, 0.14, 180);
        }
    },

    // Wall / ceiling bounce — rate-limited by caller
    wallBounce() {
        this._tone(320, 'sine', 0.035, 0.05);
    },

    // Creature death — pitch artar combo ile (comboLevel 0=normal, max ~15)
    creatureDeath(comboLevel = 0) {
        const p = 1 + Math.min(comboLevel, 15) * 0.06; // max +90% tizlik
        this._tone(200 * p, 'sawtooth', 0.10, 0.18, 50 * p);
        this._tone(120 * p, 'square',   0.08, 0.08, 40 * p, 30);
    },

    // Bomb explosion AoE
    bombExplode() {
        this._tone(70,  'sawtooth', 0.22, 0.35, 20);
        this._tone(180, 'square',   0.08, 0.12);
        this._tone(350, 'sine',     0.06, 0.08, 100, 50);
    },

    // Ball pickup (field or from carrier)
    ballPickup() {
        this._tone(880,  'sine', 0.06, 0.14);
        this._tone(1320, 'sine', 0.06, 0.10, null, 40);
    },

    // Gold pickup
    goldPickup() {
        this._tone(660, 'sine', 0.05, 0.11);
        this._tone(990, 'sine', 0.05, 0.09, null, 35);
    },

    // Boss hit
    bossHit() {
        this._tone(110, 'sawtooth', 0.10, 0.22, 70);
    },

    // Vampire drain — ball stolen
    vampireDrain() {
        this._tone(200, 'sine', 0.12, 0.15, 100);
        this._tone(600, 'sine', 0.06, 0.08, 200, 60);
    },

    // Level clear fanfare
    levelClear() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this._tone(f, 'sine', 0.15, 0.18, null, i * 100));
    },

    // Boss defeated
    bossDefeated() {
        const notes = [392, 494, 587, 784];
        notes.forEach((f, i) => this._tone(f, 'sine', 0.2, 0.22, null, i * 120));
    },

    // Stress ismi patlaması — derin boom + cam kırılması
    stressDestroy(lvl = 1) {
        const p = 1 + (lvl - 1) * 0.15;
        this._tone(55  * p, 'sawtooth', 0.45, 0.50 * p, 18);       // derin patlama
        this._tone(130 * p, 'square',   0.20, 0.28 * p, 40, 40);    // orta çatlama
        this._tone(900 * p, 'sine',     0.18, 0.15,     200, 20);   // cam tiz kırılma
        this._tone(1400* p, 'sine',     0.12, 0.10,     300, 60);   // yüksek kıymık
    },

    // Toggle mute — returns new state
    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }
};

// Rate-limit wall/hit sounds to avoid audio overload
NJOX.Sound._lastWall = 0;
NJOX.Sound._lastHit  = 0;

NJOX.Sound.wallBounceRateLimited = function() {
    const now = Date.now();
    if (now - this._lastWall > 70) {
        this._lastWall = now;
        this.wallBounce();
    }
};

NJOX.Sound.ballHitRateLimited = function(ballType, comboLevel = 0) {
    const now = Date.now();
    if (now - this._lastHit > 50) {
        this._lastHit = now;
        // Combo level gelirse normal bal hit'i tizleştir
        if (comboLevel >= 3) {
            const p = 1 + Math.min(comboLevel, 15) * 0.04;
            this._tone(240 * p, 'square', 0.04, 0.14, 180 * p);
        } else {
            this.ballHit(ballType);
        }
    }
};
