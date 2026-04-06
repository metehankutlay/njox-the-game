window.NJOX = window.NJOX || {};

// ─── Chapter Progress & Boss Loot System ───────────────────────────────────
//
// Each chapter = 5 rounds + boss. Progress persists to localStorage.
// Chapter data: { status: 'current'|'defeated'|'locked', boss: {name, defeatedAt} }
//
// Reward scaling follows real game design principles:
//   - Early chapters: low replay cost, small reward (low-stakes, tutorial)
//   - Mid chapters: medium cost/reward (main progression)
//   - Late chapters: high cost, high reward (endgame loop)
//
// Boss gold reward breakdown:
//   - Base: guaranteed flat amount that grows with chapter (always profitable)
//   - Loot roll: weighted 1–40g, heavily skewed to low values
//     • 50% chance to get ≤30% of max
//     • ~2% chance to get max roll (40g at ch10+)
//     • Follows a tiered segment table (common in ARPGs/roguelites)

NJOX.Progress = {

    chapters:         [],   // 1-indexed (index 0 = placeholder null)
    currentChapter:   1,
    totalUnlocked:    1,
    highestBallCount: 4,    // lifetime high — used for carry-over on new runs

    // Daily challenge
    lastDailyDate:    '',   // 'YYYY-MM-DD'
    dailyDone:        false,

    // Passive skill tree
    skills: {
        ironFist:    0,  // +1 hasar/seviye (max 3) — maliyetler: 20/35/55g
        nerveSystem: 0,  // carry-over %50 olur (max 1) — 40g
        stressShield:0,  // Son Şans bedavaya (max 1) — 50g
        bloodTaste:  0,  // her 5/3 kill +1 atış (max 2) — 30/50g
    },

    // ── Lifecycle ──────────────────────────────────────────────────────────
    init() {
        try {
            const raw = localStorage.getItem('njox_progress_v2');
            if (raw) {
                const d = JSON.parse(raw);
                this.chapters         = d.chapters         || [];
                this.currentChapter   = d.currentChapter   || 1;
                this.totalUnlocked    = d.totalUnlocked    || 1;
                this.highestBallCount = d.highestBallCount || 4;
                this.lastDailyDate    = d.lastDailyDate    || '';
                this.dailyDone        = d.dailyDone        || false;
                this.skills           = Object.assign(
                    { ironFist:0, nerveSystem:0, stressShield:0, bloodTaste:0 },
                    d.skills || {}
                );
                this._ensure(this.currentChapter + 1);
                return;
            }
        } catch (_) {}
        this._initFresh();
    },

    _initFresh() {
        this.chapters         = [null];
        this.currentChapter   = 1;
        this.totalUnlocked    = 1;
        this.highestBallCount = 4;
        this.lastDailyDate    = '';
        this.dailyDone        = false;
        this.skills           = { ironFist:0, nerveSystem:0, stressShield:0, bloodTaste:0 };
        this.chapters.push({ status: 'current', boss: null });
        this._save();
    },

    reset() {
        this._initFresh();
    },

    _save() {
        try {
            localStorage.setItem('njox_progress_v2', JSON.stringify({
                chapters:         this.chapters,
                currentChapter:   this.currentChapter,
                totalUnlocked:    this.totalUnlocked,
                highestBallCount: this.highestBallCount,
                lastDailyDate:    this.lastDailyDate,
                dailyDone:        this.dailyDone,
                skills:           this.skills,
            }));
        } catch (_) {}
    },

    // Call whenever ball count increases — persists the lifetime high
    updateHighestBalls(n) {
        if (n > this.highestBallCount) {
            this.highestBallCount = n;
            this._save();
        }
    },

    // ── Daily Challenge ──────────────────────────────────────────────────────
    _todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    },

    isDailyAvailable() {
        const today = this._todayStr();
        if (this.lastDailyDate !== today) {
            // Yeni gün: sıfırla
            this.dailyDone     = false;
            this.lastDailyDate = today;
            this._save();
        }
        return !this.dailyDone;
    },

    completeDaily() {
        this.dailyDone     = true;
        this.lastDailyDate = this._todayStr();
        this._save();
    },

    // Daily seed — bugünün tarihi integer olarak (deterministic level generation için)
    getDailySeed() {
        const d = new Date();
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    },

    // ── Skill Tree ───────────────────────────────────────────────────────────
    SKILL_DEFS: {
        ironFist:     { maxLevel: 3, costs: [20, 35, 55], name: 'Demir Yumruk',    desc: '+1 hasar/seviye' },
        nerveSystem:  { maxLevel: 1, costs: [40],         name: 'Sinir Sistemi',   desc: 'Carry-over %50\'ye çıkar' },
        stressShield: { maxLevel: 1, costs: [50],         name: 'Stres Kalkanı',   desc: 'Son Şans bedava' },
        bloodTaste:   { maxLevel: 2, costs: [30, 50],     name: 'Kan Tadı',        desc: 'Kill kombosu atış ekler' },
    },

    getSkillCost(id) {
        const def = this.SKILL_DEFS[id];
        if (!def) return Infinity;
        const lv = this.skills[id] || 0;
        if (lv >= def.maxLevel) return null; // maxed
        return def.costs[lv];
    },

    purchaseSkill(id, gold) {
        const cost = this.getSkillCost(id);
        if (cost === null || gold < cost) return { ok: false, newGold: gold };
        this.skills[id] = (this.skills[id] || 0) + 1;
        this._save();
        return { ok: true, newGold: gold - cost };
    },

    // Grow array to cover index n and fill gaps as 'locked'
    _ensure(n) {
        while (this.chapters.length <= n) {
            this.chapters.push({ status: 'locked', boss: null });
        }
        // Guarantee currentChapter slot is marked correctly
        if (this.chapters[this.currentChapter]) {
            if (this.chapters[this.currentChapter].status !== 'defeated') {
                this.chapters[this.currentChapter].status = 'current';
            }
        }
    },

    getChapter(n) {
        this._ensure(n + 1);
        return this.chapters[n] || null;
    },

    // Call after normal boss victory
    completeChapter(n, bossName) {
        this._ensure(n + 1);
        this.chapters[n].status = 'defeated';
        this.chapters[n].boss   = { name: bossName, defeatedAt: Date.now() };

        this.currentChapter = n + 1;
        if (this.currentChapter > this.totalUnlocked) {
            this.totalUnlocked = this.currentChapter;
        }
        this._ensure(this.currentChapter + 1);
        this.chapters[this.currentChapter].status = 'current';
        this._save();
    },

    // Call after boss replay victory (rename only, no chapter advance)
    renameBoss(n, newName) {
        if (this.chapters[n] && this.chapters[n].boss) {
            this.chapters[n].boss.name = newName;
            this._save();
        }
    },

    // ── Scaling formulas ──────────────────────────────────────────────────
    //
    // Replay cost: worth replaying even if you barely afford it.
    // Designed so that 2–3 first-clears fund one replay.
    //   ch1=30g · ch3=50g · ch5=70g · ch10=120g
    getReplayCost(n) {
        return 30 + (n - 1) * 10;
    },

    // Reward: base guaranteed + max of loot roll
    //   base:    ch1=12g · ch5=19g · ch10=27g
    //   maxLoot: ch1=15g · ch5=30g · ch10=40g (capped at 40)
    // Boss ödülü: ch1≈20g base+12g loot, ch5≈30+24, ch10≈43+36
    // Hedef: oyuncu 4-5 chapteri bitirince tüm skill tree'yi açabilsin
    getRewardInfo(n) {
        const base    = 16 + Math.floor(n * 2.2);
        const maxLoot = Math.min(55, 18 + n * 4);
        return { base, maxLoot };
    },

    // Weighted loot roll — tiered probability, low values common, max very rare
    // Each tier: [upper_pct_of_max, cumulative_probability_out_of_100]
    rollLootGold(maxLoot) {
        const tiers = [
            [0.10, 20],   // 1 – 10% of max : 20% chance
            [0.25, 42],   // 10 – 25%        : 22%
            [0.40, 60],   // 25 – 40%        : 18%
            [0.55, 73],   // 40 – 55%        : 13%
            [0.70, 83],   // 55 – 70%        : 10%
            [0.82, 90],   // 70 – 82%        :  7%
            [0.91, 95],   // 82 – 91%        :  5%
            [0.97, 98],   // 91 – 97%        :  3%
            [0.99, 99],   // 97 – 99%        :  1%
            [1.00, 100],  // 99 – 100%       :  1% (jackpot)
        ];

        const roll = Math.random() * 100;
        let prevUpper = 1;
        for (const [pct, cumW] of tiers) {
            const upper = Math.max(1, Math.round(maxLoot * pct));
            if (roll <= cumW) {
                return NJOX.Utils.randInt(prevUpper, upper);
            }
            prevUpper = upper + 1;
        }
        return maxLoot;
    },
};
