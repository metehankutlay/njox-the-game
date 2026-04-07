window.NJOX = window.NJOX || {};

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx    = canvas.getContext('2d');

    // ── Dynamic canvas height — fills viewport on any phone ───────────────
    // On tall phones (portrait), the 500:720 ratio leaves empty space at
    // the bottom. We extend CANVAS_H so the canvas fills 100svh, then
    // push FLOOR_Y and SHOP_Y down proportionally.
    {
        const svh = window.innerHeight;
        const vw  = window.innerWidth;
        const cW  = Math.min(vw, svh * 500 / 720); // CSS container width
        const dH  = Math.max(720, Math.round(500 * svh / cW));
        if (dH > NJOX.CANVAS_H) {
            NJOX.CANVAS_H = dH;
            NJOX.FLOOR_Y  = dH - 80;  // 80px = floor-gap(8) + shop bar(72)
            NJOX.SHOP_Y   = dH - 72;
            // NJOX.SHOP_H stays 72
        }
    }

    canvas.width  = NJOX.CANVAS_W;
    canvas.height = NJOX.CANVAS_H;

    // ── Core systems ──────────────────────────────────────────────────────
    const input       = new NJOX.Input(canvas);
    const ballManager = new NJOX.BallManager();
    const levelManager= new NJOX.LevelManager();
    const rewardSystem= new NJOX.RewardSystem();
    const particles   = new NJOX.ParticleSystem();
    const modal       = new NJOX.Modal();
    const shopSystem  = new NJOX.ShopSystem();
    const fsm         = new NJOX.StateMachine();
    const progress    = NJOX.Progress;

    // ── Game state (shared with HUD, shop, etc.) ──────────────────────────
    const game = {
        levelManager, ballManager, rewardSystem, particles, modal, shopSystem,
        gold:           0,
        collectibles:   [],
        roundIndex:     1,
        shotsRemaining: NJOX.SHOTS_PER_ROUND,
        totalKills:     0,
        speedMultiplier:1,
        bossMode:       false,
        _vampireProj:   [],   // vampirin fırlattığı mor saldırı topları
    };

    // ── Shared vars ───────────────────────────────────────────────────────
    let skipAdvance       = false;
    let bossMode          = false;
    let boss              = null;
    let replayMode        = false;   // true when replaying a defeated boss
    let replayChapterNum  = 0;       // which chapter is being replayed
    let turnEndDelay      = 0;
    let gameOverDelay     = 0;
    let sessionStarted    = false;   // true after first MAP visit (player state initialized)

    // ── Juice & feedback vars ─────────────────────────────────────────────
    let shotKills        = 0;        // kills in current single shot — drives combo text
    let comboDisplay     = null;     // { text, timer, scale, maxScale }
    let comboBlast       = null;     // { rings[], flashAlpha, flashColor, timer }
    let comboShards      = [];       // yaratık parçaları ekrana doğru uçar
    let stressNameBurst  = null;     // stres ismi harfleri patlar
    let exhaleTimer      = 0;        // level-clear "nefes" efekti süresi
    let impactHoldTimer  = 0;        // freeze frames after big kill (seconds)
    let lastChanceUsed   = false;    // one Last-Chance per chapter

    // ── Daily / mode flags ────────────────────────────────────────────────
    let dailyMode        = false;    // true → bu run daily challenge'tan başladı

    // ── Stress name (persistent, player-defined) ──────────────────────────
    // njox_stress_name sadece oyuncu bizzat yazarsa set edilir.
    // njox_story_seen: intro görüldü mü (isim olmasa da tekrar gösterme)
    let storyIntroDone = !!localStorage.getItem('njox_story_seen');
    let stressName     = storyIntroDone ? (localStorage.getItem('njox_stress_name') || '') : '';
    NJOX._stressName   = stressName;

    // ── Kart sistemi ──────────────────────────────────────────────────────
    // Her round sonrası 3 kart gösterilir; oyuncu 1 seçer, etkileri o round geçerli

    const CARD_POOL = [
        // ── Pozitif ──────────────────────────────────────────────────────
        { id:'fire_boost',    icon:'🔥', name:'Ateş',         desc:'Bu round ateş toplar 5× hasar',        type:'positive' },
        { id:'chain_death',   icon:'💀', name:'Zincirleme',   desc:'Ölüm komşulara 2 hasar sıçrar',         type:'positive' },
        { id:'extra_shots',   icon:'⚡', name:'+3 Atış',      desc:'Bu round +3 atış hakkı',               type:'positive' },
        { id:'stress_absorb', icon:'🧘', name:'Stres Emici',  desc:'Stresli ölünce +1 top kazanırsın',     type:'positive' },
        { id:'hp_drain',      icon:'⚔️', name:'HP Düşür',    desc:'Tüm düşmanlar HP %25 azalır',          type:'positive' },
        { id:'ball_bonus',    icon:'🎱', name:'+3 Top',       desc:'+3 top kalıcı eklenir',                type:'positive' },
        { id:'gold_rush',     icon:'💰', name:'Altın',        desc:'+12 altın anında',                     type:'positive' },
        { id:'rage_mode',     icon:'😤', name:'Öfke',         desc:'Bu round tüm toplar +2 hasar',         type:'positive' },
        { id:'ice_storm',     icon:'❄️', name:'Buz Fırtınası',desc:'Buz toplar 2 tur dondurur',           type:'positive' },
        // ── Negatif ──────────────────────────────────────────────────────
        { id:'ball_thief',    icon:'👻', name:'Top Çal',      desc:'Hemen 2 kalıcı top kaybedersin',       type:'negative' },
        { id:'blind_round',   icon:'🙈', name:'Kör Atış',     desc:'Bu round nişan çizgisi görünmez',      type:'negative' },
        { id:'stress_wave',   icon:'🌊', name:'Stres Dalgası',desc:'Tüm düşmanlar strese girer +3 HP',     type:'negative' },
        { id:'hp_surge',      icon:'💢', name:'Güç Dalgası',  desc:'Tüm düşmanlar HP %30 artar',           type:'negative' },
        { id:'wrecker_tower', icon:'🗼', name:'Yıkıcı Kule',  desc:'Sahaya iner, her round 1 top yakar',   type:'negative' },
        { id:'speed_curse',   icon:'🐌', name:'Yavaş Top',    desc:'Bu round toplar %45 daha yavaş',       type:'negative' },
    ];

    function _pickRandomCards(n) {
        const positives = CARD_POOL.filter(c => c.type === 'positive');
        const negatives = CARD_POOL.filter(c => c.type === 'negative');
        const result    = [];

        // En az 1 pozitif garanti
        const pickedPos = positives[Math.floor(Math.random() * positives.length)];
        result.push(pickedPos);

        // Kalan 2 slotu mix havuzdan doldur (seçilen kart hariç)
        const remaining = CARD_POOL.filter(c => c !== pickedPos);
        while (result.length < n && remaining.length > 0) {
            const idx = Math.floor(Math.random() * remaining.length);
            result.push(remaining.splice(idx, 1)[0]);
        }

        return NJOX.Utils.shuffle(result);
    }

    function _applyCard(card) {
        switch (card.id) {
            // ── Pozitif ──────────────────────────────────────────────────
            case 'fire_boost':
                NJOX._fireBoostActive = true;
                break;
            case 'extra_shots':
                game.shotsRemaining += 3;
                break;
            case 'rage_mode':
                ballManager.bonusDamage = (ballManager.bonusDamage || 0) + 2;
                break;
            case 'ball_bonus':
                ballManager.addBalls(3);
                game.collectibles.push({ x: NJOX.CANVAS_W/2, y: NJOX.CANVAS_H/2,
                    type:'ball', amount:'+3 🎱', timer:2 });
                break;
            case 'gold_rush':
                game.gold += 12;
                game.collectibles.push({ x: NJOX.CANVAS_W/2, y: NJOX.CANVAS_H/2,
                    type:'gold', amount:12, timer:2 });
                break;
            case 'stress_absorb':
                game._cardStressAbsorb = true;
                break;
            case 'chain_death':
                game._cardChainDeath = true;
                break;
            case 'ice_storm':
                game._cardIceStorm = true;
                break;
            case 'hp_drain':
                for (const c of levelManager.creatures) {
                    if (!c.alive) continue;
                    const cut = Math.max(1, Math.floor(c.hp * 0.25));
                    c.hp = Math.max(1, c.hp - cut);
                }
                break;
            // ── Negatif ──────────────────────────────────────────────────
            case 'ball_thief':
                ballManager.totalCount = Math.max(1, ballManager.totalCount - 2);
                game.collectibles.push({ x: NJOX.CANVAS_W/2, y: NJOX.CANVAS_H/2 - 20,
                    type:'dmg', amount:'-2 🎱', timer:2.2 });
                break;
            case 'blind_round':
                game._cardBlindRound = true;
                break;
            case 'stress_wave':
                for (const c of levelManager.creatures) {
                    if (!c.alive || c.isStressed) continue;
                    c.isStressed = true;
                    c.hp += 3; c.maxHp += 3;
                }
                break;
            case 'hp_surge':
                for (const c of levelManager.creatures) {
                    if (!c.alive) continue;
                    const boost = Math.max(1, Math.floor(c.hp * 0.30));
                    c.hp += boost; c.maxHp += boost;
                }
                break;
            case 'wrecker_tower': {
                // Kule sahada orta üst bölgeye yerleşir
                const tw_x = NJOX.CANVAS_W / 2 - 22;
                const tw_y = NJOX.GRID_TOP + NJOX.CELL_SIZE * 1.5;
                game._wreckerTower = {
                    x: tw_x, y: tw_y, w: 44, h: 44,
                    hp: 6, maxHp: 6, alive: true,
                };
                break;
            }
            case 'speed_curse':
                game._cardSpeedCurse = true;
                break;
        }
    }

    function _resetRoundCards() {
        NJOX._fireBoostActive    = false;
        NJOX._cardVomitPanic     = false;
        game._cardStressAbsorb   = false;
        game._cardChainDeath     = false;
        game._cardIceStorm       = false;
        game._cardBlindRound     = false;
        game._cardSpeedCurse     = false;
        // rage_mode / bonusDamage skill tarafından da set edilebilir, skill değerini koru
        ballManager.bonusDamage  = progress.skills.ironFist || 0;
        // _wreckerTower resetlenmez — chapter boyunca kalır (öldürmezsen)
    }

    // ── Speed button ──────────────────────────────────────────────────────
    const SPEED_BTN = { x: NJOX.CANVAS_W - 54, y: NJOX.FLOOR_Y - 26, w: 48, h: 20 };

    // ═════════════════════════════════════════════════════════════════════
    // CLICK HANDLER
    // ═════════════════════════════════════════════════════════════════════

    function _handleUIClick(x, y) {

        // ── Title screen — "stresini değiştir" butonu ─────────────────
        if (fsm.currentName === 'TITLE') {
            const r = NJOX.TitleScreen._changeBtnRect;
            if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                input.consumeLaunch(); // tıklamayı tüket — TITLE update MAP'e geçmesin
                modal.show({
                    title:       'Stresini değiştir',
                    body:        '',
                    showInput:   true,
                    placeholder: 'stresini yaz...',
                    submitText:  'KAYDET',
                    onSubmit(val) {
                        stressName       = val;
                        NJOX._stressName = val;
                        localStorage.setItem('njox_stress_name', val);
                    },
                    onSkip() { /* sadece kapat */ },
                });
                return;
            }
            return; // diğer title tıklamaları TITLE update'te consumeLaunch ile yakalanır
        }

        // ── World Map ──────────────────────────────────────────────────
        if (fsm.currentName === 'MAP') {
            NJOX.WorldMap.handleClick(x, y, game.gold);
            return;
        }

        // ── Beceri ağacı ───────────────────────────────────────────────
        if (fsm.currentName === 'SKILL_TREE') {
            const st = fsm.current;
            // Geri butonu
            if (st._backRect) {
                const r = st._backRect;
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    fsm.transition('MAP');
                    return;
                }
            }
            // Beceri satın alma butonları
            for (const btn of (st._btnRects || [])) {
                if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                    const result = progress.purchaseSkill(btn.id, game.gold);
                    if (result.ok) {
                        game.gold = result.newGold;
                        // Iron Fist anında mevcut oturuma uygulanır
                        if (btn.id === 'ironFist') {
                            ballManager.bonusDamage = (ballManager.bonusDamage || 0) + 1;
                        }
                        st._msg = { text: '✓ Satın alındı!', timer: 1.8, color: '#4ecca3' };
                    } else {
                        st._msg = { text: '⚠ Yetersiz gold', timer: 1.5, color: '#e94560' };
                    }
                    return;
                }
            }
            return;
        }

        // ── Kart seçimi ────────────────────────────────────────────────
        if (fsm.currentName === 'CARD_PICK') {
            const cp = fsm.current;
            if (cp._chosen !== -1) return; // zaten seçildi
            for (let i = 0; i < cp._btnRects.length; i++) {
                const r = cp._btnRects[i];
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    _applyCard(cp._cards[i]);
                    cp._chosen        = i;
                    cp._revealed      = true;       // diğer kartlar da açılır
                    cp._confirmTimer  = 3.0;        // 3s reveal göster, okunabilir
                    return;
                }
            }
            // Skip butonu (sadece açılmadan önce)
            if (!cp._revealed && cp._skipRect
                && x >= cp._skipRect.x && x <= cp._skipRect.x + cp._skipRect.w
                && y >= cp._skipRect.y && y <= cp._skipRect.y + cp._skipRect.h) {
                fsm.transition('ROUND_INTRO');
            }
            return;
        }

        // ── Son Şans kurtarma ──────────────────────────────────────────
        if (fsm.currentName === 'LAST_CHANCE') {
            const lc = fsm.current;
            if (lc._canAfford) {
                game.gold -= lc._cost;
                // Zemine ulaşmış creature'ları sil
                levelManager.creatures = levelManager.creatures.filter(
                    c => !(c.alive && c.targetY + c.h >= NJOX.FLOOR_Y - 5)
                );
                lastChanceUsed = true;
                NJOX.Renderer.triggerShake(3, 0.2);
                fsm.transition('AIMING');
            }
            return;
        }

        // ── Speed button (gameplay states) ─────────────────────────────
        const sb = SPEED_BTN;
        if (x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
            if (fsm.currentName !== 'MAP' && fsm.currentName !== 'TITLE') {
                const speeds = [1, 2, 4];
                const idx = speeds.indexOf(game.speedMultiplier);
                game.speedMultiplier = speeds[(idx + 1) % speeds.length];
                return;
            }
        }

        // ── Shop (AIMING only) ─────────────────────────────────────────
        if (fsm.currentName === 'AIMING') {
            const shopOpen = game.shopSystem && game.shopSystem._modalOpen;
            if (y >= NJOX.SHOP_Y || shopOpen) {
                NJOX.ShopUI.handleClick(x, y, game);
                return;
            }
        }

        modal.handleClick(x, y);
    }

    // click (masaüstü) + touchend (mobil) aynı UI handler'a bağlı
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (NJOX.CANVAS_W / rect.width);
        const y = (e.clientY - rect.top)  * (NJOX.CANVAS_H / rect.height);
        _handleUIClick(x, y);
    });

    canvas.addEventListener('touchend', (e) => {
        const rect  = canvas.getBoundingClientRect();
        const touch = e.changedTouches[0];
        const x = (touch.clientX - rect.left) * (NJOX.CANVAS_W / rect.width);
        const y = (touch.clientY - rect.top)  * (NJOX.CANVAS_H / rect.height);
        _handleUIClick(x, y);
    });

    // ═════════════════════════════════════════════════════════════════════
    // CREATURE KILL EVENTS
    // ═════════════════════════════════════════════════════════════════════

    function onCreatureKilled(creature) {
        game.totalKills++;
        shotKills++;
        NJOX._shotKills = shotKills;         // physics.js pitch için global erişim
        NJOX.Sound.creatureDeath(shotKills);

        if (creature.type === NJOX.CREATURE_TYPES.BALL_CARRIER) {
            ballManager.addBalls(1);
            NJOX.Sound.ballPickup();
            game.collectibles.push({
                x: creature.x + creature.w / 2,
                y: creature.y + creature.h / 2,
                type: 'ball', amount: '+1 🎱', timer: 1.5,
            });
        }

        // Combo arttıkça kill başı parçacık azalt — performans
        const deathParticles = Math.max(8, 22 - shotKills * 1.2);
        particles.emit(creature.x + creature.w/2, creature.y + creature.h/2,
            Math.round(deathParticles), creature.getColor(), {
            speedMin: 80, speedMax: 350, sizeMin: 3, sizeMax: 8,
            lifeMin: 0.4, lifeMax: 0.9, gravity: 60,
        });
        // Shake guard — zaten aktif shake varken yeni başlatma
        if (NJOX.Renderer.shakeTimer < 0.05) {
            NJOX.Renderer.triggerShake(4, 0.15);
        }

        // Impact hold — yüksek HP'li ölüm, birkaç frame dondurma
        if (creature.maxHp >= 6) {
            impactHoldTimer = Math.min(0.12, 0.05 + creature.maxHp * 0.005);
        }

        // ── Stres metre max güncelle ──────────────────────────────────────
        const liveHP = levelManager.creatures.reduce((s, c) => c.alive ? s + c.maxHp : s, 0);
        if (liveHP > (game._stressMeterMax || 0)) game._stressMeterMax = liveHP;

        // ── Level clear exhale ────────────────────────────────────────────
        if (!bossMode && levelManager.creatures.filter(c => c.alive).length === 0) {
            exhaleTimer = 2.2;
        }

        // Combo metni + patlama efekti — shotKills'e göre
        let comboWord = null;
        if      (shotKills === 3)  comboWord = 'TRIPLE!';
        else if (shotKills === 5)  comboWord = 'COMBO ×5!';
        else if (shotKills === 8)  comboWord = '🔥 FRENZY!';
        else if (shotKills === 12) comboWord = '☠ MASSACRE!';
        else if (shotKills >= 15 && shotKills % 5 === 0) comboWord = '🌀 MELTDOWN!';
        if (comboWord) {
            comboDisplay = { text: comboWord, timer: 1.8, scale: 0, maxScale: 1.1 };

            // ── Combo BLAST efekti ────────────────────────────────────────
            const lvl   = shotKills >= 15 ? 5 : shotKills >= 12 ? 4 :
                          shotKills >= 8  ? 3 : shotKills >= 5  ? 2 : 1;
            const bClr  = ['#ffd700','#ffaa00','#ff6600','#ff2200','#cc00ff'][lvl - 1];
            const CX    = NJOX.CANVAS_W / 2;
            const CY    = NJOX.CANVAS_H / 2;

            // Merkezi parçacık patlaması — miktar azaltıldı (FPS)
            particles.emit(CX, CY, 12 + lvl * 8, bClr, {
                speedMin: 120, speedMax: 380 + lvl * 60,
                sizeMin: 3, sizeMax: 7 + lvl * 1.5,
                lifeMin: 0.5, lifeMax: 1.1 + lvl * 0.1,
                gravity: 50,
            });
            // İkincil beyaz parlama
            particles.emit(CX, CY, 8 + lvl * 4, '#ffffff', {
                speedMin: 60, speedMax: 180,
                sizeMin: 2, sizeMax: 4,
                lifeMin: 0.2, lifeMax: 0.55,
                gravity: 90,
            });

            // Şok dalgası halkaları + flash
            comboBlast = {
                rings: [
                    { r: 2, maxR: 70  + lvl * 35, speed: 320 + lvl * 55, alpha: 1,   color: bClr,    lw: 4 },
                    { r: 2, maxR: 50  + lvl * 22, speed: 210 + lvl * 35, alpha: 0.7, color: '#fff',   lw: 2 },
                    { r: 2, maxR: 100 + lvl * 45, speed: 440 + lvl * 70, alpha: 0.4, color: bClr,    lw: 2 },
                ],
                flashAlpha: 0.12 + lvl * 0.05,
                flashColor: bClr,
                timer: 0.55,
                maxTimer: 0.55,
            };

            NJOX.Renderer.triggerShake(2 + lvl, 0.12 + lvl * 0.04);

            // ── 5×+ SHATTER: yaratık parçaları + stres ismi patlaması ────
            if (shotKills >= 5) {
                const crCX  = creature.x + creature.w / 2;
                const crCY  = creature.y + creature.h / 2;
                const crClr = creature.getColor();
                // Shard sayısını sınırlı tut — performans için max 6
                const shardN = Math.min(6, 2 + lvl);
                for (let i = 0; i < shardN; i++) {
                    const ang  = Math.random() * Math.PI * 2;
                    const spd  = 70 + Math.random() * 180;
                    const life = 1.0 + Math.random() * 0.8; // daha uzun görünür
                    comboShards.push({
                        x: crCX + (Math.random() - 0.5) * creature.w,
                        y: crCY + (Math.random() - 0.5) * creature.h,
                        vx: Math.cos(ang) * spd,
                        vy: Math.sin(ang) * spd - 50,
                        rot: Math.random() * Math.PI * 2,
                        rotSpd: (Math.random() - 0.5) * 8,
                        // w/h doğrudan büyür — scale yok, setTransform yok
                        w: 6 + Math.random() * 10,
                        h: 5 + Math.random() * 8,
                        growW: 18 + Math.random() * 22, // px/s büyüme
                        growH: 14 + Math.random() * 16,
                        life, maxLife: life,
                        color: crClr,
                    });
                }
                // Yığılmayı önle: max 36 shard — çok sayıda top/ölümde FPS çökmesi
                if (comboShards.length > 36) comboShards.length = 36;

                // ── Stres ismi BÜYÜK patlaması ───────────────────────────
                const sName = NJOX._stressName;
                // Türkçe büyük harf dönüşümü (i→İ, ı→I)
                const trUpper = s => {
                    try { return s.toLocaleUpperCase('tr-TR'); } catch(e) {}
                    return s.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
                };
                if (sName) {
                    const upper = trUpper(sName);
                    const chars = [...upper];
                    const cx2   = NJOX.CANVAS_W / 2;
                    const cy2   = NJOX.GRID_TOP + 120; // üst bölge, render CY ile eşleşir
                    // Her harfe genişlik
                    const charW = Math.min(54, Math.max(36, 260 / Math.max(1, chars.length)));
                    const letters = chars.map((ch, i) => {
                        const sx   = cx2 + (i - (chars.length - 1) / 2) * charW;
                        const base = chars.length === 1
                            ? Math.random() * Math.PI * 2
                            : Math.atan2(0, sx - cx2) + (Math.random() - 0.5) * 1.4;
                        const spd2 = 220 + Math.random() * 300;
                        const lf   = 1.6 + Math.random() * 0.7;
                        return {
                            ch, x: sx, y: cy2,
                            vx: Math.cos(base) * spd2,
                            vy: Math.sin(base) * spd2 - 100,
                            rot: (Math.random() - 0.5) * 0.6, // hafif başlangıç açısı
                            rotSpd: (Math.random() - 0.5) * 14, // hızlı dönüş
                            sz: 82, growSz: 60 + Math.random() * 40,
                            life: lf, maxLife: lf,
                            color: bClr,
                        };
                    });

                    // Kırık parçalar — her harften 1 küçük kopya, max 6
                    const splinters = [];
                    const splinterChars = chars.slice(0, 6); // max 6 splinter
                    splinterChars.forEach((ch, i) => {
                        const sx = cx2 + (i - (splinterChars.length - 1) / 2) * charW;
                        for (let s = 0; s < 1; s++) {
                            const ang  = Math.random() * Math.PI * 2;
                            const spds = 240 + Math.random() * 360;
                            const lfs  = 0.7 + Math.random() * 0.5;
                            splinters.push({
                                ch, x: sx + (Math.random()-0.5)*20, y: cy2 + (Math.random()-0.5)*20,
                                vx: Math.cos(ang) * spds,
                                vy: Math.sin(ang) * spds - 60,
                                rot: Math.random() * Math.PI * 2,
                                rotSpd: (Math.random() - 0.5) * 22,
                                sz: 22 + Math.random() * 26,
                                growSz: 8 + Math.random() * 14,
                                life: lfs, maxLife: lfs,
                                color: bClr,
                            });
                        }
                    });

                    stressNameBurst = {
                        letters, splinters,
                        gatherTimer: 0.38,
                        flashTimer:  0.0,
                        fullText:    upper,
                        fullSz:      0,
                        flashAlpha:  0,
                        darkAlpha:   0,
                        exploded:    false,
                        lvl,
                    };
                    NJOX.Sound.stressDestroy(lvl);
                    NJOX.Renderer.triggerShake(5 + lvl, 0.25);
                }
            }
        }

        // Lifetime ball count record güncelle
        progress.updateHighestBalls(ballManager.totalCount);

        // ── Kart efektleri ────────────────────────────────────────────────
        // Stress Absorb: stresli yaratık öldü → +1 top
        if (game._cardStressAbsorb && creature.isStressed) {
            ballManager.addBalls(1);
            game.collectibles.push({ x: creature.x + creature.w/2,
                y: creature.y, type:'ball', amount:'+1🎱', timer:1.5 });
        }

        // Chain Death: öldürülen yaratığın 65px çevresindekiler 2 hasar alır
        if (game._cardChainDeath) {
            const ccx = creature.x + creature.w / 2;
            const ccy = creature.y + creature.h / 2;
            for (const c of levelManager.creatures) {
                if (!c.alive || c === creature) continue;
                const dx = (c.x + c.w / 2) - ccx;
                const dy = (c.y + c.h / 2) - ccy;
                if (dx * dx + dy * dy < 65 * 65) {
                    c.hp -= 2;
                    c.hitFlashTimer = 0.1;
                    if (c.hp <= 0) {
                        c.hp = 0;
                        c.alive = false;
                        c.animState = 'death';
                        c.deathTimer = 0.3;
                    }
                }
            }
        }

        // Blood Taste skill: belirli sayıda kill → +1 atış
        if (progress.skills.bloodTaste > 0) {
            const threshold = progress.skills.bloodTaste >= 2 ? 3 : 5;
            if (shotKills % threshold === 0) {
                game.shotsRemaining++;
                game.collectibles.push({ x: creature.x + creature.w/2 + 10,
                    y: creature.y - 10, type:'ball', amount:'+1 atış', timer:1.4 });
            }
        }

        // Gold drop from creature — düşürüldü (ekonomi dengesi)
        if (Math.random() < 0.015) {
            const amt = NJOX.Utils.randInt(1, 2);
            game.gold += amt;
            game.collectibles.push({
                x: creature.x + creature.w / 2,
                y: creature.y + creature.h / 2,
                type: 'gold', amount: amt, timer: 1.5,
            });
        }

        rewardSystem.onCreatureKilled(creature.type);
        const reward = rewardSystem.consumeReward();
        if (reward) {
            if (reward.type === 'skipAdvance') skipAdvance = true;
            rewardSystem.applyReward(reward, ballManager);
        }
    }

    function onCreatureHit(creature, col, ball, dmg = 1) {
        const sparkColor = ball.type === 'fire' ? NJOX.COLORS.FIRE
                         : ball.type === 'ice'  ? NJOX.COLORS.ICE
                         : creature.getColor();
        particles.emitHitSparks(ball.x, ball.y, col.nx, col.ny, sparkColor);
        NJOX.Renderer.triggerShake(1.5, 0.06);

        // Ice Storm card: freeze süresi 2 round'a çıkar
        if (ball.type === 'ice' && creature.frozen && game._cardIceStorm) {
            creature.frozenTurns = 2;
        }

        // Floating damage number — shows actual damage dealt
        if (dmg > 0) {
            const jitter = (Math.random() - 0.5) * 18;
            game.collectibles.push({
                x:      creature.x + creature.w / 2 + jitter,
                y:      creature.y + creature.h * 0.4,
                type:   'dmg',
                amount: '-' + dmg,
                timer:  1.1,
            });
        }
    }

    function checkKills() {
        const creatures = bossMode
            ? (boss ? [boss, ...boss.minions] : [])
            : levelManager.creatures;

        for (const c of creatures) {
            if (c._killHandled) continue;
            if (!c.alive) {
                c._killHandled = true;
                const spawns = c._pendingSpawns || [];
                if (spawns.length > 0 && !bossMode) levelManager.addCreatures(spawns);
                if (!bossMode) onCreatureKilled(c);
            }
        }
        if (boss) boss.minions = boss.minions.filter(m => m.alive);
    }

    // ═════════════════════════════════════════════════════════════════════
    // SHARED UPDATE HELPERS
    // ═════════════════════════════════════════════════════════════════════

    // Slow-mo faktörü: kill cam > son 1-2 yaratık > normal
    function _slowMoFactor() {
        if (bossMode) return 1;
        const alive = levelManager.creatures.filter(c => c.alive).length;
        if (alive === 1) return 0.30;
        if (alive === 2) return 0.55;
        return 1;
    }

    function updateGameSystems(dt) {
        // rawDt: hız çarpanından bağımsız gerçek süre — UI efektleri hep aynı hızda oynar
        const rawDt = dt / (game.speedMultiplier || 1);

        // Impact hold: yüksek HP ölümünde birkaç frame dondur
        if (impactHoldTimer > 0) {
            impactHoldTimer -= rawDt;
            particles.update(rawDt * 0.08);
            NJOX.Renderer.updateShake(rawDt);
            if (comboDisplay) {
                comboDisplay.timer -= rawDt;
                if (comboDisplay.timer <= 0) comboDisplay = null;
            }
            return;
        }

        const slo = _slowMoFactor();
        const eff = dt * slo;

        // ── UI efektleri: rawDt kullan — hız çarpanından etkilenmez ─────────

        // Combo display güncelle
        if (comboDisplay) {
            comboDisplay.timer -= rawDt;
            comboDisplay.scale = Math.min(comboDisplay.maxScale, comboDisplay.scale + rawDt * 10);
            if (comboDisplay.timer <= 0) comboDisplay = null;
        }

        // Combo blast güncelle — halkalar genişler, flash solar
        if (comboBlast) {
            comboBlast.timer -= rawDt;
            if (comboBlast.timer <= 0) {
                comboBlast = null;
            } else {
                for (const ring of comboBlast.rings) {
                    ring.r = Math.min(ring.maxR, ring.r + ring.speed * rawDt);
                }
            }
        }

        if (exhaleTimer > 0) exhaleTimer = Math.max(0, exhaleTimer - rawDt);

        // Yaratık parçaları — hız bağımsız
        for (let i = comboShards.length - 1; i >= 0; i--) {
            const sh = comboShards[i];
            sh.life -= rawDt;
            if (sh.life <= 0) { comboShards.splice(i, 1); continue; }
            sh.x   += sh.vx * rawDt;
            sh.y   += sh.vy * rawDt;
            sh.vy  += 180 * rawDt;
            sh.rot += sh.rotSpd * rawDt;
            sh.w    = Math.min(55, sh.w + sh.growW * rawDt);
            sh.h    = Math.min(44, sh.h + sh.growH * rawDt);
        }

        // Stres ismi patlama güncelle — 3 faz, hız bağımsız
        if (stressNameBurst) {
            if (!stressNameBurst.exploded) {
                // Faz 1 — Gather: yazı 0→100px hızlıca büyür, ekran kararır
                stressNameBurst.fullSz    = Math.min(100, stressNameBurst.fullSz + rawDt * 480);
                stressNameBurst.darkAlpha = Math.min(0.52, stressNameBurst.darkAlpha + rawDt * 2.0);
                stressNameBurst.gatherTimer -= rawDt;
                if (stressNameBurst.gatherTimer <= 0) {
                    stressNameBurst.exploded   = true;
                    stressNameBurst.flashAlpha = 1.0;
                    NJOX.Renderer.triggerShake(7 + stressNameBurst.lvl, 0.3);
                    particles.emit(NJOX.CANVAS_W / 2, NJOX.GRID_TOP + 120,
                        40, stressNameBurst.letters[0]?.color || '#ffd700', {
                        speedMin: 180, speedMax: 500,
                        sizeMin: 4, sizeMax: 11,
                        lifeMin: 0.6, lifeMax: 1.2, gravity: 60,
                    });
                }
            } else {
                // Faz 2 — Explode: flash söner, harfler + splinterlar uçar
                stressNameBurst.flashAlpha = Math.max(0, stressNameBurst.flashAlpha - rawDt * 5);
                stressNameBurst.darkAlpha  = Math.max(0, stressNameBurst.darkAlpha  - rawDt * 2);
                let anyAlive = false;
                for (const lt of stressNameBurst.letters) {
                    if (lt.life <= 0) continue;
                    anyAlive = true;
                    lt.life -= rawDt;
                    lt.x    += lt.vx * rawDt;
                    lt.y    += lt.vy * rawDt;
                    lt.vy   += 220 * rawDt;
                    lt.rot  += lt.rotSpd * rawDt;
                    lt.sz   += lt.growSz * rawDt;
                }
                if (stressNameBurst.splinters) {
                    for (const sp of stressNameBurst.splinters) {
                        if (sp.life <= 0) continue;
                        anyAlive = true;
                        sp.life -= rawDt;
                        sp.x    += sp.vx * rawDt;
                        sp.y    += sp.vy * rawDt;
                        sp.vy   += 280 * rawDt;
                        sp.rot  += sp.rotSpd * rawDt;
                        sp.sz   += sp.growSz * rawDt;
                    }
                }
                if (!anyAlive && stressNameBurst.flashAlpha <= 0) stressNameBurst = null;
            }
        }

        // Stres metre max — yeni satır spawn'larında artabilir
        if (!bossMode) {
            const liveMaxHP = levelManager.creatures.reduce((s, c) => c.alive ? s + c.maxHp : s, 0);
            if (liveMaxHP > (game._stressMeterMax || 0)) game._stressMeterMax = liveMaxHP;
        }

        for (const c of levelManager.creatures) c.update(eff);
        if (boss) {
            boss.update(eff);
            for (const m of boss.minions) m.update(eff);
        }
        particles.update(eff);
        rewardSystem.update(eff);
        updateCollectibles(eff);
        NJOX.Renderer.updateShake(eff);

        // ── Vampir saldırı topları ────────────────────────────────────────
        // Mor toplar player'ın aktif toplarına yönlenir.
        // Çarpışırsa: aktif top kaybolur (totalCount değişmez).
        // Zemine çarparsа: sadece kaybolur, top sayısı düşmez.
        if (game._vampireProj && game._vampireProj.length > 0) {
            const activeBalls = ballManager.balls.filter(b => b.active);
            for (const p of game._vampireProj) {
                if (!p.active) continue;
                if (p.delay > 0) { p.delay -= dt; continue; }

                // Homing: en yakın aktif topa yönel
                if (p.homing && activeBalls.length > 0) {
                    // En yakın topu bul
                    let best = null, bestDist = Infinity;
                    for (const b of activeBalls) {
                        const dx = b.x - p.x, dy = b.y - p.y;
                        const d  = Math.sqrt(dx * dx + dy * dy);
                        if (d < bestDist) { bestDist = d; best = b; }
                    }
                    if (best) {
                        const dx = best.x - p.x;
                        const dy = best.y - p.y;
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 260;
                        // Yumuşak yönelim: mevcut hız ile hedefe doğru blend
                        p.vx = p.vx * 0.65 + (dx / len) * speed * 0.35;
                        p.vy = p.vy * 0.65 + (dy / len) * speed * 0.35;
                        // Minimum aşağı hız garanti et (ileri geri giderse saçma olur)
                        if (p.vy < 60) p.vy = 60;
                    }
                }

                p.x += p.vx * eff;
                p.y += p.vy * eff;

                // Player topu çarpışması — kalıcı top kaybı (gerçek tehdit)
                for (const b of activeBalls) {
                    const dx = b.x - p.x, dy = b.y - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < NJOX.BALL_RADIUS + 5.5) {
                        b.active = false;
                        p.active = false;
                        // Kalıcı drain: top sayısı kalıcı düşer
                        const drainAmt = Math.max(1, Math.floor(ballManager.totalCount * 0.015));
                        ballManager.totalCount = Math.max(1, ballManager.totalCount - drainAmt);
                        particles.emitDeathBurst(p.x, p.y, 8, 6, '#cc44ff');
                        particles.emitDeathBurst(b.x, b.y, 6, 5, '#ffffff');
                        game.collectibles.push({
                            x: p.x, y: p.y,
                            type: 'dmg', amount: `🧛 -${drainAmt} top!`, timer: 1.5,
                        });
                        NJOX.Sound.vampireDrain();
                        break;
                    }
                }

                // Zemine ulaştı — sadece kaybol, top sayısı düşmez
                if (p.active && p.y >= NJOX.FLOOR_Y) {
                    p.active = false;
                    particles.emitDeathBurst(p.x, NJOX.FLOOR_Y, 5, 5, '#cc44ff');
                }
            }
            game._vampireProj = game._vampireProj.filter(p => p.active);
        }
    }

    function runPhysicsFrame(dt) {
        if (impactHoldTimer > 0) return; // freeze: toplar da durur
        const eff     = dt * _slowMoFactor();
        const ballEff = game._cardSpeedCurse ? eff * 0.55 : eff;
        ballManager.update(ballEff);
        const creatures = bossMode
            ? (boss ? [boss, ...boss.minions] : [])
            : levelManager.creatures;
        NJOX.Physics.update(ballEff, ballManager, creatures, onCreatureHit);

        if (!bossMode) levelManager.checkPickupCollisions(ballManager.balls, ballManager, game);

        // ── Yıkıcı Kule çarpışma ───────────────────────────────────────
        if (!bossMode && game._wreckerTower && game._wreckerTower.alive) {
            const tw = game._wreckerTower;
            for (const ball of ballManager.balls) {
                if (!ball.active) continue;
                const col = NJOX.Utils.circleVsRect(
                    ball.x, ball.y, ball.radius || 6,
                    tw.x, tw.y, tw.w, tw.h
                );
                if (col) {
                    // Bounce
                    const dot = ball.vx * col.nx + ball.vy * col.ny;
                    ball.vx -= 2 * dot * col.nx;
                    ball.vy -= 2 * dot * col.ny;
                    // Push out
                    ball.x += col.nx * col.overlap;
                    ball.y += col.ny * col.overlap;
                    // Hasar
                    tw.hp--;
                    particles.emitHitSparks(ball.x, ball.y, col.nx, col.ny, '#ff4444');
                    if (tw.hp <= 0) {
                        tw.alive = false;
                        particles.emitDeathBurst(tw.x, tw.y, tw.w, tw.h, '#ff6644');
                        game.collectibles.push({ x: tw.x + tw.w/2, y: tw.y - 10,
                            type:'ball', amount:'🗼 YIKILDI!', timer:2.5 });
                        NJOX.Renderer.triggerShake(5, 0.2);
                    }
                }
            }
        }

        if (boss && boss.alive) boss.checkMechanics(ballManager.balls, game);

        if (boss) {
            let nearestX = NJOX.CANVAS_W / 2, nearestDist = Infinity;
            for (const b of ballManager.balls) {
                if (!b.active) continue;
                const d = NJOX.Utils.distance(b.x, b.y, boss.x + boss.w / 2, boss.y + boss.h / 2);
                if (d < nearestDist) { nearestDist = d; nearestX = b.x; }
            }
            boss.trackX = nearestX;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // COLLECTIBLES
    // ═════════════════════════════════════════════════════════════════════

    function updateCollectibles(dt) {
        if (!game.collectibles) return;
        for (let i = game.collectibles.length - 1; i >= 0; i--) {
            const col = game.collectibles[i];
            col.timer -= dt;
            col.y -= 30 * dt;
            if (col.timer <= 0) game.collectibles.splice(i, 1);
        }
    }

    function renderCollectibles(ctx) {
        if (!game.collectibles) return;
        for (const col of game.collectibles) {
            const alpha = Math.min(1, col.timer);
            ctx.save();
            ctx.globalAlpha = alpha;

            const isDmg = col.type === 'dmg';
            ctx.fillStyle = col.type === 'gold'   ? '#ffd700'
                           : col.type === 'stress' ? '#ff6644'
                           : isDmg                 ? '#ff4466'
                           : '#fff';

            ctx.font = isDmg ? 'bold 11px monospace' : 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                col.type === 'gold' ? '+' + col.amount + 'g' : col.amount,
                col.x, col.y
            );
            ctx.restore();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // SHARED GAME SCENE RENDER
    // ═════════════════════════════════════════════════════════════════════

    function renderGameScene(c) {
        NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);

        // ── Level-clear EXHALE efekti — arka plan "nefes alır" ───────────
        if (exhaleTimer > 0 && !bossMode) {
            const t    = exhaleTimer / 2.2;          // 1→0
            const peak = Math.sin(Math.PI * (1 - t)); // 0→1→0 arc
            c.save();
            c.globalAlpha = peak * 0.38;
            const grad = c.createLinearGradient(0, 0, 0, NJOX.CANVAS_H);
            grad.addColorStop(0,   '#ffd700');
            grad.addColorStop(0.5, '#44ffcc');
            grad.addColorStop(1,   '#1a6688');
            c.fillStyle = grad;
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.restore();
            // Ortada büyük parlama
            c.save();
            c.globalAlpha = peak * 0.22;
            const rg = c.createRadialGradient(
                NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2, 0,
                NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2, NJOX.CANVAS_W * 0.6
            );
            rg.addColorStop(0, '#ffffff');
            rg.addColorStop(1, 'transparent');
            c.fillStyle = rg;
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.restore();
        }

        c.save();
        c.translate(NJOX.Renderer.shakeOffset.x, NJOX.Renderer.shakeOffset.y);
        if (!bossMode) levelManager.renderPickups(c);
        for (const cr of levelManager.creatures) cr.render(c);

        // ── Yıkıcı Kule render ─────────────────────────────────────────
        if (!bossMode && game._wreckerTower && game._wreckerTower.alive) {
            const tw = game._wreckerTower;
            // Gölge efekti
            c.shadowColor = '#ff2200';
            c.shadowBlur  = 14;
            // Kule gövdesi
            c.fillStyle = '#5a0000';
            NJOX.Utils.roundRect(c, tw.x, tw.y, tw.w, tw.h, 6);
            c.fill();
            c.strokeStyle = '#ff4444';
            c.lineWidth   = 2;
            NJOX.Utils.roundRect(c, tw.x, tw.y, tw.w, tw.h, 6);
            c.stroke();
            c.shadowBlur = 0;
            // İkon
            c.font         = '22px serif';
            c.textAlign    = 'center';
            c.textBaseline = 'middle';
            c.fillText('🗼', tw.x + tw.w / 2, tw.y + tw.h / 2 + 1);
            // HP bar (üstte)
            const hpPct = tw.hp / tw.maxHp;
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.fillRect(tw.x, tw.y - 7, tw.w, 4);
            c.fillStyle = hpPct > 0.5 ? '#ff4444' : '#ff8800';
            c.fillRect(tw.x, tw.y - 7, tw.w * hpPct, 4);
            // HP sayısı
            c.fillStyle    = '#ff9999';
            c.font         = 'bold 7px monospace';
            c.textAlign    = 'center';
            c.textBaseline = 'middle';
            c.fillText(tw.hp + '/' + tw.maxHp, tw.x + tw.w / 2, tw.y - 12);
        }
        if (boss) boss.render(c);
        ballManager.render(c);

        // ── Vampir saldırı topları ────────────────────────────────────────
        if (game._vampireProj) {
            for (const p of game._vampireProj) {
                if (!p.active || p.delay > 0) continue;
                c.save();
                c.shadowColor = '#9900ff';
                c.shadowBlur  = 12;
                c.fillStyle   = '#cc44ff';
                c.beginPath();
                c.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = '#ff88ff';
                c.lineWidth   = 1.5;
                c.stroke();
                c.shadowBlur  = 0;
                c.restore();
            }
        }

        particles.render(c);
        renderCollectibles(c);
        c.restore();

        game.bossMode = bossMode;
        NJOX.HUD.render(c, game);
        if (bossMode && boss) NJOX.BossHPBar.render(c, boss);

        // ── Stres Metre — stres bandı (Y=22-36): yüz + çubuk, etiket yok ──
        if (!bossMode && (game._stressMeterMax || 0) > 0) {
            const curHP = levelManager.creatures.reduce((s, cr) => cr.alive ? s + cr.hp : s, 0);
            const pct   = Math.max(0, Math.min(1, curHP / game._stressMeterMax));
            const FACE_R = 5;
            const FACE_X = 7;
            const FACE_Y = 29;       // center of stress band (22+36)/2 = 29
            const BAR_X  = 16;       // right of face: 7+5+4=16
            const BAR_Y  = 25;       // vertically centered in band
            const BAR_W  = NJOX.CANVAS_W - BAR_X - 4;
            const BAR_H  = 8;

            c.save();

            // Çubuk arka plan
            c.fillStyle = 'rgba(0,0,0,0.45)';
            NJOX.Utils.roundRect(c, BAR_X, BAR_Y, BAR_W, BAR_H, 4);
            c.fill();

            // Renk: kırmızı→turuncu→mavi-yeşil
            const barColor = pct > 0.6 ? `rgba(233,${Math.round(30 + pct * 40)},40,0.9)`
                           : pct > 0.3 ? `rgba(255,${Math.round(140 + (0.6-pct)*200)},0,0.9)`
                           :             `rgba(60,180,220,0.9)`;
            c.fillStyle = barColor;
            NJOX.Utils.roundRect(c, BAR_X, BAR_Y, BAR_W * pct, BAR_H, 4);
            c.fill();

            // Nabız — yüksek stres titreşir
            if (pct > 0.65) {
                const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 260));
                c.globalAlpha = pulse * 0.3;
                c.fillStyle   = '#ff4444';
                NJOX.Utils.roundRect(c, BAR_X, BAR_Y, BAR_W * pct, BAR_H, 4);
                c.fill();
                c.globalAlpha = 1;
            }

            // ── Emoji yüz — stres seviyesine göre değişir ──
            const faceColor = pct > 0.6 ? '#e94560' : pct > 0.3 ? '#f59e0b' : '#4ec8dc';
            // Yüz dairesi
            c.fillStyle = faceColor;
            c.beginPath();
            c.arc(FACE_X, FACE_Y, FACE_R, 0, Math.PI * 2);
            c.fill();

            // Gözler + ifade
            c.fillStyle = '#fff';
            c.strokeStyle = '#fff';
            c.lineWidth = 1.2;
            if (pct > 0.6) {
                // Kızgın: çatık kaşlar + düz ağız
                c.beginPath(); c.arc(FACE_X - 2.5, FACE_Y - 1, 1.2, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(FACE_X + 2.5, FACE_Y - 1, 1.2, 0, Math.PI * 2); c.fill();
                // Çatık kaşlar
                c.beginPath(); c.moveTo(FACE_X - 4, FACE_Y - 3.5); c.lineTo(FACE_X - 1, FACE_Y - 2.5); c.stroke();
                c.beginPath(); c.moveTo(FACE_X + 4, FACE_Y - 3.5); c.lineTo(FACE_X + 1, FACE_Y - 2.5); c.stroke();
                // Düz ağız
                c.beginPath(); c.moveTo(FACE_X - 2.5, FACE_Y + 3); c.lineTo(FACE_X + 2.5, FACE_Y + 3); c.stroke();
            } else if (pct > 0.3) {
                // Endişeli: normal gözler + eğri ağız
                c.beginPath(); c.arc(FACE_X - 2.5, FACE_Y - 1, 1.2, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(FACE_X + 2.5, FACE_Y - 1, 1.2, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(FACE_X, FACE_Y + 4, 2.5, -Math.PI * 0.8, -Math.PI * 0.2); c.stroke();
            } else {
                // Sakin: kapalı gözler + gülümseme
                c.beginPath(); c.arc(FACE_X - 2.5, FACE_Y - 1, 2, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
                c.beginPath(); c.arc(FACE_X + 2.5, FACE_Y - 1, 2, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
                c.beginPath(); c.arc(FACE_X, FACE_Y + 2, 2.5, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
            }

            // Etiket yok — emoji yüz yeterince anlatıcı

            c.restore();
        }
        rewardSystem.render(c);
        NJOX.ShopUI.render(c, game);

        // ── Son 3 atış geri sayımı ──────────────────────────────────────
        // Son raundun son 3 atışında belirgin uyarı göster
        if (!bossMode
            && game.roundIndex === NJOX.ROUNDS_PER_LEVEL
            && game.shotsRemaining > 0
            && game.shotsRemaining <= 3) {

            const shots = game.shotsRemaining;
            const pulse = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 220));

            // Kırmızı şerit — zemin çizgisinin hemen üstü
            c.save();
            c.globalAlpha = pulse;
            c.fillStyle   = 'rgba(233,69,96,0.18)';
            c.fillRect(0, NJOX.FLOOR_Y - 38, NJOX.CANVAS_W, 38);

            // İnce accent çizgi
            c.fillStyle = '#e94560';
            c.globalAlpha = pulse * 0.7;
            c.fillRect(0, NJOX.FLOOR_Y - 38, NJOX.CANVAS_W, 1.5);

            // Metin
            c.globalAlpha = pulse;
            c.fillStyle   = '#ff6b81';
            c.font        = 'bold 14px monospace';
            c.textAlign   = 'center';
            c.textBaseline = 'middle';
            const label = shots === 1 ? '⚠  SON ATIŞ  ⚠'
                        : shots === 2 ? '⚠  SON 2 ATIŞ  ⚠'
                        :               '⚠  SON 3 ATIŞ  ⚠';
            c.fillText(label, NJOX.CANVAS_W / 2, NJOX.FLOOR_Y - 19);
            c.restore();
        }

        // Speed button — 1× / 2× / 4× cycle
        {
            const sb = SPEED_BTN;
            const spd = game.speedMultiplier || 1;
            const btnColor = spd === 4 ? '#ffd700'
                           : spd === 2 ? '#e94560'
                           : 'rgba(255,255,255,0.1)';
            const label    = spd === 4 ? '▶▶▶ 4×'
                           : spd === 2 ? '▶▶ 2×'
                           : '▶ 1×';
            c.save();
            c.fillStyle = btnColor;
            NJOX.Utils.roundRect(c, sb.x, sb.y, sb.w, sb.h, 5);
            c.fill();
            c.strokeStyle = spd > 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)';
            c.lineWidth = 1;
            c.stroke();
            c.fillStyle = spd > 1 ? '#fff' : 'rgba(255,255,255,0.5)';
            c.font = 'bold 10px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(label, sb.x + sb.w / 2, sb.y + sb.h / 2);
            c.restore();
        }

        // ── Combo BLAST render ────────────────────────────────────────────
        if (comboBlast) {
            const progress = 1 - comboBlast.timer / comboBlast.maxTimer; // 0→1

            // Tam ekran flash — sadece ilk anda
            if (comboBlast.flashAlpha > 0 && progress < 0.25) {
                const fA = comboBlast.flashAlpha * (1 - progress / 0.25);
                c.save();
                c.globalAlpha = fA;
                c.fillStyle   = comboBlast.flashColor;
                c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
                c.restore();
            }

            // Şok dalgası halkaları
            const CX = NJOX.CANVAS_W / 2, CY = NJOX.CANVAS_H / 2;
            for (const ring of comboBlast.rings) {
                const rProg = ring.r / ring.maxR;
                const rAlpha = ring.alpha * (1 - rProg);
                if (rAlpha <= 0.01 || ring.r < 2) continue;
                c.save();
                c.globalAlpha = rAlpha;
                c.strokeStyle = ring.color;
                c.lineWidth   = ring.lw * (1 - rProg * 0.6);
                c.shadowColor = ring.color;
                c.shadowBlur  = 18;
                c.beginPath();
                c.arc(CX, CY, ring.r, 0, Math.PI * 2);
                c.stroke();
                c.restore();
            }
        }

        // ── Yaratık parçaları — setTransform ile optimize (shadow yok) ──
        if (comboShards.length > 0) {
            c.save();
            c.textAlign = 'center'; // reset guarantee
            let lastColor = null;
            for (const sh of comboShards) {
                if (sh.life <= 0) continue;
                const a = sh.life / sh.maxLife;
                c.globalAlpha = a;
                if (sh.color !== lastColor) { c.fillStyle = sh.color; lastColor = sh.color; }
                const cos = Math.cos(sh.rot), sin = Math.sin(sh.rot);
                // setTransform: rotation + translation, no save/restore
                c.setTransform(cos, sin, -sin, cos, sh.x, sh.y);
                c.fillRect(-sh.w / 2, -sh.h / 2, sh.w, sh.h);
            }
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.globalAlpha = 1;
            c.restore();
        }

        // ── Stres ismi BÜYÜK patlaması ────────────────────────────────────
        if (stressNameBurst) {
            const CX = NJOX.CANVAS_W / 2;
            const CY = NJOX.GRID_TOP + 120; // üst bölge — oyuncu oraya bakıyor
            c.save();
            c.textAlign    = 'center';
            c.textBaseline = 'middle';

            // Arkaplan karartma — gather fazında gelir
            if (stressNameBurst.darkAlpha > 0.01) {
                c.globalAlpha = stressNameBurst.darkAlpha;
                c.fillStyle   = '#000000';
                c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            }

            if (!stressNameBurst.exploded) {
                // Gather: kocaman yazı hızla belirir
                const sz = Math.round(stressNameBurst.fullSz);
                if (sz >= 6) {
                    c.globalAlpha = Math.min(1, sz / 28);
                    // Derin gölge
                    c.font      = `bold ${sz}px monospace`;
                    c.fillStyle = 'rgba(0,0,0,0.7)';
                    c.fillText(stressNameBurst.fullText, CX + 3, CY + 3);
                    // Parlak altın glow
                    c.shadowColor = '#ffd700';
                    c.shadowBlur  = 40;
                    c.fillStyle   = '#ffd700';
                    c.fillText(stressNameBurst.fullText, CX, CY);
                    // Üstte beyaz
                    c.shadowBlur  = 0;
                    c.fillStyle   = '#ffffff';
                    c.globalAlpha *= 0.7;
                    c.fillText(stressNameBurst.fullText, CX, CY);
                }
            } else {
                // Patlama flash
                if (stressNameBurst.flashAlpha > 0.01) {
                    c.globalAlpha = stressNameBurst.flashAlpha;
                    c.fillStyle   = '#ffffff';
                    c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
                }
                // Kırık parça harfler — küçük, soluk, hızlı döner (önce render)
                if (stressNameBurst.splinters) {
                    c.shadowBlur = 6;
                    for (const sp of stressNameBurst.splinters) {
                        if (sp.life <= 0) continue;
                        const la = (sp.life / sp.maxLife) * 0.55;
                        const sz = Math.max(4, Math.round(sp.sz));
                        c.globalAlpha = la;
                        c.shadowColor = sp.color;
                        c.font        = `bold ${sz}px monospace`;
                        c.fillStyle   = sp.color;
                        c.setTransform(
                            Math.cos(sp.rot), Math.sin(sp.rot),
                            -Math.sin(sp.rot), Math.cos(sp.rot),
                            sp.x, sp.y
                        );
                        c.fillText(sp.ch, 0, 0);
                    }
                    c.setTransform(1, 0, 0, 1, 0, 0);
                    c.shadowBlur = 0;
                }
                // Ana harfler uçar — shadowBlur döngü dışında set
                c.shadowBlur = 20;
                for (const lt of stressNameBurst.letters) {
                    if (lt.life <= 0) continue;
                    const la = lt.life / lt.maxLife;
                    const sz = Math.max(6, Math.round(lt.sz));
                    c.globalAlpha = la;
                    c.shadowColor = lt.color;
                    c.font        = `bold ${sz}px monospace`;
                    c.fillStyle   = lt.color;
                    c.setTransform(
                        Math.cos(lt.rot), Math.sin(lt.rot),
                        -Math.sin(lt.rot), Math.cos(lt.rot),
                        lt.x, lt.y
                    );
                    c.fillText(lt.ch, 0, 0);
                    // Beyaz parlak çekirdek
                    c.fillStyle = '#ffffff';
                    c.globalAlpha = la * 0.5;
                    c.fillText(lt.ch, 0, 0);
                }
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.shadowBlur = 0;
            }
            c.globalAlpha = 1;
            c.restore();
        }

        // Combo metni — ortada beliriyor
        if (comboDisplay && comboDisplay.scale > 0) {
            const alpha = Math.min(1, comboDisplay.timer);
            const size  = Math.round(28 * comboDisplay.scale);
            c.save();
            c.globalAlpha = alpha;
            c.shadowColor = '#ff6600';
            c.shadowBlur  = 18;
            // İkinci gölge için arka plan
            c.fillStyle   = 'rgba(0,0,0,0.35)';
            c.font        = `bold ${size}px monospace`;
            c.textAlign   = 'center';
            c.textBaseline = 'middle';
            c.fillText(comboDisplay.text, NJOX.CANVAS_W / 2 + 2, NJOX.CANVAS_H / 2 - 58);
            // Ana metin
            c.shadowBlur  = 22;
            c.fillStyle   = '#ffd700';
            c.fillText(comboDisplay.text, NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 60);
            c.restore();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // BOSS GOLD REWARD HELPER
    // ═════════════════════════════════════════════════════════════════════

    function rollBossGold(chapterNum) {
        const info  = progress.getRewardInfo(chapterNum);
        const loot  = progress.rollLootGold(info.maxLoot);
        return { total: info.base + loot, base: info.base, loot };
    }

    // ═════════════════════════════════════════════════════════════════════
    // FSM STATES
    // ═════════════════════════════════════════════════════════════════════

    // ── STORY_INTRO ──────────────────────────────────────────────────────
    // Oyunun ilk açılışında (stres adı yoksa) gösterilen 3-aşamalı hikaye ekranı.
    // Tıklama ile aşamalar geçer; son aşamadan sonra stres adı girişi gösterilir.
    fsm.add('STORY_INTRO', {
        enter() {
            this._phase      = 0;
            this._phaseTimer = 0;
            this._alpha      = 0;
            this._done       = false;
            input.consumeLaunch();
        },
        update(dt) {
            this._phaseTimer += dt;
            this._alpha = Math.min(1, this._alpha + dt * 2.5);
            if (this._done) return;

            if (input.consumeLaunch()) {
                if (this._phase < 2) {
                    this._phase++;
                    this._phaseTimer = 0;
                    this._alpha = 0;
                } else {
                    // Son aşama geçildi → stres adı giriş modal'ı
                    this._done = true;
                    modal.show({
                        title: 'Stresin adı ne?',
                        body: 'Öldürmek istediğin şeye bir isim ver.',
                        showInput:   true,
                        placeholder: 'stresini yaz...',
                        submitText:  'SAVAŞA GİR',
                        onSubmit(val) {
                            stressName       = val;
                            NJOX._stressName = val;
                            localStorage.setItem('njox_stress_name', val);
                            storyIntroDone   = true;
                            localStorage.setItem('njox_story_seen', '1');
                            fsm.transition('MAP');
                        },
                        onSkip() {
                            // İsim kaydedilmez — badge gösterilmez
                            // Sadece intro'nun görüldüğünü işaretle (tekrar gösterme)
                            storyIntroDone   = true;
                            localStorage.setItem('njox_story_seen', '1');
                            fsm.transition('MAP');
                        },
                    });
                }
            }
        },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);

            const CX = NJOX.CANVAS_W / 2;
            const t  = this._phaseTimer;

            c.save();
            c.globalAlpha = this._alpha;
            c.textAlign    = 'center';
            c.textBaseline = 'middle';

            if (this._phase === 0) {
                // Tek büyük yaratık — "Bu kareler senin stresin"
                const cy = 275 + Math.sin(t * 1.4) * 6;
                const sz = 60;
                c.fillStyle = NJOX.COLORS.BASIC;
                NJOX.Utils.roundRect(c, CX - sz / 2, cy, sz, sz, 10);
                c.fill();
                NJOX.Renderer.drawFace(c, CX, cy + sz / 2, sz, sz,
                    { blinkPhase: Math.sin(t * 0.5) > 0.85 ? 1 : 0, mouthOpen: 0, angry: false, color: '#fff', scale: 1 });

                c.fillStyle = '#ffffff';
                c.font      = 'bold 18px monospace';
                c.fillText('Bu kareler...', CX, 210);
                c.fillStyle = 'rgba(255,255,255,0.55)';
                c.font      = '13px monospace';
                c.fillText('kafanda yaşayan stres.', CX, 235);

            } else if (this._phase === 1) {
                // Üç yaratık yan yana — "Her gün büyüyor"
                const offsets = [-85, 0, 85];
                const sizes   = [38, 50, 42];
                for (let i = 0; i < 3; i++) {
                    const ox = offsets[i];
                    const sz = sizes[i];
                    const cy = 275 + Math.sin(t * 1.2 + i * 1.1) * 6;
                    c.fillStyle = i === 1 ? '#c85a7c' : NJOX.COLORS.BASIC;
                    NJOX.Utils.roundRect(c, CX + ox - sz / 2, cy, sz, sz, 8);
                    c.fill();
                    NJOX.Renderer.drawFace(c, CX + ox, cy + sz / 2, sz, sz,
                        { blinkPhase: 0, mouthOpen: 0, angry: i === 1, color: '#fff', scale: 0.85 });
                }

                c.fillStyle = '#ffffff';
                c.font      = 'bold 18px monospace';
                c.fillText('Her gün büyüyor...', CX, 210);
                c.fillStyle = 'rgba(255,255,255,0.55)';
                c.font      = '13px monospace';
                c.fillText('kafana doluyor, seni yoruyor.', CX, 235);

            } else {
                // Kırmızı tehdit — "Savaşmanın vakti"
                const sz    = 70;
                const cy    = 265;
                const pulse = 0.92 + 0.08 * Math.sin(t * 4);
                c.save();
                c.translate(CX, cy + sz / 2);
                c.scale(pulse, pulse);
                c.translate(-CX, -(cy + sz / 2));
                c.fillStyle = '#e94560';
                NJOX.Utils.roundRect(c, CX - sz / 2, cy, sz, sz, 12);
                c.fill();
                NJOX.Renderer.drawFace(c, CX, cy + sz / 2, sz, sz,
                    { blinkPhase: 0, mouthOpen: 0.7, angry: true, color: '#fff', scale: 1 });
                c.restore();

                c.fillStyle = '#ffffff';
                c.font      = 'bold 19px monospace';
                c.fillText('Savaşmanın vakti geldi.', CX, 205);
                c.fillStyle = '#e94560';
                c.font      = '12px monospace';
                c.fillText('Odağın tek bir şey: stresi öldür.', CX, 228);
            }

            // Faz noktaları (alt)
            for (let i = 0; i < 3; i++) {
                c.globalAlpha = this._alpha * (i === this._phase ? 0.9 : 0.25);
                c.fillStyle = '#ffffff';
                c.beginPath();
                c.arc(CX + (i - 1) * 16, 445, 3.5, 0, Math.PI * 2);
                c.fill();
            }

            // "Dokun" ipucu
            if (!this._done) {
                const pulse = Math.sin(Date.now() / 500) * 0.25 + 0.55;
                c.globalAlpha = this._alpha * pulse;
                c.fillStyle   = 'rgba(255,255,255,0.4)';
                c.font        = '11px monospace';
                c.fillText(this._phase < 2 ? 'dokun →' : 'dokun — başla', CX, 418);
            }

            c.restore();
        },
        exit() {}
    });

    // ── TITLE ────────────────────────────────────────────────────────────
    fsm.add('TITLE', {
        enter() {
            NJOX.TitleScreen.init();
            bossMode   = false;
            boss       = null;
            replayMode = false;
        },
        update(dt) {
            NJOX.TitleScreen.update(dt);
            // Any tap → go to map (or story intro on first play)
            if (input.consumeLaunch()) {
                fsm.transition(storyIntroDone ? 'MAP' : 'STORY_INTRO');
            }
        },
        render(c) { NJOX.TitleScreen.render(c); },
        exit() {}
    });

    // ── NEW_GAME (full reset — accessible from MAP) ───────────────────────
    fsm.add('NEW_GAME', {
        enter() {
            ballManager.totalCount = NJOX.INITIAL_BALLS;
            ballManager.balls      = [];
            ballManager.launchX    = NJOX.CANVAS_W / 2;
            ballManager.resetPowerUps();
            ballManager.modifierQueue = [];
            input.setLaunchOrigin(NJOX.CANVAS_W / 2);
            particles.clear();

            bossMode    = false;
            boss        = null;
            skipAdvance = false;
            replayMode  = false;

            game.gold            = 0;
            game.collectibles    = [];
            game.roundIndex      = 1;
            game.shotsRemaining  = NJOX.SHOTS_PER_ROUND;
            game.totalKills      = 0;
            game.speedMultiplier = 1;

            progress.reset();
            sessionStarted = false; // force re-init of player state in MAP
            fsm.transition('MAP');
        },
        update() {}, render() {}, exit() {}
    });

    // ── MAP ──────────────────────────────────────────────────────────────
    fsm.add('MAP', {
        enter() {
            bossMode   = false;
            boss       = null;
            replayMode = false;

            // First MAP visit this session: initialize player state fresh
            if (!sessionStarted) {
                sessionStarted = true;

                // Top sürekliliği: önceki en yüksek sayının %40'ıyla başla
                // (minimum INITIAL_BALLS, maximum yüksek sayının kendisi - 1)
                // Nerve System skill: carry-over %50'ye çıkar (her seviye +10%)
                const carryPct   = 0.40 + (progress.skills.nerveSystem || 0) * 0.10;
                const carryCount = Math.max(
                    NJOX.INITIAL_BALLS,
                    Math.floor(progress.highestBallCount * carryPct)
                );
                ballManager.totalCount    = carryCount;
                ballManager.balls         = [];
                ballManager.launchX       = NJOX.CANVAS_W / 2;
                ballManager.modifierQueue = [];
                ballManager.resetPowerUps();
                game.gold                 = 0;
                game.collectibles         = [];
                game.totalKills           = 0;
                game.speedMultiplier      = 1;
                shotKills                 = 0;
                comboDisplay              = null;
                comboBlast                = null;
                comboShards               = [];
                stressNameBurst           = null;
                exhaleTimer               = 0;
                game._stressMeterMax      = 0;
                impactHoldTimer           = 0;
                lastChanceUsed            = false;
                input.setLaunchOrigin(NJOX.CANVAS_W / 2);
                particles.clear();
            }

            shopSystem.enable();

            NJOX.WorldMap.init(progress,
                // onPlay callback
                (chapterNum) => {
                    fsm.transition('START_LEVEL', { level: chapterNum });
                },
                // onReplay callback
                (chapterNum) => {
                    const cost = progress.getReplayCost(chapterNum);
                    if (game.gold < cost) return;
                    const ch       = progress.getChapter(chapterNum);
                    const bossName = ch && ch.boss ? ch.boss.name : 'STRESS';
                    modal.show({
                        title: 'REPLAY BOSS?',
                        body: '"' + bossName + '"\n\nCost: ' + cost + 'g\nYou will earn gold and can rename the boss.',
                        buttons: [
                            { text: 'FIGHT', callback: () => {
                                game.gold       -= cost;
                                replayMode       = true;
                                replayChapterNum = chapterNum;
                                const ch2  = progress.getChapter(chapterNum);
                                const name = ch2 && ch2.boss ? ch2.boss.name : 'STRESS';
                                fsm.transition('BOSS_INTRO', {
                                    level: chapterNum,
                                    name
                                });
                            }},
                            { text: 'CANCEL', callback: () => {} }
                        ]
                    });
                },
                // onNewGame callback — full reset
                () => {
                    modal.show({
                        title: 'NEW GAME?',
                        body: 'All chapter progress and gold will be lost.',
                        buttons: [
                            { text: 'RESET', callback: () => { fsm.transition('NEW_GAME'); } },
                            { text: 'CANCEL', callback: () => {} }
                        ]
                    });
                },
                // onSkillTree callback
                () => {
                    fsm.transition('SKILL_TREE');
                },
                // onDailyChallenge callback
                () => {
                    if (!progress.isDailyAvailable()) return;
                    dailyMode = true;
                    // Daily seeded level — normal chapter akışı ama dailyMode=true
                    fsm.transition('START_LEVEL', { level: progress.currentChapter, daily: true });
                }
            );
        },
        update(dt) {
            NJOX.WorldMap.update(dt, game.gold);
            modal.update(dt);
        },
        render(c) {
            NJOX.WorldMap.render(c, progress, game.gold);
            modal.render(c);
        },
        exit() {}
    });

    // ── START_LEVEL ───────────────────────────────────────────────────────
    // Enters at the beginning of each chapter (from MAP or after boss replay fail)
    fsm.add('START_LEVEL', {
        enter(data) {
            const level = data.level;
            shopSystem.enable();
            bossMode       = false;
            boss           = null;
            lastChanceUsed = false; // her bölümde 1 kez hak
            shotKills      = 0;
            NJOX._shotKills = 0;
            comboDisplay   = null;
            game._wreckerTower = null; // kule sıfırla
            _resetRoundCards();  // kart flaglerini sıfırla

            // Iron Fist skill: kalıcı bonus hasar uygula
            ballManager.bonusDamage = progress.skills.ironFist || 0;

            levelManager.generateLevel(level, ballManager.totalCount);
            rewardSystem.initForLevel(levelManager.creatures);
            NJOX.Physics.reset();
            game.roundIndex     = 1;
            game.shotsRemaining = NJOX.SHOTS_PER_ROUND;
            fsm.transition('ROUND_INTRO');
        },
        update() {}, render() {}, exit() {}
    });

    // ── ROUND_INTRO ───────────────────────────────────────────────────────
    fsm.add('ROUND_INTRO', {
        enter() {
            const TYPE_INFO = {
                splitter:       { name:'Bölücü',    tag:'ikiye bölünür', color: NJOX.COLORS.SPLITTER,        expr:'angry'  },
                eater:          { name:'Yönlü',     tag:'tek yönden',    color: NJOX.COLORS.EATER,           expr:'angry'  },
                counter:        { name:'Sayaç',     tag:'X vuruşta',     color: NJOX.COLORS.COUNTER,         expr:'normal' },
                reactive:       { name:'Reaktif',   tag:'güçlenir',      color: NJOX.COLORS.REACTIVE,        expr:'scared' },
                vampire:        { name:'Vampir',    tag:'top emer',      color: NJOX.COLORS.VAMPIRE,         expr:'angry'  },
                ball_carrier:   { name:'Taşıyıcı', tag:'+1 top',        color: NJOX.COLORS.BALL_CARRIER,    expr:'normal' },
                vomiter:        { name:'Kusturan',  tag:'2 yavru',       color: NJOX.COLORS.VOMITER,         expr:'normal' },
                stress_spreader:{ name:'Yayıcı',   tag:'stres bulaşır', color: NJOX.COLORS.STRESS_SPREADER, expr:'angry'  },
                shield:         { name:'Kalkan',    tag:'üstten vur',    color: NJOX.COLORS.SHIELD,          expr:'normal' },
                chained:        { name:'Zincirli', tag:'2 vuruş',       color: NJOX.COLORS.CHAINED,         expr:'normal' },
            };

            // Sadece YENİ eklenen satır — en üst satırdaki yaratıklar
            const topRowMaxY = NJOX.GRID_TOP + NJOX.CELL_SIZE;
            const counts = {};
            for (const cr of levelManager.creatures) {
                if (!cr.alive || cr.type === 'basic') continue;
                if ((cr.targetY || cr.y) > topRowMaxY) continue; // eski satırlar
                counts[cr.type] = (counts[cr.type] || 0) + 1;
            }
            this._typeInfos = Object.entries(counts)
                .map(([t, n]) => ({ ...TYPE_INFO[t], count: n }))
                .filter(x => x && x.name);

            const hasTypes    = this._typeInfos.length > 0;
            this._hasTypes    = hasTypes;
            // Özel tip varsa sadece ATLA butonu kapatır (süresiz)
            // Yoksa 1.8s banner
            this._duration    = hasTypes ? 9999 : 1.8;
            this._timer       = this._duration;
            this._skipVisible = hasTypes; // hemen görünür
            input.consumeLaunch();
        },
        update(dt) {
            updateGameSystems(dt);
            this._timer -= dt;

            // Tıklama ile skip
            if (this._skipVisible && input.consumeLaunch()) {
                fsm.transition('AIMING');
                return;
            }
            if (this._timer <= 0) fsm.transition('AIMING');
        },
        render(c) {
            renderGameScene(c);

            const t01   = 1 - this._timer / this._duration;
            const alpha = t01 < 0.12 ? t01 / 0.12
                        : t01 > 0.88 ? (1 - t01) / 0.12
                        : 1;

            const roundNum    = game.roundIndex;
            const roundTotal  = NJOX.ROUNDS_PER_LEVEL;
            const ch          = levelManager.currentLevel;
            const isLastRound = roundNum === roundTotal;
            const infos       = this._typeInfos || [];
            const CX          = NJOX.CANVAS_W / 2;
            const CY          = NJOX.CANVAS_H / 2;

            c.save();
            c.globalAlpha = alpha;

            if (this._hasTypes) {
                // ── Popup modu ──
                c.fillStyle = 'rgba(0,0,0,0.85)';
                c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

                c.textAlign    = 'center';
                c.textBaseline = 'middle';

                // Dinamik kart boyutu — büyütüldü, okunabilirlik artırıldı
                const n    = infos.length;
                const SZ   = n <= 2 ? 130 : n === 3 ? 108 : n === 4 ? 86 : 70;
                const GAP  = 14;
                const crW  = n * SZ + (n - 1) * GAP;
                const crStartX = CX - crW / 2;
                const crTop    = CY - SZ / 2 - 40;

                for (let i = 0; i < n; i++) {
                    const info   = infos[i];
                    const slotCX = crStartX + i * (SZ + GAP) + SZ / 2;
                    const bx     = slotCX - SZ / 2;

                    // Glow + gövde
                    c.shadowColor = info.color;
                    c.shadowBlur  = 20;
                    c.fillStyle   = info.color;
                    NJOX.Utils.roundRect(c, bx, crTop, SZ, SZ, 10);
                    c.fill();
                    c.shadowBlur = 0;

                    // Yüz
                    NJOX.Renderer.drawFace(c, slotCX, crTop + SZ / 2, SZ, SZ, {
                        blinkPhase: 0, mouthOpen: 0,
                        expression: info.expr, color: '#fff', scale: 0.9,
                    });

                    // Adet (sağ üst köşe, küçük rozet)
                    if (info.count > 1) {
                        c.fillStyle = 'rgba(0,0,0,0.7)';
                        c.beginPath();
                        c.arc(bx + SZ - 10, crTop + 10, 10, 0, Math.PI * 2);
                        c.fill();
                        c.fillStyle = '#ffd700';
                        c.font      = 'bold 10px monospace';
                        c.fillText('×' + info.count, bx + SZ - 10, crTop + 10);
                    }

                    // İsim — büyük, net
                    c.fillStyle = '#ffffff';
                    c.font      = 'bold 19px monospace';
                    c.fillText(info.name.toUpperCase(), slotCX, crTop + SZ + 22);

                    // Tag — renkli pill üstünde beyaz yazı
                    c.font = 'bold 14px monospace';
                    const tagW = c.measureText(info.tag).width + 20;
                    const tagH = 22;
                    const tagX = slotCX - tagW / 2;
                    const tagY = crTop + SZ + 32;
                    c.fillStyle = info.color;
                    NJOX.Utils.roundRect(c, tagX, tagY, tagW, tagH, 11);
                    c.fill();
                    c.fillStyle = '#ffffff';
                    c.fillText(info.tag, slotCX, tagY + tagH / 2);
                }

                // ATLA butonu — panel altında, belirgin
                if (this._skipVisible) {
                    c.globalAlpha = alpha;
                    const btnW = 160, btnH = 42;
                    const btnX = CX - btnW / 2;
                    const btnY = crTop + SZ + 62;
                    c.fillStyle   = 'rgba(255,255,255,0.14)';
                    NJOX.Utils.roundRect(c, btnX, btnY, btnW, btnH, 10);
                    c.fill();
                    c.strokeStyle = 'rgba(255,255,255,0.45)';
                    c.lineWidth   = 2;
                    NJOX.Utils.roundRect(c, btnX, btnY, btnW, btnH, 10);
                    c.stroke();
                    c.fillStyle    = '#ffffff';
                    c.font         = 'bold 16px monospace';
                    c.fillText('ATLA  →', CX, btnY + 21);
                    c.globalAlpha = alpha;
                }

            } else {
                // ── Basit banner modu (özel yaratık yok) ──
                c.fillStyle = 'rgba(0,0,0,0.55)';
                c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

                const stripColor = isLastRound ? 'rgba(233,69,96,0.92)' : 'rgba(20,20,40,0.92)';
                c.fillStyle = stripColor;
                c.fillRect(0, CY - 55, NJOX.CANVAS_W, 110);
                c.fillStyle = isLastRound ? '#ff6b81' : '#4ecca3';
                c.fillRect(0, CY - 56, NJOX.CANVAS_W, 2);
                c.fillRect(0, CY + 54, NJOX.CANVAS_W, 2);

                c.textAlign    = 'center';
                c.textBaseline = 'middle';
                c.fillStyle    = 'rgba(255,255,255,0.45)';
                c.font         = '11px monospace';
                c.fillText('CHAPTER ' + ch, CX, CY - 34);

                c.fillStyle = '#ffffff';
                c.font      = 'bold 34px monospace';
                c.fillText('ROUND  ' + roundNum + ' / ' + roundTotal, CX, CY - 2);

                if (isLastRound) {
                    c.fillStyle = '#ffd700';
                    c.font      = 'bold 13px monospace';
                    c.fillText('⚠  SON RAUND  —  BOSS GELİYOR  ⚠', CX, CY + 26);
                }

                const dotGap = 26;
                const dotsW  = roundTotal * dotGap;
                const dotX0  = CX - dotsW / 2 + dotGap / 2;
                for (let i = 1; i <= roundTotal; i++) {
                    const dx = dotX0 + (i - 1) * dotGap;
                    const dy = isLastRound ? CY + 46 : CY + 36;
                    c.beginPath();
                    c.arc(dx, dy, i === roundNum ? 7 : 5, 0, Math.PI * 2);
                    c.fillStyle = i < roundNum  ? '#4ecca3'
                                : i === roundNum ? (isLastRound ? '#ffd700' : '#e94560')
                                : 'rgba(255,255,255,0.18)';
                    c.fill();
                }
            }

            c.restore();
        },
        exit() {}
    });

    // ── AIMING ────────────────────────────────────────────────────────────
    fsm.add('AIMING', {
        enter() {
            ballManager.resetPowerUps();
            input.consumeLaunch();
            shotKills = 0;

            // Ertelenmiş stress yayılımı — round sonunda CARD_PICK/ROUND_INTRO
            // görünmez geçtiği için burada, oyuncunun gördüğü anda uygula.
            if (game._pendingStressSpread && !bossMode) {
                game._pendingStressSpread = false;
                const stressEvents = levelManager.applyStressSpread();
                for (const ev of stressEvents) {
                    if (!game.collectibles) game.collectibles = [];
                    game.collectibles.push({
                        x: ev.x, y: ev.y,
                        type: 'stress', amount: ev.amount || '+20 Stres', timer: 2.5,
                    });
                }
            }

            // Vampir morları: round başında sıfırla. Spawn = player top fırlattığında.
            game._vampireProj = [];
        },
        update(dt) {
            updateGameSystems(dt);

            if (!bossMode && game.shotsRemaining <= 0) {
                fsm.transition('TURN_END');
                return;
            }
            if (bossMode && game.shotsRemaining <= 0) {
                fsm.transition('BOSS_BETWEEN_TURNS');
                return;
            }

            if (input.consumeLaunch()) {
                if (input.mouseY >= NJOX.SHOP_Y) return;
                game.shotsRemaining--;
                ballManager.startLaunch(input.aimAngle, input.launchX);

                // Vampir: player top fırlatınca mor top atar — top sayısına göre scale
                // N_PROJ: 130 topla ~13 top, her proj totalCount'u kalıcı düşürür → gerçek tehdit
                if (!bossMode) {
                    const N_PROJ = Math.min(14, Math.max(4, Math.floor(ballManager.totalCount * 0.10)));
                    for (const cr of levelManager.creatures) {
                        if (!cr.alive || cr.type !== NJOX.CREATURE_TYPES.VAMPIRE) continue;
                        const vcx = cr.x + cr.w / 2;
                        const vbt = cr.y + cr.h;
                        for (let i = 0; i < N_PROJ; i++) {
                            const spread = (i - (N_PROJ - 1) / 2) * 18;
                            game._vampireProj.push({
                                x: vcx + spread, y: vbt,
                                vx: spread * 3,
                                vy: 180 + Math.random() * 80,
                                delay: i * 0.07,
                                active: true,
                                homing: true,
                            });
                        }
                    }
                }

                fsm.transition('LAUNCHING');
            }
        },
        render(c) {
            renderGameScene(c);
            if (!game._cardBlindRound && input.isAiming && input.mouseY < NJOX.SHOP_Y) {
                NJOX.AimLine.render(c, input.launchX, input.launchY, input.aimAngle);
            }
            // Kör atış uyarısı
            if (game._cardBlindRound) {
                c.save();
                c.fillStyle    = 'rgba(255,100,100,0.18)';
                c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
                c.fillStyle    = 'rgba(255,120,120,0.7)';
                c.font         = 'bold 11px monospace';
                c.textAlign    = 'center';
                c.textBaseline = 'middle';
                c.fillText('🙈 KÖR ATIŞ', NJOX.CANVAS_W / 2, NJOX.FLOOR_Y - 40);
                c.restore();
            }
        },
        exit() {}
    });

    // ── LAUNCHING ─────────────────────────────────────────────────────────
    fsm.add('LAUNCHING', {
        enter() {},
        update(dt) {
            runPhysicsFrame(dt);
            updateGameSystems(dt);
            checkKills();
            if (!ballManager.launching) fsm.transition('ACTIVE_TURN');
        },
        render(c) { renderGameScene(c); },
        exit() {}
    });

    // ── ACTIVE_TURN ───────────────────────────────────────────────────────
    fsm.add('ACTIVE_TURN', {
        enter() {},
        update(dt) {
            runPhysicsFrame(dt);
            updateGameSystems(dt);
            checkKills();

            if (ballManager.allReturned()) {
                if (ballManager.firstLandX !== null) {
                    input.setLaunchOrigin(ballManager.firstLandX);
                    ballManager.launchX = ballManager.firstLandX;
                }
                fsm.transition('TURN_END');
            }
        },
        render(c) { renderGameScene(c); },
        exit() {}
    });

    // ── TURN_END ──────────────────────────────────────────────────────────
    fsm.add('TURN_END', {
        enter() {
            turnEndDelay = 0.35;

            if (bossMode) return; // boss victory detected in update()

            levelManager.removeDeadCreatures();

            if (!skipAdvance) levelManager.advanceRows();
            skipAdvance = false;

            levelManager.spawnNewRow(game.roundIndex, ballManager.totalCount);

            if (levelManager.isGameOver()) {
                // Son Şans: ilk kez game-over tetiklenince uyarı ekranı göster
                if (!lastChanceUsed) {
                    fsm.transition('LAST_CHANCE');
                } else {
                    fsm.transition('GAME_OVER');
                }
                return;
            }

            // Round ends when shots hit 0
            if (game.shotsRemaining <= 0) {
                // Stress spreading is DEFERRED to AIMING enter so the player
                // can see the jump animation and floating text on the board.
                game._pendingStressSpread = true;

                // ── Round tamamlama altın bonusu — azaltıldı (ekonomi dengesi) ──
                // Eski: 1 + level*0.5 + round*0.3 ≈ ch5r5: 4g  (çok kolay skill açılıyordu)
                // Yeni: level*0.3 ≈ ch1: 0g, ch5: 1g, ch10: 3g — kazanım skill tree ile sınırlı
                const roundGold = Math.floor(levelManager.currentLevel * 0.3);
                game.gold += roundGold;
                game.collectibles.push({
                    x: NJOX.CANVAS_W / 2, y: NJOX.CANVAS_H * 0.35,
                    type: 'gold', amount: roundGold, timer: 1.8,
                });

                // Yıkıcı Kule — round biterken 1 top yakar
                if (game._wreckerTower && game._wreckerTower.alive) {
                    ballManager.totalCount = Math.max(1, ballManager.totalCount - 1);
                    game.collectibles.push({
                        x: NJOX.CANVAS_W / 2, y: NJOX.GRID_TOP + NJOX.CELL_SIZE * 2,
                        type:'dmg', amount:'🗼 -1🎱', timer:2.2,
                    });
                }

                if (game.roundIndex >= NJOX.ROUNDS_PER_LEVEL) {
                    // All rounds done → boss
                    fsm.transition('BOSS_PROMPT', { level: levelManager.currentLevel });
                    return;
                }
                // Advance to next round
                game.roundIndex++;
                game.shotsRemaining = NJOX.SHOTS_PER_ROUND;
                _resetRoundCards(); // önceki round kartlarını temizle
                // Kart seçimi göster, sonra ROUND_INTRO'ya gider
                fsm.transition('CARD_PICK');
                return;
            }
        },
        update(dt) {
            turnEndDelay -= dt;
            updateGameSystems(dt);

            // Boss death: wait for death animation (deathTimer driven by boss.update)
            if (bossMode && boss && !boss.alive) {
                if (boss.deathTimer <= 0) {
                    if (replayMode) {
                        fsm.transition('BOSS_REPLAY_VICTORY');
                    } else {
                        fsm.transition('BOSS_VICTORY');
                    }
                }
                return;
            }

            if (turnEndDelay <= 0) fsm.transition('AIMING');
        },
        render(c) { renderGameScene(c); },
        exit() {}
    });

    // ── BOSS_BETWEEN_TURNS ──────────────────────────────────────────────
    // Boss hâlâ yaşıyorken atışlar bitti → kısa mola, boss aksiyon yapar,
    // atışlar yenilenir ve tekrar AIMING'e dönülür.
    fsm.add('BOSS_BETWEEN_TURNS', {
        enter() {
            this._timer = 2.5;
            if (!game._bossTurnCount) game._bossTurnCount = 0;
            game._bossTurnCount++;
            game.shotsRemaining = NJOX.BOSS_SHOTS;
            if (boss && boss.alive) boss.performTurnAction();
        },
        update(dt) {
            this._timer -= dt;
            updateGameSystems(dt);
            if (boss) boss.update(dt);
            for (const m of (boss ? boss.minions : [])) m.update(dt);

            // Boss beam tamamlanana kadar bekle
            if (boss && boss.beam) return;

            // Boss öldüyse (enrage self-damage)
            if (boss && !boss.alive) {
                fsm.transition('TURN_END');
                return;
            }

            if (this._timer <= 0) fsm.transition('AIMING');
        },
        render(c) {
            renderGameScene(c);
            // "BOSS HAZIRLANIYOR" uyarı metni
            c.save();
            c.fillStyle = '#fff';
            c.globalAlpha = 0.5 + 0.3 * Math.abs(Math.sin(Date.now() / 200));
            c.font = 'bold 18px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('— BOSS HAZIRLANIYOR —', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 80);
            c.restore();
        },
        exit() {}
    });

    // ── BOSS_PROMPT ───────────────────────────────────────────────────────
    fsm.add('BOSS_PROMPT', {
        enter(data) {
            this._level = data.level;
            levelManager.currentLevel = data.level;
            NJOX.BossFlow.startPrompt(modal, (answer) => {
                fsm.transition('BOSS_INTRO', { level: this._level, name: answer });
            });
        },
        update(dt) { modal.update(dt); },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);
            modal.render(c);
        },
        exit() {}
    });

    // ── BOSS_INTRO ────────────────────────────────────────────────────────
    fsm.add('BOSS_INTRO', {
        enter(data) {
            bossMode = true;
            boss     = NJOX.BossFlow.createBoss(data.level, data.name, ballManager.totalCount);
            levelManager.creatures = [];
            NJOX.Physics.reset();
            NJOX.Renderer.triggerShake(8, 0.5);
            game.shotsRemaining = NJOX.BOSS_SHOTS;
            game._bossTurnCount = 0;
            this._timer = 2.0;
        },
        update(dt) {
            this._timer -= dt;
            if (boss) boss.update(dt);
            particles.update(dt);
            NJOX.Renderer.updateShake(dt);
            if (this._timer <= 0) fsm.transition('AIMING');
        },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.save();
            c.translate(NJOX.Renderer.shakeOffset.x, NJOX.Renderer.shakeOffset.y);
            if (boss) boss.render(c);
            const alpha = Math.min(1, (2.0 - this._timer) / 1.0);
            c.globalAlpha = alpha;
            c.fillStyle = NJOX.COLORS.FLOOR;
            c.font = 'bold 28px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(boss.name.toUpperCase(), NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 100);
            c.fillStyle = '#fff';
            c.font = '12px monospace';
            c.fillText(replayMode ? 'REPLAY BOSS' : 'YOUR STRESS AWAITS', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 130);
            c.restore();
            particles.render(c);
            game.bossMode = true;
            NJOX.HUD.render(c, game);
            if (boss) NJOX.BossHPBar.render(c, boss);
        },
        exit() {}
    });

    // ── BOSS_VICTORY (normal play) ────────────────────────────────────────
    fsm.add('BOSS_VICTORY', {
        enter() {
            this._timer   = 4.2;
            this._elapsed = 0;

            // Gold reward from loot table
            const ch                = levelManager.currentLevel;
            const { total, base, loot } = rollBossGold(ch);
            this._goldEarned        = total;
            this._goldBase          = base;
            this._goldLoot          = loot;
            game.gold              += total;

            // Ball bonus
            ballManager.addBalls(3);

            // Save chapter progress
            const bossName = boss ? boss.name : 'STRESS';
            progress.completeChapter(ch, bossName);

            // Daily challenge tamamlandıysa kaydet
            if (dailyMode) {
                progress.completeDaily();
                dailyMode = false;
                this._dailyBonus = true;
                game.gold += 15; // günlük bonus
            } else {
                this._dailyBonus = false;
            }

            // Effects
            particles.emitDeathBurst(boss.x, boss.y, boss.w, boss.h, NJOX.COLORS.BOSS_RAGE);
            particles.emitDeathBurst(boss.x, boss.y, boss.w, boss.h, '#ffd700');
            NJOX.Renderer.triggerShake(10, 0.5);
            NJOX.Sound.bossDefeated();

            // ── İsim dağılma partikülleri ─────────────────────────────
            // 0.8s sonra her harf ayrı ayrı savrulur
            const name    = bossName.toUpperCase();
            const CX      = NJOX.CANVAS_W / 2;
            const nameY   = NJOX.CANVAS_H / 2 - 15;
            const charW   = 16.2; // bold 26px monospace approx
            const totalW  = name.length * charW;
            const startX  = CX - totalW / 2 + charW / 2;

            this._nameLetters = name.split('').map((ch2, i) => ({
                ch:    ch2,
                x:     startX + i * charW,
                y:     nameY,
                vx:    (Math.random() - 0.5) * 140,
                vy:    -(35 + Math.random() * 90),
                rot:   0,
                rotV:  (Math.random() - 0.5) * 8,
                alpha: 1,
                delay: i * 0.045,   // harfler sırayla dağılır
            }));
        },

        update(dt) {
            this._timer   -= dt;
            this._elapsed += dt;
            particles.update(dt);
            NJOX.Renderer.updateShake(dt);

            // 0.8s geçince dağılma başlar
            if (this._elapsed >= 0.8) {
                const scatterElapsed = this._elapsed - 0.8;
                for (const p of this._nameLetters) {
                    const t = scatterElapsed - p.delay;
                    if (t <= 0) continue;
                    p.x    += p.vx  * dt;
                    p.y    += p.vy  * dt;
                    p.vy   += 120   * dt; // yerçekimi
                    p.rot  += p.rotV * dt;
                    p.alpha = Math.max(0, 1 - t * 0.9);
                }
            }

            if (this._timer <= 0) {
                bossMode = false;
                boss     = null;
                fsm.transition('MAP');
            }
        },

        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.save();
            c.translate(NJOX.Renderer.shakeOffset.x, NJOX.Renderer.shakeOffset.y);
            particles.render(c);
            c.restore();

            const CX = NJOX.CANVAS_W / 2;
            const CY = NJOX.CANVAS_H / 2;
            const scattering = this._elapsed >= 0.8;

            c.save();
            c.fillStyle = 'rgba(0,0,0,0.45)';
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

            c.textAlign    = 'center';
            c.textBaseline = 'middle';

            // "CHAPTER COMPLETE!" — sadece dağılma öncesi görünür, sonra solar
            const headerAlpha = scattering
                ? Math.max(0, 1 - (this._elapsed - 0.8) * 1.2)
                : 1;
            if (headerAlpha > 0) {
                c.globalAlpha = headerAlpha;
                c.fillStyle   = '#ffd700';
                c.font        = 'bold 22px monospace';
                c.fillText('CHAPTER COMPLETE!', CX, CY - 55);
                c.globalAlpha = 1;
            }

            // "DEFEATED" — dağılma öncesi statik, sonra solar
            const defAlpha = scattering
                ? Math.max(0, 1 - (this._elapsed - 0.8) * 1.5)
                : 1;
            if (defAlpha > 0) {
                c.globalAlpha = defAlpha;
                c.fillStyle   = '#888';
                c.font        = '11px monospace';
                c.fillText('DEFEATED', CX, CY + 14);
                c.globalAlpha = 1;
            }

            // ── İsim harfleri ─────────────────────────────────────────
            // Dağılmadan önce: normal statik metin
            if (!scattering) {
                c.fillStyle = NJOX.COLORS.FLOOR;
                c.font      = 'bold 26px monospace';
                c.fillText(this._nameLetters.map(p => p.ch).join(''), CX, CY - 15);
            } else {
                // Dağılma: her harf ayrı çizilir, döner, solar
                c.font = 'bold 26px monospace';
                for (const p of this._nameLetters) {
                    if (p.alpha <= 0) continue;
                    c.save();
                    c.globalAlpha = p.alpha;
                    c.translate(p.x, p.y);
                    c.rotate(p.rot);
                    c.fillStyle = NJOX.COLORS.FLOOR;
                    c.shadowColor = '#e94560';
                    c.shadowBlur  = 8 * p.alpha;
                    c.fillText(p.ch, 0, 0);
                    c.restore();
                }
            }

            // Gold + balls — dağılma sonrası beliriyor
            const rewardAlpha = scattering
                ? Math.min(1, (this._elapsed - 1.4) * 1.5)
                : 0;
            if (rewardAlpha > 0) {
                c.globalAlpha = rewardAlpha;
                c.fillStyle   = '#ffd700';
                c.font        = 'bold 16px monospace';
                c.fillText('+' + this._goldEarned + 'g', CX, CY + 42);
                c.fillStyle   = 'rgba(255,215,0,0.55)';
                c.font        = '10px monospace';
                c.fillText(this._goldBase + 'g base  +  ' + this._goldLoot + 'g loot', CX, CY + 60);
                c.fillStyle   = '#4ecca3';
                c.font        = '12px monospace';
                c.fillText('+3 Balls', CX, CY + 82);

                if (this._dailyBonus) {
                    c.fillStyle = '#ffd700';
                    c.font      = 'bold 11px monospace';
                    c.fillText('📅 GÜNLÜK GÖREV: +15g', CX, CY + 102);
                }

                c.globalAlpha = 1;
            }

            c.restore();
        },
        exit() {}
    });

    // ── BOSS_REPLAY_VICTORY ───────────────────────────────────────────────
    // Triggered after winning a replayed boss fight
    fsm.add('BOSS_REPLAY_VICTORY', {
        enter() {
            this._timer = 3.0;
            const ch                = replayChapterNum;
            const { total, base, loot } = rollBossGold(ch);
            this._goldEarned        = total;
            this._goldBase          = base;
            this._goldLoot          = loot;
            game.gold              += total;

            particles.emitDeathBurst(boss.x, boss.y, boss.w, boss.h, NJOX.COLORS.BOSS_RAGE);
            particles.emitDeathBurst(boss.x, boss.y, boss.w, boss.h, '#ffd700');
            NJOX.Renderer.triggerShake(10, 0.5);
            NJOX.Sound.bossDefeated();
        },
        update(dt) {
            this._timer -= dt;
            particles.update(dt);
            NJOX.Renderer.updateShake(dt);
            if (this._timer <= 0) {
                // Show rename prompt
                const ch2      = progress.getChapter(replayChapterNum);
                const oldName  = ch2 && ch2.boss ? ch2.boss.name : 'STRESS';
                const ch       = replayChapterNum;
                modal.show({
                    title:     'RENAME YOUR STRESS?',
                    body:      'You earned +' + this._goldEarned + 'g!\nGive your stress a new name (optional)',
                    showInput: true,
                    onSubmit: (newName) => {
                        progress.renameBoss(ch, newName);
                        bossMode   = false;
                        boss       = null;
                        replayMode = false;
                        fsm.transition('MAP');
                    },
                    onSkip: () => {
                        bossMode   = false;
                        boss       = null;
                        replayMode = false;
                        fsm.transition('MAP');
                    }
                });
                fsm.transition('BOSS_RENAME_PROMPT');
            }
        },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.save();
            c.translate(NJOX.Renderer.shakeOffset.x, NJOX.Renderer.shakeOffset.y);
            particles.render(c);
            c.restore();

            c.save();
            c.fillStyle = 'rgba(0,0,0,0.45)';
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.fillStyle = '#ffd700';
            c.font = 'bold 20px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('STRESS DEFEATED AGAIN!', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 40);
            c.fillStyle = '#ffd700';
            c.font = 'bold 20px monospace';
            c.fillText('+' + this._goldEarned + 'g', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 10);
            c.fillStyle = 'rgba(255,215,0,0.5)';
            c.font = '10px monospace';
            c.fillText(this._goldBase + 'g base  +  ' + this._goldLoot + 'g loot', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 30);
            c.restore();
        },
        exit() {}
    });

    // ── BOSS_RENAME_PROMPT ────────────────────────────────────────────────
    // Intermediate state: waits while rename modal is open (HTML overlay)
    fsm.add('BOSS_RENAME_PROMPT', {
        enter() {},
        update(dt) { modal.update(dt); },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);
        },
        exit() {}
    });

    // ── LAST_CHANCE ───────────────────────────────────────────────────────
    // Bir yaratık zemine ulaşınca: kurtarma fırsatı sunulur (1 kez / bölüm)
    fsm.add('LAST_CHANCE', {
        enter() {
            this._timer = 4.0;
            const ch = levelManager.currentLevel;
            // Stress Shield skill: Son Şans bedavaya
            this._cost      = (progress.skills.stressShield >= 1) ? 0 : Math.min(60, 15 + ch * 3);
            this._canAfford = game.gold >= this._cost;
            NJOX.Renderer.triggerShake(7, 0.4);
        },
        update(dt) {
            this._timer -= dt;
            particles.update(dt);
            NJOX.Renderer.updateShake(dt);
            if (this._timer <= 0) {
                fsm.transition('GAME_OVER');
            }
        },
        render(c) {
            renderGameScene(c);

            // Nabız gibi kırmızı alarm overlay
            const pulse = 0.25 + Math.abs(Math.sin(Date.now() / 190)) * 0.25;
            c.save();
            c.fillStyle = `rgba(233,30,30,${pulse})`;
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

            // Panel
            c.fillStyle = 'rgba(0,0,0,0.78)';
            c.fillRect(0, NJOX.CANVAS_H / 2 - 88, NJOX.CANVAS_W, 176);

            c.textAlign   = 'center';
            c.textBaseline = 'middle';

            c.fillStyle = '#ff4444';
            c.font      = 'bold 18px monospace';
            c.fillText('⚠  STRES DİBİNE ULAŞTI  ⚠', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 56);

            if (this._canAfford) {
                c.fillStyle = '#ffd700';
                c.font      = 'bold 20px monospace';
                const costLabel = this._cost === 0 ? '🛡 SON ŞANS: BEDAVA' : 'SON ŞANS: ' + this._cost + 'g';
                c.fillText(costLabel, NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 14);
                c.fillStyle = 'rgba(255,255,255,0.65)';
                c.font      = '12px monospace';
                c.fillText('Tıkla — o stres bloğunu çöpe at!', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 18);
            } else {
                c.fillStyle = '#aaa';
                c.font      = '16px monospace';
                c.fillText('Yetersiz gold', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 8);
                c.font      = '11px monospace';
                c.fillStyle = 'rgba(255,255,255,0.4)';
                c.fillText('(gereken: ' + this._cost + 'g)', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 18);
            }

            // Geri sayım çubuğu
            const barW = 220;
            const barX = NJOX.CANVAS_W / 2 - barW / 2;
            const barY = NJOX.CANVAS_H / 2 + 52;
            c.fillStyle = 'rgba(255,255,255,0.12)';
            c.fillRect(barX, barY, barW, 5);
            c.fillStyle = '#e94560';
            c.fillRect(barX, barY, barW * (this._timer / 4.0), 5);

            c.restore();
        },
        exit() {}
    });

    // ── CARD_PICK ─────────────────────────────────────────────────────────
    // 3 kapalı kutu (?) — tıklayınca kart açılır, diğerleri de gösterilir.
    fsm.add('CARD_PICK', {
        enter() {
            this._cards        = _pickRandomCards(3);
            this._chosen       = -1;       // seçilen kart indexi (-1 = henüz seçilmedi)
            this._revealed     = false;    // true = kartlar açıldı
            this._btnRects     = [];
            this._skipRect     = null;
            this._timer        = 0;        // elapsed
            this._confirmTimer = -1;
            input.consumeLaunch();
        },
        update(dt) {
            updateGameSystems(dt);
            this._timer += dt;
            if (this._confirmTimer >= 0) {
                this._confirmTimer -= dt;
                if (this._confirmTimer <= 0) fsm.transition('ROUND_INTRO');
            }
        },
        render(c) {
            renderGameScene(c);

            const CX     = NJOX.CANVAS_W / 2;
            const CY     = NJOX.CANVAS_H / 2;
            const cards  = this._cards;
            const chosen = this._chosen;
            const rev    = this._revealed;

            c.save();

            // Overlay
            c.fillStyle = 'rgba(0,0,0,0.74)';
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);

            // Kill count — en tepede, büyük
            if (game.totalKills > 0) {
                const killName = NJOX._stressName || 'stres';
                const pulse    = 0.75 + 0.25 * Math.abs(Math.sin(this._timer * 1.6));
                c.globalAlpha  = pulse;
                c.textAlign    = 'center';
                c.textBaseline = 'middle';
                c.fillStyle    = '#4ecca3';
                c.font         = 'bold 20px monospace';
                c.fillText(game.totalKills + ' adet ' + killName + ' öldürdün', CX, 38);
                c.globalAlpha  = 1;
            }

            // Başlık
            c.textAlign    = 'center';
            c.textBaseline = 'middle';
            c.fillStyle    = rev ? 'rgba(255,215,0,0.8)' : '#ffd700';
            c.font         = 'bold 17px monospace';
            c.fillText(rev ? 'KADER AÇIKLANDI' : 'KADER KARTLARI', CX, CY - 115);

            c.fillStyle = 'rgba(255,255,255,0.28)';
            c.font      = '9px monospace';
            c.fillText('CH' + levelManager.currentLevel + '  ·  ROUND ' + game.roundIndex + '/' + NJOX.ROUNDS_PER_LEVEL, CX, CY - 98);

            const CARD_W = 98;
            const CARD_H = 132;
            const GAP    = 12;
            const totalW = 3 * CARD_W + 2 * GAP;
            const startX = CX - totalW / 2;
            const cardY  = CY - CARD_H / 2 - 4;

            this._btnRects = [];

            for (let i = 0; i < 3; i++) {
                const card       = cards[i];
                const cx         = startX + i * (CARD_W + GAP);
                const isChosen   = chosen === i;
                const isRejected = rev && !isChosen;
                const isNeg      = card.type === 'negative';

                // ── Renk şeması ──────────────────────────────────────
                let borderCol, bgCol;
                if (!rev) {
                    borderCol = 'rgba(100,130,255,0.55)';
                    bgCol     = 'rgba(16,18,52,0.96)';
                } else if (isChosen) {
                    borderCol = isNeg ? '#ff4444' : '#ffd700';
                    bgCol     = isNeg ? 'rgba(90,0,0,0.40)' : 'rgba(255,215,0,0.15)';
                } else {
                    borderCol = 'rgba(70,70,70,0.4)';
                    bgCol     = 'rgba(10,10,20,0.65)';
                }

                // Gölge
                c.shadowColor = isChosen ? (isNeg ? '#ff3333' : '#ffd700') : 'rgba(100,130,255,0.3)';
                c.shadowBlur  = isChosen ? 22 : (rev ? 0 : 8);

                // Kart zemin
                c.fillStyle = bgCol;
                NJOX.Utils.roundRect(c, cx, cardY, CARD_W, CARD_H, 10);
                c.fill();
                c.shadowBlur = 0; c.shadowColor = 'transparent';

                // Border
                c.strokeStyle = borderCol;
                c.lineWidth   = isChosen ? 2.5 : 1.5;
                NJOX.Utils.roundRect(c, cx, cardY, CARD_W, CARD_H, 10);
                c.stroke();

                if (!rev) {
                    // ── KAPALI KUTU: büyük pulsing ? ─────────────────
                    const pulse = 0.72 + 0.28 * Math.sin(this._timer * 2.8 + i * 1.3);
                    c.globalAlpha = pulse;
                    c.font         = 'bold 48px monospace';
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.fillStyle    = 'rgba(140,160,255,0.95)';
                    c.fillText('?', cx + CARD_W / 2, cardY + CARD_H / 2 - 8);
                    c.globalAlpha = pulse * 0.55;
                    c.font = 'bold 9px monospace';
                    c.fillStyle = 'rgba(180,200,255,0.9)';
                    c.fillText('TIKLA', cx + CARD_W / 2, cardY + CARD_H - 18);
                    c.globalAlpha = 1;

                    this._btnRects.push({ x: cx, y: cardY, w: CARD_W, h: CARD_H });
                } else {
                    // ── AÇIK KART içeriği ────────────────────────────
                    c.globalAlpha = isRejected ? 0.38 : 1;

                    // Negatif kart üst şerit
                    if (isNeg) {
                        c.fillStyle = isChosen ? 'rgba(180,0,0,0.5)' : 'rgba(120,0,0,0.3)';
                        c.fillRect(cx + 1, cardY + 1, CARD_W - 2, 16);
                        c.fillStyle = isChosen ? '#ff9999' : '#ff6666';
                        c.font = 'bold 9px monospace';
                        c.textAlign = 'center';
                        c.textBaseline = 'middle';
                        c.fillText('⚠ OLUMSUZ', cx + CARD_W / 2, cardY + 9);
                    }

                    // İkon
                    const iconY = isNeg ? cardY + 40 : cardY + 34;
                    c.font         = '26px serif';
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.fillText(card.icon, cx + CARD_W / 2, iconY);

                    // İsim
                    c.font      = 'bold 11px monospace';
                    c.fillStyle = isChosen ? (isNeg ? '#ff7777' : '#ffd700') : '#cccccc';
                    c.fillText(card.name, cx + CARD_W / 2, cardY + 66);

                    // Açıklama (2 satır)
                    c.font      = '9px monospace';
                    c.fillStyle = 'rgba(255,255,255,0.6)';
                    const words = card.desc.split(' ');
                    let line1 = '', line2 = '', l1Done = false;
                    for (const w of words) {
                        if (!l1Done && (line1 + w).length <= 14) {
                            line1 += (line1 ? ' ' : '') + w;
                        } else { l1Done = true; line2 += (line2 ? ' ' : '') + w; }
                    }
                    c.fillText(line1, cx + CARD_W / 2, cardY + 82);
                    c.fillText(line2, cx + CARD_W / 2, cardY + 93);

                    // Sonuç etiketi (alt)
                    const lblY = cardY + CARD_H - 14;
                    if (isChosen) {
                        c.fillStyle = isNeg ? '#ff4444' : '#ffd700';
                        c.font      = 'bold 10px monospace';
                        c.fillText(isNeg ? '✗ KÖTÜ ŞANS' : '✓ SEÇİLDİ', cx + CARD_W / 2, lblY);
                    } else {
                        c.fillStyle = 'rgba(255,255,255,0.25)';
                        c.font      = '10px monospace';
                        c.fillText('✗', cx + CARD_W / 2, lblY);
                    }

                    c.globalAlpha = 1;
                }
            }

            // Skip butonu — 0.5s sonra görünür, belirgin
            if (!rev && this._timer > 0.5) {
                const skipAlpha = Math.min(1, (this._timer - 0.5) / 0.4);
                const skipW = 120, skipH = 28;
                const skipX = CX - skipW / 2;
                const skipY = cardY + CARD_H + 16;
                c.globalAlpha = skipAlpha;
                c.fillStyle   = 'rgba(255,255,255,0.12)';
                NJOX.Utils.roundRect(c, skipX, skipY, skipW, skipH, 6);
                c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.4)';
                c.lineWidth   = 1.5;
                c.stroke();
                c.fillStyle    = 'rgba(255,255,255,0.6)';
                c.font         = 'bold 11px monospace';
                c.textAlign    = 'center';
                c.textBaseline = 'middle';
                c.fillText('ATLA ▶', CX, skipY + 14);
                c.globalAlpha = 1;
                this._skipRect = { x: skipX, y: skipY, w: skipW, h: skipH };
            } else {
                this._skipRect = null;
            }

            c.restore();
        },
        exit() {}
    });

    // ── SKILL_TREE ────────────────────────────────────────────────────────
    // Harita ekranından erişilen pasif beceri satın alma ekranı.
    fsm.add('SKILL_TREE', {
        enter() {
            this._btnRects = []; // her skill için { id, x, y, w, h }
            this._backRect = null;
            this._msg      = null; // { text, timer, color }
            input.consumeLaunch();
        },
        update(dt) {
            if (this._msg) {
                this._msg.timer -= dt;
                if (this._msg.timer <= 0) this._msg = null;
            }
        },
        render(c) {
            NJOX.Renderer.drawBackground(c, NJOX.CANVAS_W, NJOX.CANVAS_H);

            const CX = NJOX.CANVAS_W / 2;
            const gold = game.gold;

            c.save();
            c.textAlign    = 'center';
            c.textBaseline = 'middle';

            // ── Başlık ───────────────────────────────────────────────
            c.fillStyle = '#ffd700';
            c.font      = 'bold 20px monospace';
            c.fillText('⚡ BECERİ AĞACI', CX, 46);

            // Gold gösterimi
            c.fillStyle = '#ffd700';
            c.font      = 'bold 14px monospace';
            c.fillText('💰 ' + gold + 'g', CX, 74);

            // ── Beceriler ────────────────────────────────────────────
            const ids   = ['ironFist', 'nerveSystem', 'stressShield', 'bloodTaste'];
            const ROW_H = 110;
            const TOP_Y = 95;
            const CARD_W2 = NJOX.CANVAS_W - 40;
            const CARD_X  = 20;

            this._btnRects = [];

            for (let i = 0; i < ids.length; i++) {
                const id   = ids[i];
                const def  = progress.SKILL_DEFS[id];
                const lv   = progress.skills[id] || 0;
                const cost = progress.getSkillCost(id);
                const maxed = cost === null;
                const canAfford = !maxed && gold >= cost;
                const y = TOP_Y + i * (ROW_H + 12);

                // Kart arka planı
                c.fillStyle = maxed ? 'rgba(78,204,163,0.25)' : 'rgba(20,22,40,0.85)';
                NJOX.Utils.roundRect(c, CARD_X, y, CARD_W2, ROW_H, 8);
                c.fill();

                // Border
                c.strokeStyle = maxed ? '#4ecca3' : canAfford ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.12)';
                c.lineWidth   = maxed ? 2 : 1.5;
                NJOX.Utils.roundRect(c, CARD_X, y, CARD_W2, ROW_H, 8);
                c.stroke();

                // Seviye noktaları
                for (let s = 0; s < def.maxLevel; s++) {
                    const dotX = CARD_X + 16 + s * 14;
                    const dotY = y + 14;
                    c.beginPath();
                    c.arc(dotX, dotY, 4, 0, Math.PI * 2);
                    c.fillStyle = s < lv ? '#ffd700' : 'rgba(255,255,255,0.15)';
                    c.fill();
                }

                // İsim
                c.fillStyle    = maxed ? '#4ecca3' : '#ffffff';
                c.font         = 'bold 14px monospace';
                c.textAlign    = 'left';
                c.fillText(def.name, CARD_X + 16, y + 40);

                // Açıklama
                c.fillStyle = 'rgba(255,255,255,0.55)';
                c.font      = '11px monospace';
                c.fillText(def.desc, CARD_X + 16, y + 62);

                // Satın al butonu
                const btnW = 100, btnH = 32;
                const btnX = CARD_X + CARD_W2 - btnW - 10;
                const btnY = y + (ROW_H - btnH) / 2;

                if (maxed) {
                    c.fillStyle    = 'rgba(78,204,163,0.2)';
                    NJOX.Utils.roundRect(c, btnX, btnY, btnW, btnH, 6);
                    c.fill();
                    c.fillStyle    = '#4ecca3';
                    c.font         = 'bold 12px monospace';
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.fillText('MAX ✓', btnX + btnW / 2, btnY + btnH / 2);
                } else {
                    c.fillStyle = canAfford ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.04)';
                    NJOX.Utils.roundRect(c, btnX, btnY, btnW, btnH, 6);
                    c.fill();
                    c.strokeStyle = canAfford ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.1)';
                    c.lineWidth   = 1.5;
                    c.stroke();
                    c.fillStyle    = canAfford ? '#ffd700' : 'rgba(255,255,255,0.25)';
                    c.font         = 'bold 12px monospace';
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.fillText(cost + 'g AL', btnX + btnW / 2, btnY + btnH / 2);

                    // Tıklama alanı
                    this._btnRects.push({ id, x: btnX, y: btnY, w: btnW, h: btnH });
                }
            }

            // ── Geri butonu ──────────────────────────────────────────
            const backW = 140, backH = 38;
            const backX = CX - backW / 2;
            const backY = NJOX.CANVAS_H - 58;
            c.fillStyle = 'rgba(255,255,255,0.07)';
            NJOX.Utils.roundRect(c, backX, backY, backW, backH, 8);
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.2)';
            c.lineWidth   = 1;
            c.stroke();
            c.fillStyle    = 'rgba(255,255,255,0.6)';
            c.font         = 'bold 13px monospace';
            c.textAlign    = 'center';
            c.textBaseline = 'middle';
            c.fillText('← HARİTA', CX, backY + backH / 2);
            this._backRect = { x: backX, y: backY, w: backW, h: backH };

            // ── Bildirim mesajı ──────────────────────────────────────
            if (this._msg) {
                const alpha = Math.min(1, this._msg.timer * 2);
                c.globalAlpha = alpha;
                c.fillStyle   = this._msg.color || '#ffd700';
                c.font        = 'bold 13px monospace';
                c.textAlign   = 'center';
                c.textBaseline = 'middle';
                c.fillText(this._msg.text, CX, NJOX.CANVAS_H - 80);
                c.globalAlpha = 1;
            }

            c.restore();
        },
        exit() {}
    });

    // ── GAME_OVER ─────────────────────────────────────────────────────────
    fsm.add('GAME_OVER', {
        enter() {
            gameOverDelay = 1.0;
            progress.updateHighestBalls(ballManager.totalCount);
        },
        update(dt) {
            gameOverDelay -= dt;
            particles.update(dt);
            if (gameOverDelay <= 0 && input.consumeLaunch()) fsm.transition('MAP');
        },
        render(c) {
            renderGameScene(c);
            c.save();
            c.fillStyle = 'rgba(0,0,0,0.6)';
            c.fillRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            c.fillStyle = NJOX.COLORS.FLOOR;
            c.font = 'bold 32px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('GAME OVER', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 - 30);
            c.fillStyle = '#fff';
            c.font = '14px monospace';
            c.fillText('Chapter ' + levelManager.currentLevel, NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 10);
            if (gameOverDelay <= 0) {
                const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
                c.globalAlpha = pulse;
                c.fillStyle = NJOX.COLORS.TEXT_DIM;
                c.font = '14px monospace';
                c.fillText('Tap to return to Map', NJOX.CANVAS_W / 2, NJOX.CANVAS_H / 2 + 60);
            }
            c.restore();
        },
        exit() {}
    });

    // ═════════════════════════════════════════════════════════════════════
    // SPAWN PATCH (splitter children)
    // ═════════════════════════════════════════════════════════════════════

    const origOnHit = NJOX.Creature.prototype.onHit;
    NJOX.Creature.prototype.onHit = function (ball, face, dmg) {
        const result = origOnHit.call(this, ball, face, dmg);
        if (result && result.killed && result.spawns) {
            this._pendingSpawns = result.spawns;
        }
        return result;
    };

    // ═════════════════════════════════════════════════════════════════════
    // INIT & START
    // ═════════════════════════════════════════════════════════════════════

    progress.init();
    NJOX.Sound.init(); // visibilitychange + touch/click resume listeners

    const loop = new NJOX.GameLoop(
        (dt) => fsm.update(dt * (game.speedMultiplier || 1)),
        () => {
            ctx.clearRect(0, 0, NJOX.CANVAS_W, NJOX.CANVAS_H);
            fsm.render(ctx);
        }
    );

    window._njoxDebug = { fsm, ballManager, levelManager, input, particles, rewardSystem, game, progress };

    fsm.transition('TITLE');
    loop.start();

})();
