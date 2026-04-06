window.NJOX = window.NJOX || {};

// ─── World Map ─────────────────────────────────────────────────────────────
// Horizontal scrolling chapter select screen.
// Shows 3 full nodes + hint of a 4th at any scroll position.
// Nodes: defeated (green ✓) · current (red, pulsing) · locked (gray 🔒)
// Clicking a defeated node selects it; info panel shows replay option.
// Clicking a current node (or PLAY button) starts that chapter.

NJOX.WorldMap = (function () {

    // ── Layout constants ─────────────────────────────────────────────────
    const W        = NJOX.CANVAS_W;   // canvas width
    const MAP_Y    = 270;   // Y center of node row
    const NODE_R   = 36;    // node circle radius
    const NODE_GAP = 120;   // px between node centers
    const NODE_X0  = 80;    // x center of chapter 1 when scrollX=0
    const INFO_Y   = 440;   // top of info panel
    const INFO_H   = 210;   // height of info panel

    // ── State ────────────────────────────────────────────────────────────
    let _scrollX       = 0;
    let _targetScrollX = 0;
    let _selected      = 1;   // chapter index currently highlighted
    let _progress      = null;
    let _pulseT        = 0;   // for current-chapter pulse animation

    // Rendered button hit areas (computed each render)
    let _playBtn   = null;
    let _replayBtn = null;

    // Callbacks (set from main.js)
    let _onPlay        = null;
    let _onReplay      = null;
    let _onNewGame     = null;
    let _onSkillTree   = null;
    let _onDailyChallenge = null;

    // Button rects (computed each render)
    let _newGameBtn    = null;
    let _skillTreeBtn  = null;
    let _dailyBtn      = null;

    // ── Public API ───────────────────────────────────────────────────────

    function init(progress, onPlay, onReplay, onNewGame, onSkillTree, onDailyChallenge) {
        _progress          = progress;
        _onPlay            = onPlay;
        _onReplay          = onReplay;
        _onNewGame         = onNewGame;
        _onSkillTree       = onSkillTree       || null;
        _onDailyChallenge  = onDailyChallenge  || null;
        _selected  = progress.currentChapter;
        _pulseT    = 0;

        // Scroll so current chapter is roughly centered
        _targetScrollX = _nodeX(_selected) - W / 2;
        _targetScrollX = Math.max(0, _targetScrollX);
        _scrollX = _targetScrollX;
    }

    function update(dt, gold) {
        _pulseT += dt;
        // Smooth scroll lerp
        _scrollX += (_targetScrollX - _scrollX) * Math.min(1, dt * 12);
    }

    function handleClick(x, y, gold) {
        // New Game button
        if (_newGameBtn && _inRect(x, y, _newGameBtn)) {
            if (_onNewGame) _onNewGame();
            return;
        }

        // Skill Tree button
        if (_skillTreeBtn && _inRect(x, y, _skillTreeBtn)) {
            if (_onSkillTree) _onSkillTree();
            return;
        }

        // Daily Challenge button
        if (_dailyBtn && _inRect(x, y, _dailyBtn)) {
            if (_onDailyChallenge) _onDailyChallenge();
            return;
        }

        // Scroll arrow zones
        if (x < 28 && y >= MAP_Y - NODE_R * 2 && y <= MAP_Y + NODE_R * 2) {
            _scrollByStep(-1);
            return;
        }
        if (x > W - 28 && y >= MAP_Y - NODE_R * 2 && y <= MAP_Y + NODE_R * 2) {
            _scrollByStep(1);
            return;
        }

        // PLAY button
        if (_playBtn && _inRect(x, y, _playBtn)) {
            if (_onPlay) _onPlay(_selected);
            return;
        }

        // REPLAY button
        if (_replayBtn && _inRect(x, y, _replayBtn)) {
            if (_onReplay) _onReplay(_selected);
            return;
        }

        // Node tap — find which chapter was tapped
        const maxCh = _progress.totalUnlocked + 1;
        for (let n = 1; n <= maxCh + 1; n++) {
            const nx = _nodeScreenX(n);
            if (nx < -NODE_R * 2 || nx > W + NODE_R * 2) continue;
            const ch = _progress.getChapter(n);
            if (!ch || ch.status === 'locked') continue;

            if (Math.hypot(x - nx, y - MAP_Y) <= NODE_R + 10) {
                _selected = n;
                _targetScrollX = Math.max(0, _nodeX(n) - W / 2);
                return;
            }
        }
    }

    function render(ctx, progress, gold) {
        _progress  = progress;
        const H    = NJOX.CANVAS_H;
        const maxCh = progress.totalUnlocked + 1; // +1 = next locked chapter (teaser)

        _playBtn   = null;
        _replayBtn = null;

        // ── Background ──────────────────────────────────────────────────
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#07071a');
        bgGrad.addColorStop(0.55, '#0b1530');
        bgGrad.addColorStop(1, '#080e20');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle star field
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 50; i++) {
            const sx = (i * 179 + 7) % W;
            const sy = (i * 113 + 31) % (H - 100);
            const sr = i % 3 === 0 ? 1.2 : 0.7;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Header ──────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, 62);

        ctx.fillStyle = '#e94560';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STRESS MAP', W / 2, 31);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('💰 ' + gold + 'g', W - 12, 31);

        // New Game button (small, top-left)
        const ngW = 72, ngH = 20, ngX = 8, ngY = 8;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        NJOX.Utils.roundRect(ctx, ngX, ngY, ngW, ngH, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('↺ NEW GAME', ngX + 6, ngY + ngH / 2);
        _newGameBtn = { x: ngX, y: ngY, w: ngW, h: ngH };

        // Skill Tree button (bottom-left)
        {
            const stW = 110, stH = 28, stX = 12, stY = H - 44;
            ctx.fillStyle = 'rgba(78,204,163,0.14)';
            NJOX.Utils.roundRect(ctx, stX, stY, stW, stH, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(78,204,163,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#4ecca3';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚡ BECERİ AĞACI', stX + stW / 2, stY + stH / 2);
            _skillTreeBtn = { x: stX, y: stY, w: stW, h: stH };
        }

        // Daily Challenge button (bottom-right)
        {
            const isDailyAvail = progress.isDailyAvailable ? progress.isDailyAvailable() : true;
            const dlW = 130, dlH = 28, dlX = W - dlW - 12, dlY = H - 44;
            ctx.fillStyle = isDailyAvail ? 'rgba(255,215,0,0.14)' : 'rgba(255,255,255,0.05)';
            NJOX.Utils.roundRect(ctx, dlX, dlY, dlW, dlH, 6);
            ctx.fill();
            ctx.strokeStyle = isDailyAvail ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = isDailyAvail ? '#ffd700' : 'rgba(255,215,0,0.3)';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isDailyAvail ? '📅 GÜNLÜK GÖREV' : '✓ BUGÜN TAMAM', dlX + dlW / 2, dlY + dlH / 2);
            _dailyBtn = { x: dlX, y: dlY, w: dlW, h: dlH };
        }

        // ── Map scroll area (clipped) ───────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 62, W, INFO_Y - 62);
        ctx.clip();

        // Path line connecting nodes
        const lineStartX = _nodeScreenX(1);
        const lineEndX   = _nodeScreenX(maxCh);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth   = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(lineStartX, MAP_Y);
        ctx.lineTo(lineEndX, MAP_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Completed path segment (green tint up to current chapter)
        if (progress.totalUnlocked > 1) {
            const doneEndX = _nodeScreenX(progress.currentChapter);
            ctx.strokeStyle = 'rgba(78,204,163,0.25)';
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.moveTo(lineStartX, MAP_Y);
            ctx.lineTo(doneEndX, MAP_Y);
            ctx.stroke();
        }

        // Draw all nodes
        for (let n = 1; n <= maxCh + 1; n++) {
            const nx = _nodeScreenX(n);
            if (nx < -NODE_R * 3 || nx > W + NODE_R * 3) continue;
            const ch = progress.getChapter(n);
            if (!ch) continue;
            _drawNode(ctx, n, nx, MAP_Y, ch, n === _selected, gold);
        }

        ctx.restore();

        // ── Scroll arrows (outside clip) ───────────────────────────────
        const maxScroll = Math.max(0, _nodeX(maxCh) + NODE_R + 30 - W);
        if (_scrollX > 5) {
            _drawArrow(ctx, 14, MAP_Y, '‹');
        }
        if (_scrollX < maxScroll - 5) {
            _drawArrow(ctx, W - 14, MAP_Y, '›');
        }

        // ── Divider ─────────────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, INFO_Y - 1);
        ctx.lineTo(W - 16, INFO_Y - 1);
        ctx.stroke();

        // ── Info panel ──────────────────────────────────────────────────
        _drawInfoPanel(ctx, progress, gold);

        // ── Bottom hint ─────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('‹ › scroll  ·  tap chapter to select', W / 2, H - 10);
    }

    // ── Private helpers ─────────────────────────────────────────────────

    // World-space X of chapter n (before scroll)
    function _nodeX(n) {
        return NODE_X0 + (n - 1) * NODE_GAP;
    }

    // Screen-space X of chapter n (after scroll)
    function _nodeScreenX(n) {
        return _nodeX(n) - _scrollX;
    }

    function _scrollByStep(dir) {
        _targetScrollX += dir * NODE_GAP;
        const maxCh = _progress ? _progress.totalUnlocked + 1 : 5;
        const maxScroll = Math.max(0, _nodeX(maxCh) + NODE_R + 30 - W);
        _targetScrollX = Math.max(0, Math.min(maxScroll, _targetScrollX));
    }

    function _inRect(x, y, r) {
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    function _drawArrow(ctx, x, y, symbol) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, x, y);
        ctx.restore();
    }

    function _drawNode(ctx, n, x, y, ch, isSelected, gold) {
        const isDefeated = ch.status === 'defeated';
        const isCurrent  = ch.status === 'current';
        const isLocked   = ch.status === 'locked';

        // Pulse for current chapter
        const pulse = isCurrent ? 0.5 + 0.5 * Math.sin(_pulseT * 3.5) : 0;

        // Outer glow ring for selected
        if (isSelected && !isLocked) {
            ctx.save();
            const glowColor = isCurrent ? `rgba(233,69,96,${0.15 + pulse * 0.15})`
                            : isDefeated ? 'rgba(78,204,163,0.15)'
                            : 'rgba(255,255,255,0.05)';
            ctx.shadowColor = isCurrent ? '#e94560' : '#4ecca3';
            ctx.shadowBlur  = 28;
            ctx.beginPath();
            ctx.arc(x, y, NODE_R + 8 + pulse * 4, 0, Math.PI * 2);
            ctx.fillStyle = glowColor;
            ctx.fill();
            ctx.restore();
        }

        // Node circle fill + stroke
        ctx.beginPath();
        ctx.arc(x, y, NODE_R, 0, Math.PI * 2);

        if (isDefeated) {
            ctx.fillStyle   = '#0b2318';
            ctx.strokeStyle = isSelected ? '#4ecca3' : 'rgba(78,204,163,0.4)';
        } else if (isCurrent) {
            const r = Math.round(30 + pulse * 20);
            ctx.fillStyle   = `rgb(${r},10,18)`;
            ctx.strokeStyle = isSelected
                ? `rgba(233,69,96,${0.7 + pulse * 0.3})`
                : 'rgba(233,69,96,0.4)';
        } else {
            ctx.fillStyle   = '#0a0a1e';
            ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        }
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.fill();
        ctx.stroke();

        // Inner icon / text
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        if (isLocked) {
            ctx.font      = '20px monospace';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText('🔒', x, y);

        } else if (isDefeated) {
            ctx.font      = 'bold 12px monospace';
            ctx.fillStyle = '#4ecca3';
            ctx.fillText('✓', x, y - 7);
            ctx.font      = '10px monospace';
            ctx.fillStyle = 'rgba(78,204,163,0.65)';
            ctx.fillText('CH' + n, x, y + 8);

        } else {
            // Current: big chapter number
            ctx.font      = 'bold 22px monospace';
            ctx.fillStyle = `rgba(233,69,96,${0.8 + pulse * 0.2})`;
            ctx.fillText(n, x, y);
        }

        // Label below circle
        const labelY     = y + NODE_R + 10;
        ctx.textBaseline = 'top';
        ctx.font         = '9px monospace';

        if (isCurrent) {
            ctx.fillStyle = `rgba(233,69,96,${0.7 + pulse * 0.3})`;
            ctx.fillText('▶ PLAY', x, labelY);

        } else if (isDefeated) {
            // Boss name (capped at 9 chars)
            if (ch.boss && ch.boss.name) {
                const raw   = ch.boss.name;
                const label = raw.length > 9 ? raw.slice(0, 8) + '…' : raw;
                ctx.fillStyle = 'rgba(78,204,163,0.75)';
                ctx.fillText(label, x, labelY);
            }
            const cost      = NJOX.Progress.getReplayCost(n);
            const canAfford = gold >= cost;
            ctx.fillStyle   = canAfford ? 'rgba(255,215,0,0.7)' : 'rgba(255,215,0,0.28)';
            ctx.fillText('↺ ' + cost + 'g', x, labelY + 13);

        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText('locked', x, labelY);
        }
    }

    function _drawInfoPanel(ctx, progress, gold) {
        const ch = progress.getChapter(_selected);
        if (!ch) return;

        const panelX = 14;
        const panelW = W - 28;
        const panelY = INFO_Y + 6;

        // Panel background
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        NJOX.Utils.roundRect(ctx, panelX, panelY, panelW, INFO_H, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const cx = W / 2;
        let   y  = panelY + 20;

        // Chapter heading
        const headColor = ch.status === 'current'  ? '#e94560'
                        : ch.status === 'defeated' ? '#4ecca3'
                        : 'rgba(255,255,255,0.3)';
        ctx.fillStyle    = headColor;
        ctx.font         = 'bold 17px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('CHAPTER ' + _selected, cx, y);
        y += 28;

        // ── Current chapter ──────────────────────────────────────────────
        if (ch.status === 'current') {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font      = '11px monospace';
            ctx.fillText('5 rounds  ×  10 shots  →  boss fight', cx, y);
            y += 30;

            // BIG PLAY button
            const btnW = 180;
            const btnH = 46;
            const btnX = (W - btnW) / 2;
            ctx.fillStyle = '#e94560';
            NJOX.Utils.roundRect(ctx, btnX, y, btnW, btnH, 9);
            ctx.fill();

            ctx.fillStyle    = '#fff';
            ctx.font         = 'bold 16px monospace';
            ctx.textBaseline = 'middle';
            ctx.fillText('▶  PLAY', cx, y + btnH / 2);
            _playBtn = { x: btnX, y, w: btnW, h: btnH };

        // ── Defeated chapter ─────────────────────────────────────────────
        } else if (ch.status === 'defeated') {
            const bossName = ch.boss ? ch.boss.name : '???';
            ctx.fillStyle  = '#fff';
            ctx.font       = 'bold 13px monospace';
            ctx.textBaseline = 'top';
            ctx.fillText('"' + bossName + '"', cx, y);
            y += 22;

            const info = progress.getRewardInfo(_selected);
            ctx.fillStyle = 'rgba(255,215,0,0.65)';
            ctx.font      = '10px monospace';
            ctx.fillText(
                'Reward: ' + info.base + 'g base + up to ' + info.maxLoot + 'g loot',
                cx, y
            );
            y += 24;

            // REPLAY button
            const cost      = progress.getReplayCost(_selected);
            const canAfford = gold >= cost;
            const btnW      = 200;
            const btnH      = 40;
            const btnX      = (W - btnW) / 2;

            ctx.fillStyle = canAfford ? '#8b6914' : 'rgba(80,60,0,0.4)';
            NJOX.Utils.roundRect(ctx, btnX, y, btnW, btnH, 8);
            ctx.fill();

            ctx.fillStyle    = canAfford ? '#ffd700' : 'rgba(255,215,0,0.3)';
            ctx.font         = 'bold 13px monospace';
            ctx.textBaseline = 'middle';
            ctx.fillText('↺ REPLAY  –' + cost + 'g', cx, y + btnH / 2);

            if (canAfford) {
                _replayBtn = { x: btnX, y, w: btnW, h: btnH };
            } else {
                y += btnH + 8;
                ctx.fillStyle    = 'rgba(255,100,100,0.5)';
                ctx.font         = '10px monospace';
                ctx.textBaseline = 'top';
                ctx.fillText('Need ' + (cost - gold) + 'g more', cx, y);
            }

        // ── Locked chapter ───────────────────────────────────────────────
        } else {
            ctx.fillStyle    = 'rgba(255,255,255,0.3)';
            ctx.font         = '13px monospace';
            ctx.textBaseline = 'top';
            ctx.fillText('🔒  Complete Chapter ' + (_selected - 1), cx, y);
            y += 22;
            ctx.font      = '10px monospace';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText('to unlock this chapter', cx, y);
        }
    }

    // ── Exports ──────────────────────────────────────────────────────────
    return { init, update, handleClick, render };
})();
