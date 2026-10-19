# gameslol

A small, clean arcade of browser games. No build step, no dependencies, no ads.

| Game | Category | Highlights |
| --- | --- | --- |
| **Snake** | Arcade | Smooth interpolated movement, buffered input, speeds up as you grow |
| **2048** | Puzzle | Animated slides and merges, undo (U / Ctrl+Z), keep playing after 2048 |
| **Blocks** | Puzzle | 7-bag randomiser, hold, ghost piece, 3-piece preview, wall kicks, lock delay, DAS |
| **Minesweeper** | Puzzle | Safe first click, chording, flags via right-click / long-press / flag mode, 3 difficulties |
| **Brick Breaker** | Arcade | Mouse, keyboard or touch paddle, angle control, multi-hit bricks, endless levels |
| **Tic-Tac-Toe** | Strategy | Minimax AI (Easy / Medium / Unbeatable) or 2 players |

Shared features: light/dark theme (follows your system, toggle in the top bar), best scores saved in
`localStorage`, keyboard shortcuts (`R` restart, `P` pause, `/` search), swipe and touch controls,
auto-pause when you switch tabs, and a responsive layout down to phone widths.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works.

## Deploy

It's a static site: enable **GitHub Pages** for the branch (root folder) and it's live.

## Structure

```
index.html          shell + script tags
css/style.css       design tokens, layout, per-game styles
js/core.js          registry, storage, canvas/input helpers
js/app.js           router, home grid, game page + API passed to each game
js/games/*.js       one file per game, each calls GL.register({...})
```

### Adding a game

Create `js/games/yourgame.js`, call `GL.register({ id, name, category, hue, tagline, howTo, controls, art, mount(api) })`,
and add a `<script>` tag in `index.html`. `mount` receives an `api` with `root`, `options`, `setScore`, `stat`,
`submit`, `best`, `overlay`, `hideOverlay` and `setPaused`, and returns `{ restart, destroy, togglePause?, pause? }`.
