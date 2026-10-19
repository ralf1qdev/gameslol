(function () {
  'use strict';

  const MAP = [
    '###################',
    '#........#........#',
    '#o##.###.#.###.##o#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.### # ###.####',
    '   #.#       #.#   ',
    '####.# ##-## #.####',
    '    .  #   #  .    ',
    '####.# ##### #.####',
    '   #.#       #.#   ',
    '####.# ##### #.####',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o.#...........#.o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '#.................#',
    '###################',
  ];
  const COLS = 19;
  const ROWS = 21;
  const T = 24;
  const W = COLS * T;
  const H = ROWS * T;
  const TUNNEL_Y = 9;
  const START = { x: 9, y: 15 };
  const EXIT = { x: 9, y: 7 };
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const ORDER = ['up', 'left', 'down', 'right'];
  const PHASES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, …
  const GHOSTS = [
    { name: 'blaze', color: '#ef4444', corner: [COLS - 2, -2], house: [9, 9], release: 0 },
    { name: 'pinky', color: '#f472b6', corner: [1, -2], house: [9, 9], release: 2.5 },
    { name: 'inky', color: '#22d3ee', corner: [COLS - 1, ROWS], house: [8, 9], release: 6 },
    { name: 'clyde', color: '#fb923c', corner: [0, ROWS], house: [10, 9], release: 9 },
  ];

  const wallAt = (x, y) => {
    if (y === TUNNEL_Y && (x < 0 || x >= COLS)) return false;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    const ch = MAP[y][x];
    return ch === '#' || ch === '-';
  };
  const open = (x, y, dir) => !wallAt(x + D[dir][0], y + D[dir][1]);
  const wrapX = (e) => {
    if (e.x < -1) e.x = COLS;
    if (e.x > COLS) e.x = -1;
  };

  GL.register({
    id: 'maze',
    name: 'Maze Chase',
    category: 'Arcade',
    hue: 50,
    tagline: 'Eat every dot. Four ghosts disagree.',
    howTo: 'Clear the maze of dots while four ghosts hunt you — each with its own personality. Grab a power pellet to turn the tables and eat them for big points. The side tunnel wraps around. Clear the maze to level up.',
    controls: [
      ['↑ ↓ ← →', 'Move (or W A S D)'],
      ['Swipe', 'Move on touch screens'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M50 50L74 36A28 28 0 1 0 74 64z" fill="#fff"/><g fill="#fff" opacity=".7"><circle cx="86" cy="50" r="3.5"/><circle cx="100" cy="50" r="3.5"/></g><path d="M112 66V48a12 12 0 0 1 24 0v18l-4-4-4 4-4-4-4 4-4-4z" fill="#fff" opacity=".9"/><circle cx="120" cy="48" r="3" fill="#1e3a8a"/><circle cx="129" cy="48" r="3" fill="#1e3a8a"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, '', 500);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let dots, player, ghosts, want, lives, level, clock, phase, phaseT, frightUntil, combo, dying, clearing, waka, popups, dotsLeft;

      function resetDots() {
        dots = MAP.map((row) => row.split('').map((ch) => (ch === '.' ? 1 : ch === 'o' ? 2 : 0)));
        dotsLeft = dots.flat().filter(Boolean).length;
      }

      function resetActors() {
        player = { x: START.x, y: START.y, dir: null, prog: 0, mouth: 0, face: 'left' };
        want = 'left';
        ghosts = GHOSTS.map((g) => ({
          ...g,
          mode: 'house',
          fx: g.house[0], fy: g.house[1],
          x: g.house[0], y: g.house[1], dir: 'left', prog: 0, fright: false,
          releaseAt: g.release * Math.max(0.4, 1 - (level - 1) * 0.15),
        }));
        clock = 0;
        phase = 0;
        phaseT = 0;
        frightUntil = 0;
        dying = 0;
      }

      function stats(anim) {
        api.stat('level', 'Level', level, anim);
        api.stat('lives', 'Lives', '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives)), anim);
      }

      const game = GL.realtime(api, {
        ready: { kicker: 'Maze Chase', title: 'Eat every dot', text: 'Arrow keys, WASD or swipe. Power pellets let you eat the ghosts.' },
        reset() {
          lives = 3;
          level = 1;
          popups = [];
          clearing = 0;
          waka = 0;
          resetDots();
          resetActors();
          stats(false);
        },
        update(dt) {
          for (const p of popups) p.t -= dt;
          popups = popups.filter((p) => p.t > 0);
          if (clearing) {
            clearing -= dt;
            if (clearing <= 0) {
              clearing = 0;
              level++;
              stats(true);
              resetDots();
              resetActors();
            }
            return;
          }
          if (dying) {
            dying -= dt;
            if (dying <= 0) {
              dying = 0;
              if (lives <= 0) return game.gameOver(200);
              resetActors();
            }
            return;
          }
          clock += dt;
          const frightened = clock < frightUntil;
          if (!frightened) {
            phaseT += dt;
            if (phaseT >= PHASES[phase]) {
              phaseT = 0;
              phase = Math.min(phase + 1, PHASES.length - 1);
              for (const g of ghosts) if (g.mode === 'active') g.dir = OPP[g.dir];
            }
            for (const g of ghosts) g.fright = false;
          }
          movePlayer(dt);
          for (const g of ghosts) moveGhost(g, dt, frightened);
          collide();
        },
        draw(dt, now) {
          drawMaze(now);
          drawDots(now);
          for (const g of ghosts) drawGhost(g, now);
          drawPlayer(now);
          ctx.font = '800 14px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const p of popups) {
            ctx.globalAlpha = Math.min(1, p.t * 2);
            ctx.fillStyle = '#22d3ee';
            ctx.fillText(p.text, p.x, p.y - (1 - p.t) * 14);
          }
          ctx.globalAlpha = 1;
          if (game.state === 'running' && clock < 1.2 && !dying && !clearing) {
            ctx.fillStyle = '#facc15';
            ctx.font = '800 18px Inter, system-ui, sans-serif';
            ctx.fillText(level > 1 && clock < 1.2 ? `LEVEL ${level}` : 'READY!', W / 2, 11 * T + T / 2);
          }
        },
      });

      /* ---------- movement ---------- */
      const speedFor = (base) => base * (1 + Math.min(level - 1, 6) * 0.05);

      function movePlayer(dt) {
        const p = player;
        if (p.dir && want === OPP[p.dir] && p.prog > 0) {
          const [dx, dy] = D[p.dir];
          p.x += dx;
          p.y += dy;
          wrapX(p);
          p.prog = 1 - p.prog;
          p.dir = want;
        }
        if (!p.dir || p.prog === 0) {
          if (want && open(p.x, p.y, want)) p.dir = want;
          else if (p.dir && !open(p.x, p.y, p.dir)) p.dir = null;
        }
        if (!p.dir) return;
        p.face = p.dir;
        p.mouth += dt * 14;
        p.prog += speedFor(7.2) * dt;
        while (p.prog >= 1) {
          p.prog -= 1;
          const [dx, dy] = D[p.dir];
          p.x += dx;
          p.y += dy;
          wrapX(p);
          eat(p.x, p.y);
          if (want && open(p.x, p.y, want)) p.dir = want;
          else if (!open(p.x, p.y, p.dir)) {
            p.dir = null;
            p.prog = 0;
            break;
          }
        }
      }

      function eat(x, y) {
        if (x < 0 || x >= COLS || !dots[y]) return;
        const d = dots[y][x];
        if (!d) return;
        dots[y][x] = 0;
        dotsLeft--;
        if (d === 1) {
          game.add(10);
          waka = (waka + 1) % 2;
          GL.sound.tone(waka ? 520 : 400, 40, 'triangle', 0.02);
        } else {
          game.add(50);
          frightUntil = clock + Math.max(2, 7 - (level - 1));
          combo = 0;
          for (const g of ghosts) if (g.mode === 'active') { g.fright = true; g.dir = OPP[g.dir]; }
          for (const g of ghosts) if (g.mode !== 'eaten') g.fright = true;
          GL.sound.tone(200, 200, 'sawtooth', 0.04);
        }
        if (dotsLeft === 0) {
          clearing = 2;
          game.add(500);
          GL.sound.tone(880, 150, 'triangle', 0.05);
        }
      }

      function target(g) {
        if (g.mode === 'eaten') return [EXIT.x, EXIT.y];
        if (PHASES[phase] !== Infinity && phase % 2 === 0) return g.corner;
        const p = player;
        const [fx, fy] = p.dir ? D[p.dir] : [0, 0];
        if (g.name === 'blaze') return [p.x, p.y];
        if (g.name === 'pinky') return [p.x + fx * 4, p.y + fy * 4];
        if (g.name === 'inky') {
          const b = ghosts[0];
          const ax = p.x + fx * 2, ay = p.y + fy * 2;
          return [ax * 2 - b.x, ay * 2 - b.y];
        }
        const dist = Math.hypot(g.x - p.x, g.y - p.y);
        return dist > 7 ? [p.x, p.y] : g.corner;
      }

      function chooseDir(g) {
        let opts = ORDER.filter((d) => d !== OPP[g.dir] && open(g.x, g.y, d));
        if (!opts.length) opts = [OPP[g.dir]];
        if (g.fright && g.mode === 'active') return opts[Math.floor(Math.random() * opts.length)];
        const [tx, ty] = target(g);
        let best = opts[0], bestD = Infinity;
        for (const d of opts) {
          const nx = g.x + D[d][0], ny = g.y + D[d][1];
          const dd = (nx - tx) ** 2 + (ny - ty) ** 2;
          if (dd < bestD) { bestD = dd; best = d; }
        }
        return best;
      }

      function moveGhost(g, dt, frightened) {
        if (g.mode === 'house') {
          g.fy = g.house[1] + Math.sin(clock * 6 + g.house[0]) * 0.25;
          if (clock >= g.releaseAt) g.mode = 'leaving';
          return;
        }
        if (g.mode === 'leaving' || g.mode === 'entering') {
          const goal = g.mode === 'leaving' ? EXIT : { x: 9, y: 9 };
          const sp = (g.mode === 'leaving' ? 3 : 8) * dt;
          if (Math.abs(g.fx - 9) > 0.01) g.fx += Math.sign(9 - g.fx) * Math.min(sp, Math.abs(9 - g.fx));
          else if (Math.abs(g.fy - goal.y) > 0.01) g.fy += Math.sign(goal.y - g.fy) * Math.min(sp, Math.abs(goal.y - g.fy));
          else if (g.mode === 'leaving') {
            Object.assign(g, { mode: 'active', x: EXIT.x, y: EXIT.y, prog: 0, dir: Math.random() < 0.5 ? 'left' : 'right' });
            g.fright = frightened && g.fright;
          } else {
            g.mode = 'leaving';
            g.fright = false;
          }
          return;
        }
        const inTunnel = g.y === TUNNEL_Y && (g.x < 3 || g.x > COLS - 4);
        const base = g.mode === 'eaten' ? 15 : g.fright ? 4.2 : inTunnel ? 4 : speedFor(6.6);
        g.prog += base * dt;
        while (g.prog >= 1) {
          g.prog -= 1;
          g.x += D[g.dir][0];
          g.y += D[g.dir][1];
          wrapX(g);
          if (g.mode === 'eaten' && g.x === EXIT.x && g.y === EXIT.y) {
            Object.assign(g, { mode: 'entering', fx: EXIT.x, fy: EXIT.y, prog: 0 });
            return;
          }
          g.dir = chooseDir(g);
        }
      }

      const posOf = (e) => (e.mode === 'house' || e.mode === 'leaving' || e.mode === 'entering')
        ? { x: e.fx, y: e.fy }
        : { x: e.x + (e.dir ? D[e.dir][0] * e.prog : 0), y: e.y + (e.dir ? D[e.dir][1] * e.prog : 0) };

      function collide() {
        const p = posOf(player);
        for (const g of ghosts) {
          if (g.mode !== 'active') continue;
          const q = posOf(g);
          if (Math.hypot(p.x - q.x, p.y - q.y) > 0.6) continue;
          if (g.fright) {
            const pts = 200 * 2 ** combo;
            combo = Math.min(combo + 1, 3);
            game.add(pts);
            popups.push({ x: q.x * T + T / 2, y: q.y * T + T / 2, text: pts, t: 1 });
            g.mode = 'eaten';
            g.fright = false;
            GL.sound.tone(990, 120, 'square', 0.04);
          } else {
            lives--;
            stats(true);
            dying = 1.6;
            GL.sound.tone(300, 900, 'sawtooth', 0.05);
            return;
          }
        }
      }

      /* ---------- drawing ---------- */
      function drawMaze(now) {
        const c = GL.colors();
        ctx.fillStyle = c.dark ? '#07070c' : '#0c0c18';
        ctx.fillRect(0, 0, W, H);
        const flash = clearing && Math.floor(now / 200) % 2 === 0;
        ctx.fillStyle = flash ? '#fff' : '#4f46e5';
        const isWall = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && MAP[y][x] === '#';
        const inset = 5;
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            if (!isWall(x, y)) continue;
            const px = x * T, py = y * T;
            GL.roundRect(ctx, px + inset, py + inset, T - inset * 2, T - inset * 2, 5);
            ctx.fill();
            if (isWall(x + 1, y)) ctx.fillRect(px + T / 2, py + inset, T, T - inset * 2);
            if (isWall(x, y + 1)) ctx.fillRect(px + inset, py + T / 2, T - inset * 2, T);
          }
        // ghost door
        ctx.fillStyle = '#f9a8d4';
        ctx.fillRect(9 * T + 2, 8 * T + T / 2 - 2, T - 4, 4);
      }

      function drawDots(now) {
        ctx.fillStyle = '#fde68a';
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            const d = dots[y][x];
            if (!d) continue;
            ctx.beginPath();
            const r = d === 1 ? 2.6 : 6 + Math.sin(now / 150) * 1.5;
            ctx.arc(x * T + T / 2, y * T + T / 2, r, 0, Math.PI * 2);
            ctx.fill();
          }
      }

      function drawPlayer(now) {
        const p = posOf(player);
        const cx = p.x * T + T / 2, cy = p.y * T + T / 2;
        let r = T * 0.46;
        let mouth = 0.08 + Math.abs(Math.sin(player.mouth)) * 0.32;
        if (dying) {
          const t = 1 - dying / 1.6;
          mouth = Math.min(0.99, 0.2 + t * 1.1);
        }
        const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[player.face];
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, rot + mouth * Math.PI, rot - mouth * Math.PI + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }

      function drawGhost(g, now) {
        if (dying && dying < 1.2) return;
        const p = posOf(g);
        const cx = p.x * T + T / 2, cy = p.y * T + T / 2;
        const r = T * 0.45;
        const ending = g.fright && frightUntil - clock < 2 && Math.floor(now / 200) % 2 === 0;
        if (g.mode !== 'eaten' && g.mode !== 'entering') {
          ctx.fillStyle = g.fright ? (ending ? '#f1f5f9' : '#2563eb') : g.color;
          ctx.beginPath();
          ctx.arc(cx, cy - 2, r, Math.PI, 0);
          ctx.lineTo(cx + r, cy + r);
          const waves = 4, wob = Math.floor(now / 140) % 2;
          for (let k = waves; k >= 0; k--) {
            const x = cx - r + (2 * r * k) / waves;
            ctx.lineTo(x, cy + r - ((k + wob) % 2 ? 4 : 0));
          }
          ctx.closePath();
          ctx.fill();
        }
        if (g.fright && g.mode === 'active') {
          ctx.fillStyle = ending ? '#ef4444' : '#fde68a';
          ctx.fillRect(cx - 5, cy - 4, 3, 3);
          ctx.fillRect(cx + 2, cy - 4, 3, 3);
          return;
        }
        const [lx, ly] = g.dir ? D[g.dir] : [0, 0];
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(cx + s * 4.5, cy - 4, 3.6, 4.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1e3a8a';
          ctx.beginPath();
          ctx.arc(cx + s * 4.5 + lx * 1.8, cy - 4 + ly * 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* ---------- input ---------- */
      const offs = [
        GL.listen(window, 'keydown', (e) => {
          const d = GL.dirFromKey(e);
          if (!d) return;
          e.preventDefault();
          want = d;
          if (game.state === 'ready') game.start();
        }),
      ];
      const unswipe = GL.swipe(api.root, (d) => {
        if (d === 'tap') return game.state === 'ready' && game.start();
        want = d;
        if (game.state === 'ready') game.start();
      });

      game.reset();
      return game.instance(() => {
        offs.forEach((off) => off());
        unswipe();
      });
    },
  });
})();
