// Snake
// Eat the food to grow; don't hit the walls or yourself. It speeds up as you eat.

const COLS = 20;
const ROWS = 20;
const START_SPEED = 7;     // moves per second
const SPEED_STEP = 0.4;    // added for each food eaten
const MAX_SPEED = 18;
const SWIPE_PX = 24;       // finger travel that counts as a swipe
const BEST_KEY = 'snake-best';

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

let cell;
let snake;          // cell indices, tail first, head last
let occupied;       // Uint8Array, 1 = snake body
let dir;
let queue;          // pending turns, applied one per move
let food;           // cell index, or -1 when the board is full
let score, best, speed, newBest;
let state = 'ready';   // ready | playing | paused | over | won
let elapsed = 0;       // ms since the last move

let palette = {};
let canvasEl;
let swipe = null;
const isTouch = window.matchMedia('(pointer: coarse)').matches;

const ui = {};

// ---------------------------------------------------------------- board

function idx(x, y) { return y * COLS + x; }
function xOf(i) { return i % COLS; }
function yOf(i) { return Math.floor(i / COLS); }

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}

function saveBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch (e) { /* storage unavailable */ }
}

function resetGame() {
  const y = Math.floor(ROWS / 2);
  snake = [idx(3, y), idx(4, y), idx(5, y)];
  occupied = new Uint8Array(COLS * ROWS);
  for (const i of snake) occupied[i] = 1;
  dir = DIRS.right;
  queue = [];
  food = idx(COLS - 5, y);
  score = 0;
  speed = START_SPEED;
  newBest = false;
  elapsed = 0;
}

function placeFood() {
  const free = [];
  for (let i = 0; i < occupied.length; i++) if (!occupied[i]) free.push(i);
  return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
}

function step() {
  if (queue.length) dir = queue.shift();

  const head = snake[snake.length - 1];
  const nx = xOf(head) + dir.x;
  const ny = yOf(head) + dir.y;
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return endGame('over');

  const next = idx(nx, ny);
  const eating = next === food;
  const tail = snake[0];
  // Moving into the tail's cell is fine unless the snake is growing, since the tail moves away.
  if (occupied[next] && !(next === tail && !eating)) return endGame('over');

  if (!eating) {
    snake.shift();
    occupied[tail] = 0;
  }
  snake.push(next);
  occupied[next] = 1;

  if (eating) {
    score++;
    speed = Math.min(MAX_SPEED, speed + SPEED_STEP);
    food = placeFood();
    if (food === -1) return endGame('won');
  }
  refreshUI();
}

function endGame(result) {
  state = result;
  if (score > best) {
    best = score;
    newBest = true;
    saveBest(best);
  }
  refreshUI();
}

// ---------------------------------------------------------------- game flow

function start() {
  if (state === 'over' || state === 'won') resetGame();
  state = 'playing';
  elapsed = 0;
  refreshUI();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  refreshUI();
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  elapsed = 0;
  refreshUI();
}

function togglePlay() {
  if (state === 'playing') pause();
  else if (state === 'paused') resume();
  else start();
}

function restart() {
  resetGame();
  state = 'playing';
  refreshUI();
}

// Queues a turn. Checking against the last queued direction (not just the current one)
// stops two quick key presses from reversing the snake into itself.
function turn(name) {
  if (state === 'over' || state === 'won') return;
  if (state === 'ready') start();
  else if (state === 'paused') resume();

  const d = DIRS[name];
  const last = queue.length ? queue[queue.length - 1] : dir;
  if (d === last || (d.x === -last.x && d.y === -last.y)) return;
  if (queue.length < 2) queue.push(d);
}

// ---------------------------------------------------------------- input

function onKeyDown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (KEYS[key]) {
    e.preventDefault();   // arrow keys would otherwise scroll the page
    turn(KEYS[key]);
    return;
  }
  // Let a focused button handle Space/Enter itself.
  if (e.target instanceof HTMLButtonElement && (key === ' ' || key === 'Enter')) return;
  if (key === ' ' || key === 'p' || key === 'Enter') {
    e.preventDefault();
    togglePlay();
  } else if (key === 'r') {
    restart();
  }
}

function onPointerDown(e) {
  e.preventDefault();
  canvasEl.setPointerCapture(e.pointerId);
  swipe = { x: e.clientX, y: e.clientY, moved: false };
}

function onPointerMove(e) {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  // Restart from here so one continuous drag can make several turns.
  swipe = { x: e.clientX, y: e.clientY, moved: true };
}

function onPointerUp() {
  // A tap (no swipe) starts, resumes, or restarts. Taps while playing are ignored.
  if (swipe && !swipe.moved && state !== 'playing') togglePlay();
  swipe = null;
}

function bindUI() {
  for (const id of ['play', 'restart', 'score', 'best', 'length', 'status']) {
    ui[id] = document.getElementById(id);
  }
  ui.play.addEventListener('click', togglePlay);
  ui.restart.addEventListener('click', restart);

  for (const b of document.querySelectorAll('[data-dir]')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();   // react on touch-down (faster than click) and don't steal focus
      turn(b.dataset.dir);
    });
    // Keyboard activation of a focused arrow button arrives as a click with detail 0.
    b.addEventListener('click', (e) => { if (e.detail === 0) turn(b.dataset.dir); });
  }
  // Keep toolbar buttons from taking focus on mouse clicks, so Space still pauses.
  for (const b of document.querySelectorAll('.toolbar button')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
  }

  document.addEventListener('keydown', onKeyDown);
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointercancel', () => { swipe = null; });
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
}

function statusText() {
  if (state === 'ready') return isTouch ? 'Tap Start, then swipe or use the arrows to steer.' : 'Press Start, Space, or an arrow key to play.';
  if (state === 'playing') return 'Eat the food to grow. Each bite makes you a little faster.';
  if (state === 'paused') return isTouch ? 'Paused. Tap the board to resume.' : 'Paused. Press Space to resume.';
  const again = isTouch ? 'Tap to play again.' : 'Press Space to play again.';
  if (state === 'won') return `You filled the whole board with a score of ${score}. ${again}`;
  return `Game over. You scored ${score}${newBest ? ', a new best!' : '.'} ${again}`;
}

function refreshUI() {
  ui.score.textContent = score;
  ui.best.textContent = best;
  ui.length.textContent = snake.length;
  ui.play.textContent = { ready: 'Start', playing: 'Pause', paused: 'Resume', over: 'Play again', won: 'Play again' }[state];
  const status = statusText();
  if (ui.status.textContent !== status) ui.status.textContent = status;
}

// ---------------------------------------------------------------- drawing

function loadPalette() {
  const css = getComputedStyle(document.documentElement);
  for (const name of ['board', 'tile', 'snake', 'head', 'eye', 'food', 'overlay', 'overlay-text']) {
    palette[name] = color(css.getPropertyValue(`--${name}`).trim());
  }
  palette.overlay.setAlpha(200);
}

function measureCell() {
  const stage = document.getElementById('stage');
  const dpad = document.getElementById('dpad');
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const below = dpad.offsetHeight ? dpad.offsetHeight + 20 : 12;
  const availH = window.innerHeight - top - below;
  const px = Math.max(220, Math.min(stage.clientWidth, availH, 560));
  return Math.max(10, Math.floor(px / COLS));
}

function setup() {
  cell = measureCell();
  const c = createCanvas(COLS * cell, ROWS * cell);
  c.parent('stage');
  canvasEl = c.elt;

  loadPalette();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', loadPalette);
  textFont('system-ui');
  textAlign(CENTER, CENTER);

  best = loadBest();
  resetGame();
  bindUI();
  refreshUI();
}

let resizeTimer;
function windowResized() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const size = measureCell();
    if (size === cell) return;
    cell = size;
    resizeCanvas(COLS * cell, ROWS * cell);
  }, 150);
}

function drawCell(i, inset, radius) {
  rect(xOf(i) * cell + inset, yOf(i) * cell + inset, cell - inset * 2, cell - inset * 2, radius);
}

function drawEyes(head) {
  const cx = (xOf(head) + 0.5) * cell;
  const cy = (yOf(head) + 0.5) * cell;
  const px = -dir.y, py = dir.x;   // perpendicular to the direction of travel
  fill(palette.eye);
  for (const side of [-1, 1]) {
    circle(cx + dir.x * cell * 0.18 + px * side * cell * 0.2, cy + dir.y * cell * 0.18 + py * side * cell * 0.2, cell * 0.2);
  }
}

function overlayLines() {
  const go = isTouch ? 'Tap' : 'Press Space';
  if (state === 'ready') return ['Snake', isTouch ? 'Tap to start' : 'Press Space or an arrow key', best ? `Best: ${best}` : ''];
  if (state === 'paused') return ['Paused', `${go} to resume`, ''];
  if (state === 'won') return ['You win!', `Score: ${score}`, `${go} to play again`];
  return ['Game over', `Score: ${score}${newBest ? '  ·  New best!' : ''}`, `${go} to play again`];
}

function drawOverlay() {
  noStroke();
  fill(palette.overlay);
  rect(0, 0, width, height);

  const [title, line1, line2] = overlayLines();
  fill(palette['overlay-text']);
  textStyle(BOLD);
  textSize(cell * 1.6);
  text(title, width / 2, height / 2 - cell * 1.5);
  textStyle(NORMAL);
  textSize(cell * 0.8);
  text(line1, width / 2, height / 2 + cell * 0.3);
  if (line2) text(line2, width / 2, height / 2 + cell * 1.4);
}

function draw() {
  if (state === 'playing') {
    elapsed += Math.min(deltaTime, 250);
    while (state === 'playing' && elapsed >= 1000 / speed) {
      elapsed -= 1000 / speed;
      step();
    }
  }

  noStroke();
  background(palette.board);
  fill(palette.tile);
  for (let y = 0; y < ROWS; y++) {
    for (let x = y % 2; x < COLS; x += 2) rect(x * cell, y * cell, cell, cell);
  }

  if (food >= 0) {
    fill(palette.food);
    circle((xOf(food) + 0.5) * cell, (yOf(food) + 0.5) * cell, cell * 0.7);
  }

  fill(palette.snake);
  for (let k = 0; k < snake.length - 1; k++) drawCell(snake[k], cell * 0.08, cell * 0.25);
  const head = snake[snake.length - 1];
  fill(palette.head);
  drawCell(head, cell * 0.04, cell * 0.3);
  drawEyes(head);

  if (state !== 'playing') drawOverlay();
}
