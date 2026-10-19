(function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const HIDDEN = 2; // spawn rows above the visible field
  const CELL = 28;
  const MINI = 18;
  const LOCK_MS = 500;
  const MAX_LOCK_RESETS = 15;
  const DAS_MS = 150;
  const ARR_MS = 38;
  const CLEAR_MS = 220;
  const LINE_POINTS = [0, 100, 300, 500, 800];

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  };
  const COLORS = { I: '#22d3ee', J: '#60a5fa', L: '#fb923c', O: '#facc15', S: '#4ade80', T: '#a78bfa', Z: '#f87171' };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];

  const rotateCW = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
  const rotateCCW = (m) => m[0].map((_, i) => m.map((row) => row[row.length - 1 - i]));
  const gravityMs = (level) => 1000 * Math.pow(Math.max(0.8 - (level - 1) * 0.007, 0.05), level - 1);

  function drawBlock(ctx, x, y, s, color, ghost) {
    const pad = s * 0.06;
    const r = s * 0.2;
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      GL.roundRect(ctx, x + pad + 1, y + pad + 1, s - pad * 2 - 2, s - pad * 2 - 2, r);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = color;
    GL.roundRect(ctx, x + pad, y + pad, s - pad * 2, s - pad * 2, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    GL.roundRect(ctx, x + pad * 2.5, y + pad * 2.5, s - pad * 5, (s - pad * 5) * 0.34, r * 0.6);
    ctx.fill();
  }

  GL.register({
    id: 'blocks',
    name: 'Blocks',
    category: 'Puzzle',
    hue: 200,
    tagline: 'Falling pieces, clean lines, rising speed.',
    howTo: 'Move and rotate the falling pieces to complete full horizontal lines. Clearing several lines at once scores far more. Every 10 lines the level — and the speed — goes up.',
    controls: [
      ['← →', 'Move'],
      ['↑ X', 'Rotate clockwise'],
      ['Z', 'Rotate counter-clockwise'],
      ['↓', 'Soft drop'],
      ['Space', 'Hard drop'],
      ['C Shift', 'Hold piece'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><rect x="44" y="58" width="18" height="18" rx="4"/><rect x="62" y="58" width="18" height="18" rx="4"/><rect x="80" y="58" width="18" height="18" rx="4"/><rect x="80" y="40" width="18" height="18" rx="4"/><rect x="98" y="58" width="18" height="18" rx="4" opacity=".5"/><rect x="98" y="76" width="18" height="18" rx="4" opacity=".5"/><rect x="80" y="76" width="18" height="18" rx="4" opacity=".5"/><rect x="62" y="76" width="18" height="18" rx="4" opacity=".5"/><rect x="62" y="8" width="18" height="18" rx="4" opacity=".8"/><rect x="62" y="26" width="18" height="18" rx="4" opacity=".8"/><rect x="80" y="8" width="18" height="18" rx="4" opacity=".8"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      const W = COLS * CELL;
      const H = ROWS * CELL;
      const main = GL.canvas(W, H, 'tall');
      const holdC = GL.canvas(MINI * 4.4, MINI * 3.2, 'mini-canvas');
      const nextC = GL.canvas(MINI * 4.4, MINI * 3.2 * 3, 'mini-canvas');

      const touchBtn = (label, title, down, up) => {
        const b = h('button', { type: 'button', class: 'pad-btn', 'aria-label': title, html: label });
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
        if (up) ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, up));
        return b;
      };

      api.root.append(
        h('div', { class: 'blocks' },
          h('div', { class: 'blocks-side' }, h('span', { class: 'mini-label' }, 'Hold'), h('div', { class: 'mini' }, holdC.canvas)),
          h('div', { class: 'blocks-board' }, main.canvas),
          h('div', { class: 'blocks-side' }, h('span', { class: 'mini-label' }, 'Next'), h('div', { class: 'mini' }, nextC.canvas))),
        h('div', { class: 'touchpad' },
          touchBtn('◀', 'Move left', () => pressH(-1), () => releaseH(-1)),
          touchBtn('▶', 'Move right', () => pressH(1), () => releaseH(1)),
          touchBtn('⟳', 'Rotate', () => act(() => rotate(1))),
          touchBtn('▼', 'Soft drop', () => { softDrop = true; }, () => { softDrop = false; }),
          touchBtn('⤓', 'Hard drop', () => act(hardDrop)),
          touchBtn('Hold', 'Hold piece', () => act(hold))));

      let grid, piece, queue, bag, held, canHold, score, lines, level, state, startBest;
      let dropTimer, lockTimer, lockResets, lowestY, softDrop, clearing, das, trail;

      function reset() {
        grid = Array.from({ length: ROWS + HIDDEN }, () => Array(COLS).fill(null));
        bag = [];
        queue = [];
        held = null;
        canHold = true;
        score = 0;
        lines = 0;
        level = 1;
        softDrop = false;
        clearing = null;
        das = null;
        trail = null;
        startBest = api.best() || 0;
        fillQueue();
        spawn();
        state = 'ready';
        api.setScore(0, false);
        api.stat('level', 'Level', 1, false);
        api.stat('lines', 'Lines', 0, false);
        api.setPaused(false);
        api.overlay({
          kicker: 'Blocks',
          title: 'Ready when you are',
          text: 'Press Space or Start. Clear lines, don’t reach the top.',
          actions: [{ label: 'Start', primary: true, onClick: start }],
        });
      }

      function fillQueue() {
        while (queue.length < 4) {
          if (!bag.length) {
            bag = Object.keys(SHAPES);
            for (let i = bag.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [bag[i], bag[j]] = [bag[j], bag[i]];
            }
          }
          queue.push(bag.pop());
        }
      }

      function makePiece(type) {
        const m = SHAPES[type].map((row) => row.slice());
        const firstRow = m.findIndex((row) => row.some(Boolean));
        return { type, m, x: Math.floor((COLS - m[0].length) / 2), y: HIDDEN - firstRow };
      }

      function spawn(type) {
        if (!type) {
          type = queue.shift();
          fillQueue();
        }
        piece = makePiece(type);
        dropTimer = 0;
        lockTimer = 0;
        lockResets = 0;
        lowestY = piece.y;
        if (collides(piece.m, piece.x, piece.y)) gameOver();
      }

      function collides(m, x, y) {
        for (let r = 0; r < m.length; r++)
          for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            const gx = x + c, gy = y + r;
            if (gx < 0 || gx >= COLS || gy >= ROWS + HIDDEN) return true;
            if (gy >= 0 && grid[gy][gx]) return true;
          }
        return false;
      }

      const grounded = () => collides(piece.m, piece.x, piece.y + 1);

      function touchLock() {
        if (grounded() && lockResets < MAX_LOCK_RESETS) {
          lockTimer = 0;
          lockResets++;
        }
      }

      function tryMove(dx, dy) {
        if (collides(piece.m, piece.x + dx, piece.y + dy)) return false;
        piece.x += dx;
        piece.y += dy;
        if (piece.y > lowestY) {
          lowestY = piece.y;
          lockResets = 0;
        }
        if (dx) touchLock();
        return true;
      }

      function rotate(dir) {
        if (piece.type === 'O') return;
        const m = dir > 0 ? rotateCW(piece.m) : rotateCCW(piece.m);
        const kicks = piece.type === 'I' ? KICKS.concat([[0, -2], [0, 1]]) : KICKS;
        for (const [kx, ky] of kicks) {
          if (!collides(m, piece.x + kx, piece.y + ky)) {
            piece.m = m;
            piece.x += kx;
            piece.y += ky;
            touchLock();
            return;
          }
        }
      }

      function ghostY() {
        let y = piece.y;
        while (!collides(piece.m, piece.x, y + 1)) y++;
        return y;
      }

      function hardDrop() {
        const y = ghostY();
        const dist = y - piece.y;
        trail = { x: piece.x, w: piece.m[0].length, from: piece.y, to: y, m: piece.m, color: COLORS[piece.type], t: 0 };
        piece.y = y;
        score += dist * 2;
        lock();
      }

      function hold() {
        if (!canHold) return;
        const type = piece.type;
        if (held) spawn(held);
        else spawn();
        held = type;
        canHold = false;
      }

      function lock() {
        let above = true;
        piece.m.forEach((row, r) => row.forEach((v, c) => {
          if (!v) return;
          const gy = piece.y + r;
          if (gy >= HIDDEN) above = false;
          if (gy >= 0) grid[gy][piece.x + c] = piece.type;
        }));
        canHold = true;
        if (above) return gameOver();

        const full = [];
        for (let y = 0; y < ROWS + HIDDEN; y++) if (grid[y].every(Boolean)) full.push(y);
        if (full.length) {
          score += LINE_POINTS[full.length] * level;
          clearing = { rows: full, t: 0 };
          piece = null;
        } else {
          spawn();
        }
        updateStats();
      }

      function finishClear() {
        for (const y of clearing.rows) {
          grid.splice(y, 1);
          grid.unshift(Array(COLS).fill(null));
        }
        lines += clearing.rows.length;
        level = Math.floor(lines / 10) + 1;
        clearing = null;
        updateStats();
        spawn();
      }

      function updateStats() {
        api.setScore(score);
        api.submit(score);
        api.stat('level', 'Level', level);
        api.stat('lines', 'Lines', lines);
      }

      function gameOver() {
        state = 'over';
        const record = score > startBest;
        api.overlay({
          kicker: record ? 'New personal best' : 'Topped out',
          title: score.toLocaleString() + ' points',
          text: `${lines} ${lines === 1 ? 'line' : 'lines'} cleared · reached level ${level}.`,
          tone: record ? 'win' : 'lose',
          actions: [{ label: 'Play again', primary: true, onClick: () => { reset(); start(); } }],
        });
      }

      function start() {
        if (state !== 'ready' && state !== 'paused') return;
        state = 'running';
        api.hideOverlay();
        api.setPaused(false);
      }

      function togglePause() {
        if (state === 'running') {
          state = 'paused';
          das = null;
          softDrop = false;
          api.setPaused(true);
          api.overlay({
            kicker: 'Paused',
            title: 'Paused',
            text: 'Press P or Resume to continue.',
            actions: [{ label: 'Resume', primary: true, onClick: start }],
          });
        } else {
          start();
        }
      }

      // Run an action only while a piece is in play.
      function act(fn) {
        if (state === 'ready') return start();
        if (state === 'running' && piece && !clearing) fn();
      }

      function pressH(dir) {
        act(() => tryMove(dir, 0));
        das = { dir, t: 0, arr: 0 };
      }
      function releaseH(dir) {
        if (das && das.dir === dir) das = null;
      }

      function update(dt) {
        if (trail) trail.t += dt;
        if (state !== 'running') return;
        if (clearing) {
          clearing.t += dt;
          if (clearing.t >= CLEAR_MS) finishClear();
          return;
        }
        if (!piece) return;

        if (das) {
          das.t += dt;
          if (das.t > DAS_MS) {
            das.arr += dt;
            while (das.arr >= ARR_MS) {
              das.arr -= ARR_MS;
              if (!tryMove(das.dir, 0)) break;
            }
          }
        }

        const interval = softDrop ? Math.min(gravityMs(level), 32) : gravityMs(level);
        dropTimer += dt;
        while (dropTimer >= interval) {
          dropTimer -= interval;
          if (tryMove(0, 1)) {
            if (softDrop) score += 1;
          } else {
            dropTimer = 0;
            break;
          }
        }
        if (softDrop) api.setScore(score, false);

        if (grounded()) {
          lockTimer += dt;
          if (lockTimer >= LOCK_MS) lock();
        } else {
          lockTimer = 0;
        }
      }

      function draw() {
        const c = GL.colors();
        const ctx = main.ctx;
        ctx.fillStyle = c.board;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = c.dark ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.045)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
        for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
        ctx.stroke();

        for (let y = HIDDEN; y < ROWS + HIDDEN; y++)
          for (let x = 0; x < COLS; x++)
            if (grid[y][x]) drawBlock(ctx, x * CELL, (y - HIDDEN) * CELL, CELL, COLORS[grid[y][x]]);

        if (clearing) {
          const t = clearing.t / CLEAR_MS;
          ctx.fillStyle = '#fff';
          for (const y of clearing.rows) {
            ctx.globalAlpha = 0.85 * (1 - t);
            const inset = (W / 2) * t;
            ctx.fillRect(inset, (y - HIDDEN) * CELL, W - inset * 2, CELL);
          }
          ctx.globalAlpha = 1;
        }

        if (trail && trail.t < 160) {
          const a = 1 - trail.t / 160;
          const g = ctx.createLinearGradient(0, (trail.from - HIDDEN) * CELL, 0, (trail.to - HIDDEN) * CELL);
          g.addColorStop(0, 'transparent');
          g.addColorStop(1, trail.color);
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = g;
          const cols = new Set();
          trail.m.forEach((row) => row.forEach((v, cc) => v && cols.add(cc)));
          for (const cc of cols)
            ctx.fillRect((trail.x + cc) * CELL + 4, (trail.from - HIDDEN) * CELL, CELL - 8, (trail.to - trail.from + 1) * CELL);
          ctx.globalAlpha = 1;
        }

        if (piece && state !== 'over') {
          const gy = ghostY();
          const color = COLORS[piece.type];
          piece.m.forEach((row, r) => row.forEach((v, cc) => {
            if (!v) return;
            const x = (piece.x + cc) * CELL;
            if (gy !== piece.y) drawBlock(ctx, x, (gy + r - HIDDEN) * CELL, CELL, color, true);
            if (piece.y + r >= HIDDEN) drawBlock(ctx, x, (piece.y + r - HIDDEN) * CELL, CELL, color);
          }));
        }

        drawMini(holdC, held ? [held] : [], c, !canHold);
        drawMini(nextC, queue.slice(0, 3), c, false);
      }

      function drawMini(target, types, c, dim) {
        const { ctx, w, h: ht } = target;
        ctx.clearRect(0, 0, w, ht);
        const slot = MINI * 3.2;
        types.forEach((type, i) => {
          const m = SHAPES[type];
          const rows = m.filter((row) => row.some(Boolean));
          const minC = Math.min(...m.map((row) => row.indexOf(1)).filter((v) => v >= 0));
          const maxC = Math.max(...m.map((row) => row.lastIndexOf(1)));
          const bw = (maxC - minC + 1) * MINI, bh = rows.length * MINI;
          const ox = (w - bw) / 2, oy = i * slot + (slot - bh) / 2;
          ctx.globalAlpha = dim ? 0.35 : i === 0 ? 1 : 0.7;
          rows.forEach((row, r) => row.forEach((v, cc) => {
            if (v) drawBlock(ctx, ox + (cc - minC) * MINI, oy + r * MINI, MINI, COLORS[type]);
          }));
          ctx.globalAlpha = 1;
        });
      }

      const stopLoop = GL.loop((dt) => {
        update(dt);
        draw();
      });

      function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        const handled = ['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'x', 'z', 'c', 'shift', 'a', 'd', 's', 'w'];
        if (!handled.includes(k)) return;
        e.preventDefault();
        if (k === ' ' && !e.repeat) {
          if (state === 'ready') return start();
          if (state === 'over') return;
          return act(hardDrop);
        }
        if (e.repeat) return;
        if (k === 'arrowleft' || k === 'a') pressH(-1);
        else if (k === 'arrowright' || k === 'd') pressH(1);
        else if (k === 'arrowdown' || k === 's') { if (state === 'running') softDrop = true; }
        else if (k === 'arrowup' || k === 'x' || k === 'w') act(() => rotate(1));
        else if (k === 'z') act(() => rotate(-1));
        else if (k === 'c' || k === 'shift') act(hold);
      }
      function onKeyUp(e) {
        const k = e.key.toLowerCase();
        if (k === 'arrowleft' || k === 'a') releaseH(-1);
        else if (k === 'arrowright' || k === 'd') releaseH(1);
        else if (k === 'arrowdown' || k === 's') softDrop = false;
      }
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKeyUp);

      reset();

      return {
        restart: reset,
        togglePause,
        pause: () => state === 'running' && togglePause(),
        destroy() {
          stopLoop();
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('keyup', onKeyUp);
        },
      };
    },
  });
})();
