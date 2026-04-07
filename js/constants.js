window.NJOX = window.NJOX || {};

// Canvas
NJOX.CANVAS_W = 500;
NJOX.CANVAS_H = 720;

// Physics
NJOX.BALL_SPEED = 700;
NJOX.BALL_RADIUS = 6;
NJOX.PHYSICS_STEP = 1 / 120;
NJOX.GRAVITY = 0;

// Grid
NJOX.CELL_SIZE = 50;
NJOX.GRID_COLS = Math.floor(NJOX.CANVAS_W / NJOX.CELL_SIZE);
NJOX.GRID_TOP = 80;
NJOX.FLOOR_Y = 640; // ball return line — shop area below
NJOX.SHOP_Y = 648;  // shop bar starts here
NJOX.SHOP_H = 72;   // compact button bar (648 to 720)

// Gameplay
NJOX.LAUNCH_INTERVAL = 0.06;
NJOX.INITIAL_BALLS = 4;
NJOX.BOSS_EVERY = 2; // boss every N levels (after level 1)
NJOX.ROW_ADVANCE = 0.5;

// Round system
NJOX.ROUNDS_PER_LEVEL = 5;
NJOX.SHOTS_PER_ROUND = 10; // 5 rounds x 10 shots = 50 total per level
NJOX.BOSS_SHOTS = 20;

// Boss HP scaling — ball count × ratio × multiplier
// Hedef: oyuncunun 20-40 atışta öldürebileceği boss
// ch1 4 top → ~80 HP (~8-10 atış)  |  ch5 30 top → ~2640 HP (~25 atış)
// ch10 130 top → ~14300 HP (~30 atış)
NJOX.BOSS_HP_RATIO_BASE   = 2.0;  // ch1'de ball başına HP oranı (was 1.2)
NJOX.BOSS_HP_RATIO_PER_CH = 0.6;  // her chapter +0.6 oran (was 0.4)
NJOX.BOSS_HP_MULTIPLIER   = 11;   // yaratıklara göre 11x tanklı (was 3)

// Shop prices
NJOX.SHOP = {
    FIRE_BALL:  { cost: 10, label: '🔥 ATEŞ TOPU',  color: '#ff4444', desc: 'Sonraki 5 top · 3× hasar verir',     count: 5 },
    BOMB_BALL:  { cost: 18, label: '💣 BOMBA TOPU', color: '#ff6600', desc: 'Sonraki 3 top · AoE patlama hasarı',  count: 3 },
    GHOST_BALL: { cost: 14, label: '👻 HAYALET',    color: '#aaaaff', desc: 'Sonraki 5 top · nüfuz eder + 2× hasar', count: 5 },
    ICE_BALL:   { cost: 12, label: '❄️ BUZ TOPU',   color: '#88ddff', desc: 'Sonraki 5 top · düşmanı dondurur',   count: 5 },
};

// Colors
NJOX.COLORS = {
    BG: '#1a1a2e',
    BG_GRADIENT_TOP: '#16213e',
    BG_GRADIENT_BOT: '#0f3460',
    FLOOR: '#e94560',
    BALL: '#ffffff',
    BALL_GLOW: 'rgba(255,255,255,0.3)',
    AIM_LINE: 'rgba(255,255,255,0.4)',
    TEXT: '#ffffff',
    TEXT_DIM: 'rgba(255,255,255,0.6)',
    HUD_BG: 'rgba(0,0,0,0.3)',

    BASIC: '#4ecca3',
    SPLITTER: '#a855f7',
    EATER: '#ef4444',
    COUNTER: '#f59e0b',
    REACTIVE: '#3b82f6',
    REACTIVE_MUTATED: '#ec4899',
    VAMPIRE:         '#2d0050',
    VAMPIRE_FLAME:   '#9900ff',
    BALL_CARRIER:    '#00e5a0',
    VOMITER:         '#6b9900',   // sickly olive-yellow body
    VOMITER_BILE:    '#c8f000',   // bright bile drip
    STRESS_SPREADER: '#7a1010',   // dark sick red
    STRESS_FLAME:    '#ff6600',   // orange stress flame

    BOMB_BALL:  '#ff6600',
    GHOST_BALL: '#aaaaff',

    SHIELD:         '#1a44cc',   // koyu mavi gövde
    SHIELD_ARC:     '#88bbff',   // parlak mavi kalkan yayı
    CHAINED:        '#7a5500',   // koyu altın gövde
    CHAINED_LINK:   '#ffcc00',   // parlak zincir halka

    BOSS_PHASE1: '#4ecca3',
    BOSS_PHASE2: '#f59e0b',
    BOSS_PHASE3: '#ef4444',
    BOSS_RAGE: '#ff0055',

    FIRE: '#ff4444',
    ICE: '#88ddff',

    MODAL_BG: 'rgba(0,0,0,0.7)',
    BUTTON: '#e94560',
    BUTTON_HOVER: '#ff6b81',
    HP_BAR_BG: '#333',
    HP_BAR_FILL: '#4ecca3',
    SHOP_BG: 'rgba(0,0,0,0.5)',
};

// Legacy — no longer used (HP is now ball-count-proportional, see below)
// NJOX.BASE_HP = ...
// NJOX.HP_PER_LEVEL = ...

// ── Creature HP scaling ──────────────────────────────────────────────────────
// HP is always derived from current ball count, NOT fixed values.
// Formula: HP = ballCount × ratio, where ratio grows with level and round.
// This keeps difficulty proportional: more balls → bigger numbers, same FEEL.
//
// Ratio per phase:
//   Level 1 R1  : 0.60  → 4 balls → HP ≈ 2-3  (tutorial, very easy)
//   Level 1 R5  : 0.80  → 5 balls → HP ≈ 4    (end of first level)
//   Level 2 R5  : 1.00  → 7 balls → HP ≈ 7    (starting to feel)
//   Level 3 R5  : 1.20  → 9 balls → HP ≈ 11
//   Level 5 R5  : 1.60  → 12 balls→ HP ≈ 19
//   Level 10 R5 : 2.40  → 20 balls→ HP ≈ 48
NJOX.HP_BALL_RATIO_BASE  = 0.60; // ratio at level 1, round 1
NJOX.HP_BALL_RATIO_LEVEL = 0.20; // +this per level
NJOX.HP_BALL_RATIO_ROUND = 0.05; // +this per round within level
NJOX.HP_VARIANCE         = 0.30; // ±30% random spread

// Ball pickup inverse scaling — growth slows as you get more balls
// pickupChance = max(MIN, BASE - ballCount × DECAY)
NJOX.PICKUP_BALL_BASE  = 0.30; // 30% chance per new row at start
NJOX.PICKUP_BALL_DECAY = 0.005;// reduce by 0.5% per ball owned
NJOX.PICKUP_BALL_MIN   = 0.10; // never below 10%

// Creature types enum
NJOX.CREATURE_TYPES = {
    BASIC:          'basic',
    SPLITTER:       'splitter',
    EATER:          'eater',
    COUNTER:        'counter',
    REACTIVE:       'reactive',
    VAMPIRE:        'vampire',
    BALL_CARRIER:   'ball_carrier',
    VOMITER:        'vomiter',          // Sarı kusma — ölünce 2 canavar doğurur
    STRESS_SPREADER:'stress_spreader',  // Hastalıklı kafası yanan — her raund 1 canavarı strese sokar
    SHIELD:         'shield',           // Kalkan — sadece üstten vurulabilir
    CHAINED:        'chained',          // Zincirli — HP sıfırlanınca "kırık" mod, ikinci vuruşta ölür
};
