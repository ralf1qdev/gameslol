(function () {
  'use strict';

  const COLS = 32;
  const ROWS = 22;
  const CELL = 20;
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const STEP = 105;
  const TO_WIN = 3;
  const FOODS = 3;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const MODES = {
    easy: { label: 'Easy CPU', mistakes: 0.12, smart: false },
    hard: { label: 'Hard CPU', mistakes: 0, smart: true },
    pvp: { label: '2 players' },
  };

  GL.register({
    id: 'snakeduel',
    name: 'Snake Duel',
    category: 'Arcade',
    hue: 168,
    tagline: 'Two snakes, one arena. Cut them off before they cut you off.',
    howTo: 'Grow by eating, and make the other snake crash into a wall, itself, or you. Last snake moving wins the round; first to three rounds takes the match. Crashing head-on is a draw. Play the computer, or a friend on the same keyboard.',
    controls: [
      ['W A S D', 'Green snake'],
      ['↑ ↓ ← →', 'Pink snake (2 players) / green vs CPU'],
      ['Swipe', 'Steer on touch screens'],
      ['P', 'Pause'],
    ],
    pausable: true,
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M22 76H58V40h18" stroke="#fff"/><path d="M138 24h-36v40H86" stroke="#fff" opacity=".55"/><circle cx="80" cy="52" r="5" fill="#fff" stroke="none"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, 'wide', 760);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let mode = GL.store.get('duel:mode', 'hard');
      if (!MODES[mode]) mode = 'hard';
      api.options.append(GL.ui.segmented({
        label: 'Opponent',
        value: mode,
        options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
        onChange: (v) => { mode = v; GL.store.set('duel:mode', v); newMatch(); },
      }));

      const vsAI = () => mode !== 'pvp';
      let resumeTo = 'running';
      let snakes, foods, state, acc, countdown, wins, matchWins = GL.store.get('duel:wins', 0), banner, flashAt;

      function makeSnake(x, dir, hue) {
        const [dx] = DIRS[dir];
        const body = [];
        for (let k = 0; k < 4; k++) body.push({ x: x - dx * k, y: Math.floor(ROWS / 2) });
        return { body, prev: body.map((p) => ({ ...p })), dir, queue: [], hue, alive: true, grow: 0 };
      }

      function stats(anim) {
        api.stat('a', vsAI() ? 'You' : 'Green', wins[0], anim);
        api.stat('b', vsAI() ? 'Computer' : 'Pink', wins[1], anim);
        if (vsAI()) api.stat('m', 'Matches', matchWins, anim);
      }

      function newMatch() {
        wins = [0, 0];
        stats(false);
        api.hideOverlay();
        newRound();
      }

      function newRound() {
        snakes = [makeSnake(6, 'right', 152), makeSnake(COLS - 7, 'left', 330)];
        foods = [];
        while (foods.length < FOODS) addFood();
        acc = 0;
        countdown = 2400;
        banner = null;
        state = 'countdown';
        api.setPaused(false);
      }

      const occupied = (x, y) => snakes.some((s) => s.body.some((p) => p.x === x && p.y === y)) || foods.some((f) => f.x === x && f.y === y);
      function addFood() {
        for (let tries = 0; tries < 500; tries++) {
          const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
          if (!occupied(x, y)) return foods.push({ x, y });
        }
      }

      function steer(i, d) {
        const s = snakes[i];
        if (!s || !s.alive) return;
        const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
        if (d === last || d === OPP[last]) return;
        if (s.queue.length < 3) s.queue.push(d);
      }

      /* ---------- AI ---------- */
      function blockedGrid() {
        const g = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        for (const s of snakes) if (s.alive) s.body.forEach((p, k) => { if (k < s.body.length - 1 || s.grow) g[p.y][p.x] = true; });
        return g;
      }
      const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

      function floodSize(g, sx, sy, limit) {
        if (!inside(sx, sy) || g[sy][sx]) return 0;
        const seen = new Set([sy * COLS + sx]);
        const q = [[sx, sy]];
        while (q.length && seen.size < limit) {
          const [x, y] = q.shift();
          for (const [dx, dy] of Object.values(DIRS)) {
            const nx = x + dx, ny = y + dy, k = ny * COLS + nx;
            if (inside(nx, ny) && !g[ny][nx] && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
          }
        }
        return seen.size;
      }

      function bfsToFood(g, sx, sy) {
        const prev = new Map();
        const start = sy * COLS + sx;
        prev.set(start, null);
        const q = [[sx, sy]];
        while (q.length) {
          const [x, y] = q.shift();
          if (foods.some((f) => f.x === x && f.y === y) && !(x === sx && y === sy)) {
            let k = y * COLS + x;
            while (prev.get(k) !== start) k = prev.get(k);
            return k;
          }
          for (const [dx, dy] of Object.values(DIRS)) {
            const nx = x + dx, ny = y + dy, k = ny * COLS + nx;
            if (inside(nx, ny) && !g[ny][nx] && !prev.has(k)) { prev.set(k, y * COLS + x); q.push([nx, ny]); }
          }
        }
        return null;
      }

      function aiThink(s, rival) {
        const m = MODES[mode];
        const head = s.body[0];
        const g = blockedGrid();
        const options = Object.keys(DIRS).filter((d) => d !== OPP[s.dir]).map((d) => {
          const [dx, dy] = DIRS[d];
          const x = head.x + dx, y = head.y + dy;
          const safe = inside(x, y) && !g[y][x];
          const rh = rival.body[0];
          const nearRival = rival.alive && Math.abs(rh.x - x) + Math.abs(rh.y - y) <= 1;
          return { d, x, y, safe, nearRival, space: safe ? floodSize(g, x, y, s.body.length * 3) : 0 };
        });
        const safe = options.filter((o) => o.safe);
        if (!safe.length) return;
        if (Math.random() < m.mistakes) {
          s.queue = [safe[Math.floor(Math.random() * safe.length)].d];
          return;
        }
        let pool = safe;
        if (m.smart) {
          const roomy = safe.filter((o) => o.space >= s.body.length + 2 && !(o.nearRival && rival.body.length >= s.body.length));
          if (roomy.length) pool = roomy;
        }
        const step = bfsToFood(g, head.x, head.y);
        const toward = step !== null && pool.find((o) => o.y * COLS + o.x === step);
        const pick = toward || pool.slice().sort((a, b) => b.space - a.space)[0];
        s.queue = [pick.d];
      }

      /* ---------- tick ---------- */
      function tick() {
        if (vsAI()) aiThink(snakes[1], snakes[0]);
        const heads = snakes.map((s) => {
          if (s.queue.length) s.dir = s.queue.shift();
          const [dx, dy] = DIRS[s.dir];
          return { x: s.body[0].x + dx, y: s.body[0].y + dy };
        });
        const eats = heads.map((hd) => foods.findIndex((f) => f.x === hd.x && f.y === hd.y));
        const dead = [false, false];
        heads.forEach((hd, i) => {
          if (!inside(hd.x, hd.y)) dead[i] = true;
          snakes.forEach((s, j) => {
            const body = eats[j] >= 0 || s.grow ? s.body : s.body.slice(0, -1);
            if (body.some((p) => p.x === hd.x && p.y === hd.y)) dead[i] = true;
          });
        });
        if (heads[0].x === heads[1].x && heads[0].y === heads[1].y) dead[0] = dead[1] = true;

        snakes.forEach((s, i) => {
          s.prev = s.body.map((p) => ({ ...p }));
          if (dead[i]) return;
          s.body.unshift(heads[i]);
          if (eats[i] >= 0) {
            s.grow += 1;
            GL.sound.tone(i ? 620 : 760, 50, 'triangle', 0.03);
          }
          if (s.grow > 0) s.grow--;
          else s.body.pop();
        });
        eats.forEach((k, i) => { if (k >= 0 && !dead[i]) foods[k] = null; });
        foods = foods.filter(Boolean);
        while (foods.length < FOODS) addFood();

        if (dead[0] || dead[1]) {
          snakes.forEach((s, i) => { if (dead[i]) s.alive = false; });
          endRound(dead);
        }
      }

      function endRound(dead) {
        state = 'roundover';
        flashAt = performance.now();
        GL.sound.tone(120, 300, 'sawtooth', 0.05);
        let text;
        const n = vsAI() ? ['You', 'Computer'] : ['Green', 'Pink'];
        if (dead[0] && dead[1]) text = 'Both crashed — no point';
        else {
          const w = dead[0] ? 1 : 0;
          wins[w]++;
          text = vsAI() ? (w === 0 ? 'You take the round' : 'Computer takes the round') : `${n[w]} takes the round`;
        }
        stats(true);
        const champ = wins.findIndex((x) => x >= TO_WIN);
        if (champ >= 0) {
          if (vsAI() && champ === 0) {
            matchWins++;
            GL.store.set('duel:wins', matchWins);
            stats(true);
          }
          setTimeout(() => {
            state = 'over';
            api.overlay({
              kicker: vsAI() ? (champ === 0 ? 'Match won' : 'Match lost') : `${n[champ]} wins`,
              title: `${wins[0]} – ${wins[1]}`,
              text: vsAI() ? (champ === 0 ? `You beat the ${MODES[mode].label.toLowerCase()}.` : 'Go again?') : 'Rematch?',
              tone: vsAI() && champ !== 0 ? 'lose' : 'win',
              actions: [{ label: 'Rematch', primary: true, onClick: newMatch }],
            });
          }, 900);
        } else {
          banner = text;
          setTimeout(() => { if (state === 'roundover') newRound(); }, 1500);
        }
      }

      function togglePause() {
        if (state === 'running' || state === 'countdown') {
          resumeTo = state;
          state = 'paused';
          api.setPaused(true);
          api.overlay({ kicker: 'Paused', title: 'Paused', text: 'Press P or Resume to continue.', actions: [{ label: 'Resume', primary: true, onClick: togglePause }] });
        } else if (state === 'paused') {
          state = resumeTo;
          api.setPaused(false);
          api.hideOverlay();
        }
      }

      /* ---------- draw ---------- */
      function draw(now) {
        const c = GL.colors();
        ctx.fillStyle = c.board;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = c.boardAlt;
        for (let y = 0; y < ROWS; y++) for (let x = y % 2; x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

        const pulse = 1 + Math.sin(now / 160) * 0.1;
        ctx.fillStyle = c.warn;
        for (const f of foods) {
          ctx.beginPath();
          ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL * 0.3 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }

        const k = state === 'running' ? Math.min(acc / STEP, 1) : 1;
        snakes.forEach((s) => {
          const color = `hsl(${s.hue} ${c.dark ? '65% 55%' : '62% 46%'})`;
          const pts = s.body.map((p, i) => {
            const from = s.prev[i] || p;
            const kk = s.alive ? k : 1;
            return { x: (from.x + (p.x - from.x) * kk) * CELL + CELL / 2, y: (from.y + (p.y - from.y) * kk) * CELL + CELL / 2 };
          });
          ctx.globalAlpha = s.alive ? 1 : 0.5;
          ctx.strokeStyle = color;
          ctx.lineWidth = CELL * 0.68;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          const hd = pts[0];
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(hd.x, hd.y, CELL * 0.42, 0, Math.PI * 2);
          ctx.fill();
          const [lx, ly] = DIRS[s.dir];
          for (const sd of [-1, 1]) {
            const ex = hd.x + lx * 3 - ly * sd * 4, ey = hd.y + ly * 3 + lx * sd * 4;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(ex, ey, 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0b0b0f';
            ctx.beginPath();
            ctx.arc(ex + lx, ey + ly, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        });

        if (state === 'roundover' && flashAt) {
          const t = Math.max(0, 1 - (now - flashAt) / 400);
          if (t) {
            ctx.fillStyle = c.bad;
            ctx.globalAlpha = t * 0.2;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
          }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (state === 'countdown') {
          const n = Math.ceil(countdown / 800);
          ctx.font = '800 72px Inter, system-ui, sans-serif';
          ctx.fillStyle = c.text;
          ctx.globalAlpha = 0.85;
          ctx.fillText(n, W / 2, H / 2 - 20);
          ctx.globalAlpha = 1;
          GL.canvasHint(ctx, W, H / 2 + 50, vsAI() ? 'You are green — arrows or WASD' : 'Green: WASD · Pink: arrows');
        }
        if (state === 'roundover' && banner) GL.canvasHint(ctx, W, H / 2, banner);
      }

      let lastCount = 0;
      const stopLoop = GL.loop((dt, now) => {
        if (state === 'countdown') {
          countdown -= dt;
          const n = Math.ceil(countdown / 800);
          if (n !== lastCount && n > 0) GL.sound.tone(440, 80, 'sine', 0.04);
          lastCount = n;
          if (countdown <= 0) {
            state = 'running';
            GL.sound.tone(880, 120, 'sine', 0.05);
          }
        } else if (state === 'running') {
          acc += dt;
          while (acc >= STEP && state === 'running') {
            acc -= STEP;
            tick();
          }
        }
        draw(now);
      });

      const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const WASD = { w: 'up', s: 'down', a: 'left', d: 'right' };
      const offs = [
        GL.listen(window, 'keydown', (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const a = ARROWS[e.key], w = WASD[e.key.toLowerCase()];
          if (!a && !w) return;
          e.preventDefault();
          if (state !== 'running' && state !== 'countdown') return;
          if (vsAI()) steer(0, a || w);
          else if (w) steer(0, w);
          else steer(1, a);
        }),
      ];
      const unswipe = GL.swipe(api.root, (d) => {
        if (d !== 'tap' && (state === 'running' || state === 'countdown')) steer(0, d);
      });

      newMatch();
      return {
        restart: newMatch,
        togglePause,
        pause: () => (state === 'running' || state === 'countdown') && togglePause(),
        destroy() {
          stopLoop();
          unswipe();
          offs.forEach((off) => off());
        },
      };
    },
  });
})();
