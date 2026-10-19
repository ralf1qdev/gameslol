# gameslol

A small, clean arcade of 25 browser games. No build step, no dependencies, no ads.

| Game | Category | Highlights |
| --- | --- | --- |
| **Snake** | Arcade | Smooth interpolated movement, buffered input, speeds up as you grow |
| **2048** | Puzzle | Animated slides and merges, undo (U / Ctrl+Z), keep playing after 2048 |
| **Blocks** | Puzzle | 7-bag randomiser, hold, ghost piece, 3-piece preview, wall kicks, lock delay, DAS |
| **Minesweeper** | Puzzle | Safe first click, chording, flags via right-click / long-press / flag mode, 3 difficulties |
| **Brick Breaker** | Arcade | Mouse, keyboard or touch paddle, angle control, multi-hit bricks, endless levels |
| **Tic-Tac-Toe** | Strategy | Minimax AI (Easy / Medium / Unbeatable) or 2 players |
| **Flap** | Arcade | One-button flyer with parallax clouds and pipes |
| **Pong** | Arcade | First to 7 vs a computer with three difficulty levels |
| **Runner** | Arcade | Endless jumper: variable-height jumps, ducking under birds, rising speed |
| **Invaders** | Arcade | Marching pixel swarm, destructible shields, bonus saucer, endless waves |
| **Asteroids** | Arcade | Inertia, screen wrap, splitting rocks, on-screen controls on touch |
| **Memory** | Puzzle | Card-flip pairs on three board sizes, fewest-moves records |
| **Sudoku** | Puzzle | Generated puzzles with a unique solution, notes, hints, conflict marking |
| **Word Guess** | Puzzle | Five-letter word in six tries, 14k-word dictionary, streak tracking |
| **Slide Puzzle** | Puzzle | 3×3 / 4×4 / 5×5, always solvable, slide whole rows at once |
| **Lights Out** | Puzzle | Endless levels with par and stars |
| **Connect Four** | Strategy | Alpha-beta AI (Easy / Medium / Hard) or 2 players |
| **Reversi** | Strategy | Move hints, flip animations, positional AI or 2 players |
| **Echo** | Reflex | Simon-style memory sequence with tones |
| **Reaction** | Reflex | Five-try reaction time average |
| **Whack-a-Mole** | Reflex | 30-second round with golden moles and bombs |
| **Chess** | Strategy | Full rules (castling, en passant, promotion, repetition, 50-move), alpha-beta engine, undo, move list |
| **Solitaire** | Strategy | Klondike, draw 1 or 3, drag-and-drop or tap-to-move, undo, hints, auto-finish |
| **Snake Duel** | Arcade | Two snakes, first to 3 rounds: vs a pathfinding AI or 2 players on one keyboard |
| **Maze Chase** | Arcade | Pac-Man-style maze with four ghost personalities, power pellets, tunnel and levels |

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
js/data/words.js    Word Guess dictionary (loaded only when that game opens)
```

### Adding a game

Create `js/games/yourgame.js`, call `GL.register({ id, name, category, hue, tagline, howTo, controls, art, mount(api) })`,
and add a `<script>` tag in `index.html`. `mount` receives an `api` with `root`, `options`, `setScore`, `stat`,
`submit`, `best`, `overlay`, `hideOverlay` and `setPaused`, and returns `{ restart, destroy, togglePause?, pause? }`.
Real-time canvas games can use `GL.realtime(api, { reset, update, draw })`, which handles the
ready / running / paused / game-over flow and best-score bookkeeping.
