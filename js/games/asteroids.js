(function () {
  'use strict';

  const W = 720;
  const H = 520;
  const SIZES = { 3: { r: 46, pts: 20 }, 2: { r: 26, pts: 50 }, 1: { r: 14, pts: 100 } };
  const TAU = Math.PI * 2;

  const wrap = (o) => {
    if (o.x < -30) o.x += W + 60;
    if (o.x > W + 30) o.x -= W + 60;
    if (o.y < -30) o.y += H + 60;
    if (o.y > H + 30) o.y -= H + 60;
  };

  GL.register({
    id: 'asteroids',
    name: 'Asteroids',
    category: 'Arcade',
    hue: 240,
    tagline: 'Drift, spin, shoot. Space is big and full of rocks.',
    howTo: 'Rotate and thrust your ship through an asteroid field. Big rocks split into smaller, faster ones when shot. The screen wraps around at the edges. Clear every rock to start the next wave.',
    controls: [
      ['← →', 'Rotate (or A D)'],
      ['↑', 'Thrust (or W)'],
      ['Space', 'Fire'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M70 64l10-30 10 30-10-6z" fill="#fff"/><path d="M26 22l14-6 12 6 2 12-10 10-14-2-6-10z" opacity=".8"/><path d="M114 58l10-4 9 5 1 9-8 6-10-2z" opacity=".8"/><path d="M118 16l6-2 5 3v6l-5 3-6-2z" opacity=".6"/><circle cx="80" cy="22" r="2" fill="#fff"/><circle cx="80" cy="12" r="2" fill="#fff" opacity=".6"/></svg>`,

    mount(api) {
      const { h } = GL;
      const { canvas, ctx } = GL.canvas(W, H, 'wide', 820);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      const keys = { left: false, right: false, thrust: false, fire: false };
      const hold = (key, label, title) => {
        const b = h('button', { type: 'button', class: 'pad-btn', 'aria-label': title }, label);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[key] = true; if (game.state === 'ready') game.start(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => { keys[key] = false; }));
        return b;
      };
      api.root.append(h('div', { class: 'touchpad touchpad-4' },
        hold('left', '⟲', 'Rotate left'), hold('thrust', '▲', 'Thrust'), hold('fire', '●', 'Fire'), hold('right', '⟳', 'Rotate right')));

      let ship, rocks, shots, particles, lives, wave, invuln, cool, stars;

      function newShip() {
        ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, dead: false };
        invuln = 2.2;
      }

      function makeRock(size, x, y) {
        const verts = Array.from({ length: 11 }, (_, i) => ({ a: (i / 11) * TAU, r: 0.72 + Math.random() * 0.36 }));
        const speed = (40 + Math.random() * 40) * (4 - size) * 0.6 + wave * 6;
        const a = Math.random() * TAU;
        return { size, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: 0, spin: (Math.random() - 0.5) * 1.4, verts };
      }

      function spawnWave() {
        rocks = [];
        const n = Math.min(3 + wave, 10);
        for (let i = 0; i < n; i++) {
          let x, y;
          do {
            x = Math.random() * W;
            y = Math.random() * H;
          } while (Math.hypot(x - ship.x, y - ship.y) < 170);
          rocks.push(makeRock(3, x, y));
        }
      }

      function stats(animate) {
        api.stat('wave', 'Wave', wave, animate);
        api.stat('lives', 'Lives', '▲'.repeat(Math.max(0, lives)) + '△'.repeat(Math.max(0, 3 - lives)), animate);
      }

      const game = GL.realtime(api, {
        ready: { kicker: 'Asteroids', title: 'Clear the field', text: 'Rotate with ← →, thrust with ↑, fire with Space.' },
        reset() {
          lives = 3;
          wave = 1;
          shots = [];
          particles = [];
          cool = 0;
          stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() }));
          Object.keys(keys).forEach((k) => { keys[k] = false; });
          newShip();
          spawnWave();
          stats(false);
        },
        update(dt) {
          if (!ship.dead) {
            if (keys.left) ship.a -= 4.6 * dt;
            if (keys.right) ship.a += 4.6 * dt;
            if (keys.thrust) {
              ship.vx += Math.cos(ship.a) * 340 * dt;
              ship.vy += Math.sin(ship.a) * 340 * dt;
              if (Math.random() < 0.6) {
                const back = ship.a + Math.PI + (Math.random() - 0.5) * 0.5;
                particles.push({ x: ship.x - Math.cos(ship.a) * 12, y: ship.y - Math.sin(ship.a) * 12, vx: Math.cos(back) * 160 + ship.vx, vy: Math.sin(back) * 160 + ship.vy, life: 0.35, color: '#fb923c' });
              }
            }
            const drag = Math.pow(0.55, dt);
            ship.vx *= drag;
            ship.vy *= drag;
            const sp = Math.hypot(ship.vx, ship.vy);
            if (sp > 420) { ship.vx *= 420 / sp; ship.vy *= 420 / sp; }
            ship.x += ship.vx * dt;
            ship.y += ship.vy * dt;
            wrap(ship);
            invuln -= dt;

            cool -= dt;
            if (keys.fire && cool <= 0 && shots.length < 6) {
              cool = 0.18;
              shots.push({ x: ship.x + Math.cos(ship.a) * 16, y: ship.y + Math.sin(ship.a) * 16, vx: Math.cos(ship.a) * 620 + ship.vx, vy: Math.sin(ship.a) * 620 + ship.vy, life: 0.95 });
              GL.sound.tone(760, 50, 'square', 0.02);
            }
          }

          for (const s of shots) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt;
            wrap(s);
          }
          for (const r of rocks) {
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.rot += r.spin * dt;
            wrap(r);
          }

          // shots vs rocks
          const born = [];
          for (const s of shots) {
            for (const r of rocks) {
              if (r.dead || s.life <= 0) continue;
              if (Math.hypot(s.x - r.x, s.y - r.y) < SIZES[r.size].r) {
                r.dead = true;
                s.life = 0;
                game.add(SIZES[r.size].pts);
                burst(r.x, r.y, 10 + r.size * 6, '#c4b5fd');
                GL.sound.tone(120 + r.size * 30, 120, 'sawtooth', 0.03);
                if (r.size > 1) born.push(makeRock(r.size - 1, r.x, r.y), makeRock(r.size - 1, r.x, r.y));
              }
            }
          }
          shots = shots.filter((s) => s.life > 0);
          rocks = rocks.filter((r) => !r.dead).concat(born);

          // ship vs rocks
          if (!ship.dead && invuln <= 0) {
            for (const r of rocks) {
              if (Math.hypot(ship.x - r.x, ship.y - r.y) < SIZES[r.size].r * 0.85 + 10) {
                ship.dead = true;
                lives--;
                stats(true);
                burst(ship.x, ship.y, 40, '#f2f2f6');
                GL.sound.tone(70, 500, 'sawtooth', 0.06);
                if (lives <= 0) game.gameOver(900);
                else setTimeout(() => { if (game.state !== 'over') newShip(); }, 1200);
                break;
              }
            }
          }

          if (!rocks.length) {
            wave++;
            stats(true);
            invuln = Math.max(invuln, 1.5);
            spawnWave();
          }

          for (const p of particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
          }
          particles = particles.filter((p) => p.life > 0);
        },
        draw(dt, now) {
          ctx.fillStyle = GL.colors().dark ? '#07070b' : '#0d0d16';
          ctx.fillRect(0, 0, W, H);
          for (const s of stars) {
            ctx.fillStyle = `rgba(255,255,255,${0.15 + s.s * 0.5})`;
            ctx.fillRect(s.x, s.y, 1 + s.s, 1 + s.s);
          }

          ctx.strokeStyle = '#c4b5fd';
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          for (const r of rocks) {
            const R = SIZES[r.size].r;
            ctx.beginPath();
            r.verts.forEach((v, i) => {
              const x = r.x + Math.cos(v.a + r.rot) * R * v.r;
              const y = r.y + Math.sin(v.a + r.rot) * R * v.r;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = 'rgba(196,181,253,.06)';
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = '#fff';
          for (const s of shots) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2.2, 0, TAU);
            ctx.fill();
          }

          for (const p of particles) {
            ctx.globalAlpha = Math.min(1, p.life * 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
          }
          ctx.globalAlpha = 1;

          if (!ship.dead && (invuln <= 0 || Math.floor(now / 100) % 2 === 0)) {
            ctx.save();
            ctx.translate(ship.x, ship.y);
            ctx.rotate(ship.a);
            ctx.strokeStyle = '#f2f2f6';
            ctx.fillStyle = 'rgba(242,242,246,.12)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(16, 0);
            ctx.lineTo(-11, -10);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-11, 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        },
      });

      function burst(x, y, n, color) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, s = 30 + Math.random() * 180;
          particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, color });
        }
      }

      const map = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'thrust', w: 'thrust', ' ': 'fire' };
      const offs = [
        GL.listen(window, 'keydown', (e) => {
          const k = map[e.key.toLowerCase()];
          if (!k || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          if (game.state === 'ready' && k === 'fire') game.start();
          keys[k] = true;
        }),
        GL.listen(window, 'keyup', (e) => {
          const k = map[e.key.toLowerCase()];
          if (k) keys[k] = false;
        }),
      ];

      game.reset();
      return game.instance(() => offs.forEach((off) => off()));
    },
  });
})();
