(function () {
  'use strict';

  const W = 640;
  const H = 560;
  const PIX = 3;
  const COLS = 11;
  const ROWS = 5;
  const CELL_X = 44;
  const CELL_Y = 36;
  const PLAYER_Y = H - 56;
  const SHIELD_PIX = 3;

  const SPRITES = {
    a: [
      ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
      ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.'],
    ],
    b: [
      ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
      ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'],
    ],
    c: [
      ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '...XX..XX...', '..XX.XX.XX..', 'XX........XX'],
      ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '..XXX..XXX..', '.XX..XX..XX.', '..XX....XX..'],
    ],
  };
  // pre-compute pixel coordinates for each sprite frame
  const PIXELS = {};
  for (const [k, frames] of Object.entries(SPRITES)) {
    PIXELS[k] = frames.map((rows) => {
      const pts = [];
      rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && pts.push([x, y])));
      return { pts, w: rows[0].length * PIX, h: rows.length * PIX };
    });
  }
  const ROW_TYPES = ['a', 'b', 'b', 'c', 'c'];
  const ROW_POINTS = [30, 20, 20, 10, 10];
  const ROW_HUES = [330, 270, 270, 190, 190];
  const SHIELD_SHAPE = [
    '....XXXXXXXXXXXX....',
    '...XXXXXXXXXXXXXX...',
    '..XXXXXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXX',
    'XXXXXX........XXXXXX',
    'XXXXX..........XXXXX',
    'XXXX............XXXX',
  ];

  GL.register({
    id: 'invaders',
    name: 'Invaders',
    category: 'Arcade',
    hue: 280,
    tagline: 'Hold the line against the marching swarm.',
    howTo: 'Slide your cannon along the ground and shoot the invaders before they reach you. They speed up as their numbers fall. Hide behind the shields, and hit the saucer for bonus points.',
    controls: [
      ['← →', 'Move (or A D)'],
      ['Space', 'Fire'],
      ['Drag', 'Move + auto-fire on touch'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><path d="M62 14h6v4h-6zM92 14h6v4h-6zM68 18h24v4H68zM62 22h36v4H62zM56 26h12v4H56zM74 26h12v4H74zM92 26h12v4H92zM56 30h48v4H56zM56 34h6v6h-6zM98 34h6v6h-6zM68 34h24v4H68zM68 38h8v4h-8zM84 38h8v4h-8z"/><rect x="72" y="80" width="16" height="8" rx="2"/><rect x="77" y="74" width="6" height="8" rx="2"/><rect x="79" y="52" width="2" height="12" rx="1"/></g><g fill="#fff" opacity=".45"><rect x="24" y="70" width="22" height="12" rx="4"/><rect x="114" y="70" width="22" height="12" rx="4"/></g></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, 'wide', 640);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let aliens, ox, oy, dir, stepT, frame, player, shots, bombs, shields, ufo, ufoT, lives, wave, particles, keys, pointerX, firing, respawn, bombT;

      function buildWave() {
        aliens = [];
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) aliens.push({ r, c, alive: true });
        ox = 60;
        oy = 70 + Math.min(wave - 1, 5) * 16;
        dir = 1;
        stepT = 0;
        frame = 0;
        shots = [];
        bombs = [];
        bombT = 1.2;
        ufo = null;
        ufoT = 14 + Math.random() * 10;
      }

      function buildShields() {
        shields = [];
        const sw = SHIELD_SHAPE[0].length * SHIELD_PIX;
        const gap = (W - 4 * sw) / 5;
        for (let i = 0; i < 4; i++) {
          const sx = gap + i * (sw + gap);
          SHIELD_SHAPE.forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch === 'X') shields.push({ x: sx + x * SHIELD_PIX, y: PLAYER_Y - 70 + y * SHIELD_PIX, alive: true });
          }));
        }
      }

      const alienRect = (a) => {
        const sp = PIXELS[ROW_TYPES[a.r]][0];
        const cx = ox + a.c * CELL_X + CELL_X / 2;
        const cy = oy + a.r * CELL_Y;
        return { x: cx - sp.w / 2, y: cy, w: sp.w, h: sp.h };
      };

      function stats(animate) {
        api.stat('wave', 'Wave', wave, animate);
        api.stat('lives', 'Lives', '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives)), animate);
      }

      const game = GL.realtime(api, {
        ready: { kicker: 'Invaders', title: 'Defend the planet', text: 'Move with ← → or drag, fire with Space. On touch, holding down fires automatically.' },
        reset() {
          wave = 1;
          lives = 3;
          particles = [];
          keys = { left: false, right: false, fire: false };
          pointerX = null;
          firing = false;
          respawn = 0;
          player = { x: W / 2, cool: 0 };
          buildWave();
          buildShields();
          stats(false);
        },
        update(dt) {
          // player
          if (respawn > 0) respawn -= dt;
          if (keys.left) player.x -= 300 * dt;
          if (keys.right) player.x += 300 * dt;
          if (pointerX !== null) {
            const d = pointerX - player.x;
            player.x += Math.sign(d) * Math.min(Math.abs(d), 420 * dt);
          }
          player.x = Math.max(24, Math.min(W - 24, player.x));
          player.cool -= dt;
          if ((keys.fire || firing) && player.cool <= 0 && shots.length < 1 && respawn <= 0) {
            shots.push({ x: player.x, y: PLAYER_Y - 12 });
            player.cool = 0.25;
            GL.sound.tone(880, 50, 'square', 0.02);
          }

          // formation march
          const alive = aliens.filter((a) => a.alive);
          stepT -= dt;
          if (stepT <= 0) {
            stepT = 0.03 + (alive.length / (ROWS * COLS)) * 0.55 - Math.min(wave - 1, 6) * 0.02;
            frame ^= 1;
            let minX = Infinity, maxX = -Infinity;
            for (const a of alive) {
              const r = alienRect(a);
              minX = Math.min(minX, r.x);
              maxX = Math.max(maxX, r.x + r.w);
            }
            if ((dir > 0 && maxX + 8 > W - 12) || (dir < 0 && minX - 8 < 12)) {
              oy += 16;
              dir = -dir;
            } else {
              ox += 8 * dir;
            }
            GL.sound.tone(frame ? 110 : 98, 60, 'triangle', 0.03);
          }

          // alien bombs from the lowest alien of a random column
          bombT -= dt;
          if (bombT <= 0 && alive.length) {
            bombT = Math.max(0.25, 1.1 - wave * 0.08) * (0.5 + Math.random());
            const cols = [...new Set(alive.map((a) => a.c))];
            const col = cols[Math.floor(Math.random() * cols.length)];
            const shooter = alive.filter((a) => a.c === col).sort((a, b) => b.r - a.r)[0];
            const r = alienRect(shooter);
            bombs.push({ x: r.x + r.w / 2, y: r.y + r.h, t: 0 });
          }

          // ufo
          ufoT -= dt;
          if (!ufo && ufoT <= 0) {
            const fromLeft = Math.random() < 0.5;
            ufo = { x: fromLeft ? -40 : W + 40, v: fromLeft ? 110 : -110 };
          }
          if (ufo) {
            ufo.x += ufo.v * dt;
            if (ufo.x < -60 || ufo.x > W + 60) { ufo = null; ufoT = 18 + Math.random() * 12; }
          }

          // player shots
          for (const s of shots) {
            s.y -= 620 * dt;
            if (s.y < 0) s.dead = true;
            if (hitShield(s.x, s.y)) s.dead = true;
            for (const a of alive) {
              if (s.dead) break;
              const r = alienRect(a);
              if (s.x > r.x - 2 && s.x < r.x + r.w + 2 && s.y > r.y && s.y < r.y + r.h) {
                a.alive = false;
                s.dead = true;
                game.add(ROW_POINTS[a.r]);
                burst(r.x + r.w / 2, r.y + r.h / 2, `hsl(${ROW_HUES[a.r]} 85% 65%)`);
                GL.sound.tone(200, 90, 'sawtooth', 0.03);
              }
            }
            if (!s.dead && ufo && Math.abs(s.x - ufo.x) < 22 && s.y > 30 && s.y < 52) {
              const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
              game.add(pts);
              burst(ufo.x, 40, GL.colors().bad, 24);
              floater(ufo.x, 40, '+' + pts);
              ufo = null;
              ufoT = 18 + Math.random() * 12;
              s.dead = true;
            }
            for (const b of bombs) {
              if (!s.dead && Math.abs(b.x - s.x) < 5 && Math.abs(b.y - s.y) < 10) {
                b.dead = true;
                s.dead = true;
              }
            }
          }
          shots = shots.filter((s) => !s.dead);

          // bombs
          for (const b of bombs) {
            b.y += (230 + wave * 10) * dt;
            b.t += dt;
            if (b.y > H) b.dead = true;
            if (!b.dead && hitShield(b.x, b.y)) b.dead = true;
            if (!b.dead && respawn <= 0 && Math.abs(b.x - player.x) < 20 && b.y > PLAYER_Y - 8 && b.y < PLAYER_Y + 14) {
              b.dead = true;
              loseLife();
            }
          }
          bombs = bombs.filter((b) => !b.dead);

          // aliens eat shields / reach the ground
          for (const a of alive) {
            const r = alienRect(a);
            if (r.y + r.h > PLAYER_Y - 70) {
              for (const s of shields) if (s.alive && s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h) s.alive = false;
            }
            if (r.y + r.h >= PLAYER_Y - 4) {
              lives = 0;
              stats(true);
              burst(player.x, PLAYER_Y, GL.colors().accent, 30);
              game.gameOver(600);
              return;
            }
          }

          if (!alive.length) {
            wave++;
            game.add(100);
            stats(true);
            buildWave();
            if (wave % 3 === 1) buildShields();
          }

          updateParticles(dt);
        },
        draw() {
          const c = GL.colors();
          ctx.fillStyle = c.dark ? '#08080c' : '#101018';
          ctx.fillRect(0, 0, W, H);
          // stars
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 57) % (H - 80), 1.5, 1.5);

          for (const a of aliens) {
            if (!a.alive) continue;
            const sp = PIXELS[ROW_TYPES[a.r]][frame];
            const r = alienRect(a);
            ctx.fillStyle = `hsl(${ROW_HUES[a.r]} 85% 68%)`;
            for (const [px, py] of sp.pts) ctx.fillRect(r.x + px * PIX, r.y + py * PIX, PIX, PIX);
          }

          if (ufo) {
            ctx.fillStyle = '#ff6369';
            ctx.beginPath();
            ctx.ellipse(ufo.x, 44, 22, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(ufo.x, 38, 10, 8, 0, Math.PI, 0);
            ctx.fill();
          }

          ctx.fillStyle = '#4ade80';
          for (const s of shields) if (s.alive) ctx.fillRect(s.x, s.y, SHIELD_PIX, SHIELD_PIX);

          // player
          if (game.state !== 'over' && (respawn <= 0 || Math.floor(respawn * 10) % 2 === 0)) {
            ctx.fillStyle = '#e8e8f0';
            GL.roundRect(ctx, player.x - 20, PLAYER_Y, 40, 12, 3);
            ctx.fill();
            GL.roundRect(ctx, player.x - 4, PLAYER_Y - 9, 8, 12, 2);
            ctx.fill();
          }

          ctx.fillStyle = '#fff';
          for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 10, 3, 12);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          for (const b of bombs) {
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const y = b.y - 12 + i * 4;
              const x = b.x + (i % 2 ? 2 : -2) * Math.sin(b.t * 20);
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
          }

          ctx.fillStyle = '#4ade80';
          ctx.fillRect(0, PLAYER_Y + 24, W, 2);

          for (const p of particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            if (p.text) {
              ctx.fillStyle = '#fff';
              ctx.font = '700 16px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText(p.text, p.x, p.y);
            } else {
              ctx.fillStyle = p.color;
              ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
            }
          }
          ctx.globalAlpha = 1;
        },
      });

      function hitShield(x, y) {
        for (const s of shields) {
          if (s.alive && x >= s.x - 1 && x <= s.x + SHIELD_PIX + 1 && y >= s.y && y <= s.y + SHIELD_PIX + 6) {
            for (const o of shields) if (o.alive && Math.hypot(o.x - s.x, o.y - s.y) < 7 && Math.random() < 0.8) o.alive = false;
            s.alive = false;
            return true;
          }
        }
        return false;
      }

      function loseLife() {
        lives--;
        stats(true);
        burst(player.x, PLAYER_Y, '#e8e8f0', 30);
        GL.sound.tone(90, 400, 'sawtooth', 0.05);
        if (lives <= 0) return game.gameOver(700);
        respawn = 2;
        bombs = [];
      }

      function burst(x, y, color, n = 14) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 140;
          particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
        }
      }
      function floater(x, y, text) {
        particles.push({ x, y, vx: 0, vy: -30, life: 1.4, text });
      }
      function updateParticles(dt) {
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 1.5;
        }
        particles = particles.filter((p) => p.life > 0);
      }

      const offs = [
        GL.listen(window, 'keydown', (e) => {
          const d = GL.dirFromKey(e);
          if (d === 'left' || d === 'right') keys[d] = true;
          if (e.key === ' ') {
            e.preventDefault();
            if (game.state === 'ready') game.start();
            keys.fire = true;
          }
        }),
        GL.listen(window, 'keyup', (e) => {
          const d = GL.dirFromKey(e);
          if (d === 'left' || d === 'right') keys[d] = false;
          if (e.key === ' ') keys.fire = false;
        }),
        GL.listen(canvas, 'pointerdown', (e) => {
          if (game.state === 'ready') game.start();
          pointerX = GL.canvasPoint(canvas, W, H, e).x;
          firing = true;
        }),
        GL.listen(canvas, 'pointermove', (e) => {
          if (e.pointerType === 'mouse' || firing) pointerX = GL.canvasPoint(canvas, W, H, e).x;
        }),
        GL.listen(window, 'pointerup', () => { firing = false; }),
        GL.listen(canvas, 'pointerleave', () => { if (!firing) pointerX = null; }),
      ];

      game.reset();
      return game.instance(() => offs.forEach((off) => off()));
    },
  });
})();
