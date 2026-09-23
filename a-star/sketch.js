// A* Pathfinding Visualizer
// Place a start (A) and goal (B), draw walls, and watch A* search the grid.

const SQRT2 = Math.SQRT2;
// Steps per frame for each speed level; the last level finishes instantly.
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 40, Infinity];

let cols, rows, cell;
let walls;              // Uint8Array, 1 = wall
let startIdx, endIdx;

let search = null;      // state of the current A* run
let mode = 'idle';      // idle | running | paused | done
let stepBudget = 0;

let tool = 'wall';
let allowDiagonal = true;
let speedLevel = 6;
let palette = {};

let canvasEl;
let drag = null;        // { type: 'wall' | 'erase' | 'start' | 'end', last }
let hover = -1;

const ui = {};

// ---------------------------------------------------------------- grid

function idx(x, y) { return y * cols + x; }
function xOf(i) { return i % cols; }
function yOf(i) { return Math.floor(i / cols); }

function isWall(x, y) {
  return x < 0 || y < 0 || x >= cols || y >= rows || walls[idx(x, y)] === 1;
}

function measureGrid() {
  const stage = document.getElementById('stage');
  const footer = document.getElementById('footer');
  const availW = stage.clientWidth;
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const availH = Math.max(260, window.innerHeight - top - footer.offsetHeight - 8);

  const size = availW < 600 ? 20 : 26;
  return {
    size,
    cols: Math.max(10, Math.floor((availW - 1) / size)),
    rows: Math.min(40, Math.max(10, Math.floor((availH - 1) / size))),
  };
}

// Builds a new grid, keeping any walls and endpoints that still fit.
function buildGrid(m) {
  const old = walls ? { walls, cols, rows, a: startIdx, b: endIdx } : null;

  cols = m.cols;
  rows = m.rows;
  cell = m.size;
  walls = new Uint8Array(cols * rows);

  if (!old) {
    startIdx = idx(Math.floor(cols * 0.2), Math.floor(rows / 2));
    endIdx = idx(Math.ceil(cols * 0.8) - 1, Math.floor(rows / 2));
    // A short wall between A and B so the first run is interesting.
    const wx = Math.floor(cols / 2);
    for (let y = Math.floor(rows * 0.2); y < Math.ceil(rows * 0.8); y++) walls[idx(wx, y)] = 1;
    return;
  }

  for (let y = 0; y < Math.min(rows, old.rows); y++) {
    for (let x = 0; x < Math.min(cols, old.cols); x++) {
      walls[idx(x, y)] = old.walls[y * old.cols + x];
    }
  }
  const clamp = (i) => idx(Math.min(i % old.cols, cols - 1), Math.min(Math.floor(i / old.cols), rows - 1));
  startIdx = clamp(old.a);
  endIdx = clamp(old.b);
  if (endIdx === startIdx) endIdx = startIdx === 0 ? 1 : startIdx - 1;
  walls[startIdx] = 0;
  walls[endIdx] = 0;
}

function randomWalls() {
  for (let i = 0; i < walls.length; i++) walls[i] = Math.random() < 0.3 ? 1 : 0;
  walls[startIdx] = 0;
  walls[endIdx] = 0;
  gridChanged();
}

// Recursive-backtracker maze: rooms sit on odd coordinates, walls between them.
function generateMaze() {
  walls.fill(1);
  const maxX = (cols - 2) % 2 === 1 ? cols - 2 : cols - 3;
  const maxY = (rows - 2) % 2 === 1 ? rows - 2 : rows - 3;

  const stack = [[1, 1]];
  walls[idx(1, 1)] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 1 && ny >= 1 && nx <= maxX && ny <= maxY && walls[idx(nx, ny)] === 1;
    });
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[Math.floor(Math.random() * options.length)];
    walls[idx(x + dx / 2, y + dy / 2)] = 0;
    walls[idx(x + dx, y + dy)] = 0;
    stack.push([x + dx, y + dy]);
  }

  // Snap A and B onto the nearest room so they're always connected.
  const snap = (i) => idx(Math.min(xOf(i) | 1, maxX), Math.min(yOf(i) | 1, maxY));
  startIdx = snap(startIdx);
  endIdx = snap(endIdx);
  if (startIdx === endIdx) {
    startIdx = idx(1, 1);
    endIdx = idx(maxX, maxY);
  }
  gridChanged();
}

// ---------------------------------------------------------------- A*

// Octile distance with diagonals, Manhattan without. Both never overestimate
// the true remaining cost, so A* is guaranteed to return a shortest path.
function heuristic(i) {
  const dx = Math.abs(xOf(i) - xOf(endIdx));
  const dy = Math.abs(yOf(i) - yOf(endIdx));
  return allowDiagonal ? dx + dy + (SQRT2 - 2) * Math.min(dx, dy) : dx + dy;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function forEachNeighbor(i, fn) {
  const x = xOf(i), y = yOf(i);
  const count = allowDiagonal ? 8 : 4;
  for (let k = 0; k < count; k++) {
    const [dx, dy] = DIRS[k];
    const nx = x + dx, ny = y + dy;
    if (isWall(nx, ny)) continue;
    const diagonal = dx !== 0 && dy !== 0;
    // Don't cut corners: a diagonal step needs both side cells open.
    if (diagonal && (isWall(x + dx, y) || isWall(x, y + dy))) continue;
    fn(idx(nx, ny), diagonal ? SQRT2 : 1);
  }
}

// Binary min-heap ordered by f, ties broken toward lower h (closer to goal).
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }

  static less(a, b) {
    if (Math.abs(a.f - b.f) > 1e-9) return a.f < b.f;
    return a.h < b.h;
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!MinHeap.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
        if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function createSearch() {
  const n = cols * rows;
  const s = {
    g: new Float64Array(n).fill(Infinity),
    prev: new Int32Array(n).fill(-1),
    state: new Uint8Array(n),   // 0 = unseen, 1 = open, 2 = closed
    open: new MinHeap(),
    openCount: 1,
    visited: 0,
    current: -1,
    path: [],
    result: null,               // 'found' | 'nopath'
  };
  const h = heuristic(startIdx);
  s.g[startIdx] = 0;
  s.state[startIdx] = 1;
  s.open.push({ i: startIdx, f: h, h });
  return s;
}

// Expands one node. Returns 'continue', 'found' or 'nopath'.
function step(s) {
  while (s.open.size) {
    const { i: cur, f } = s.open.pop();
    // Skip stale heap entries left behind when a node's cost improved.
    if (s.state[cur] === 2 || f > s.g[cur] + heuristic(cur) + 1e-9) continue;

    s.state[cur] = 2;
    s.openCount--;
    s.visited++;
    s.current = cur;

    if (cur === endIdx) {
      s.path = tracePath(s, cur);
      return (s.result = 'found');
    }

    forEachNeighbor(cur, (n, cost) => {
      if (s.state[n] === 2) return;
      const g = s.g[cur] + cost;
      if (g >= s.g[n]) return;
      if (s.state[n] === 0) s.openCount++;
      s.g[n] = g;
      s.prev[n] = cur;
      s.state[n] = 1;
      const h = heuristic(n);
      s.open.push({ i: n, f: g + h, h });
    });
    return 'continue';
  }
  s.current = -1;
  return (s.result = 'nopath');
}

function tracePath(s, i) {
  const path = [];
  for (; i !== -1; i = s.prev[i]) path.push(i);
  return path.reverse();
}

function runToEnd(s) {
  let r;
  do { r = step(s); } while (r === 'continue');
  return r;
}

// ---------------------------------------------------------------- controls

function startRun() {
  search = createSearch();
  stepBudget = 0;
  mode = 'running';
  refreshUI();
}

function onRun() {
  if (mode === 'idle' || mode === 'done') startRun();
  else if (mode === 'running') { mode = 'paused'; refreshUI(); }
  else if (mode === 'paused') { mode = 'running'; refreshUI(); }
}

function onStep() {
  if (mode === 'done') return;
  if (!search) search = createSearch();
  mode = 'paused';
  const r = step(search);
  if (r !== 'continue') finish();
  else refreshUI();
}

function clearSearch(message) {
  search = null;
  mode = 'idle';
  refreshUI(message);
}

function finish() {
  mode = 'done';
  refreshUI();
}

// Called after any change to walls, endpoints or options.
function gridChanged() {
  if (mode === 'done') {
    // Once a search has finished, keep the result live while editing.
    search = createSearch();
    runToEnd(search);
    refreshUI();
  } else if (mode === 'running' || mode === 'paused') {
    clearSearch('Grid changed, so the search was cleared. Press Find path to run it again.');
  } else {
    refreshUI();
  }
}

function setTool(t) {
  tool = t;
  ui.tools.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
}

function refreshUI(message) {
  const labels = { idle: 'Find path', running: 'Pause', paused: 'Resume', done: 'Run again' };
  ui.run.textContent = labels[mode];
  ui.step.disabled = mode === 'done';
  ui.clearPath.disabled = !search;

  const s = search;
  ui.visited.textContent = s ? s.visited : 0;
  ui.frontier.textContent = s ? s.openCount : 0;
  if (s && s.result === 'found') {
    const moves = s.path.length - 1;
    ui.path.textContent = `${moves} moves · cost ${s.g[endIdx].toFixed(1)}`;
  } else {
    ui.path.textContent = s && s.result === 'nopath' ? 'none' : '—';
  }

  if (message) {
    ui.status.textContent = message;
  } else if (mode === 'idle') {
    ui.status.textContent = 'Drag on the grid to draw walls, drag A or B to move them, then press Find path (Space).';
  } else if (mode === 'running') {
    ui.status.textContent = 'Searching…';
  } else if (mode === 'paused') {
    ui.status.textContent = 'Paused. Press Step to expand one node at a time, or Resume.';
  } else if (s.result === 'found') {
    ui.status.textContent = 'Shortest path found. Keep editing and it updates live.';
  } else {
    ui.status.textContent = "No path: B can't be reached from A. Remove some walls and it updates live.";
  }
}

// ---------------------------------------------------------------- input

function cellAt(e) {
  const r = canvasEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cell);
  const y = Math.floor((e.clientY - r.top) / cell);
  return x >= 0 && y >= 0 && x < cols && y < rows ? idx(x, y) : -1;
}

function paint(i, value) {
  if (i === startIdx || i === endIdx || walls[i] === value) return false;
  walls[i] = value;
  return true;
}

function moveEndpoint(which, i, force) {
  const other = which === 'start' ? endIdx : startIdx;
  if (i === other) return false;
  if (walls[i] && !force) return false;
  walls[i] = 0;
  if (which === 'start') startIdx = i; else endIdx = i;
  return true;
}

// Every cell on the line from a to b, so fast drags don't leave gaps.
function cellsBetween(a, b) {
  let x0 = xOf(a), y0 = yOf(a);
  const x1 = xOf(b), y1 = yOf(b);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out = [];
  for (;;) {
    out.push(idx(x0, y0));
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function applyDrag(i) {
  if (drag.type === 'start' || drag.type === 'end') return moveEndpoint(drag.type, i, false);
  const value = drag.type === 'wall' ? 1 : 0;
  let changed = false;
  for (const c of cellsBetween(drag.last, i)) changed = paint(c, value) || changed;
  return changed;
}

function onPointerDown(e) {
  const i = cellAt(e);
  if (i < 0) return;
  e.preventDefault();
  canvasEl.setPointerCapture(e.pointerId);

  let changed = false;
  if (i === startIdx) drag = { type: 'start' };
  else if (i === endIdx) drag = { type: 'end' };
  else if (e.button === 2) drag = { type: 'erase' };
  else if (tool === 'start' || tool === 'end') {
    drag = { type: tool };
    changed = moveEndpoint(tool, i, true);
  } else if (tool === 'erase') drag = { type: 'erase' };
  else drag = { type: walls[i] ? 'erase' : 'wall' };   // start on a wall to erase

  drag.last = i;
  if (drag.type === 'wall' || drag.type === 'erase') changed = applyDrag(i);
  if (changed) gridChanged();
}

function onPointerMove(e) {
  hover = cellAt(e);
  if (!drag) {
    canvasEl.style.cursor = hover === startIdx || hover === endIdx ? 'grab' : 'crosshair';
    return;
  }
  if (hover < 0 || hover === drag.last) return;
  if (applyDrag(hover)) gridChanged();
  drag.last = hover;
}

function onPointerUp() {
  drag = null;
}

function onKeyDown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.tagName === 'BUTTON' || t.type === 'checkbox') return;

  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); onRun(); }
  else if (k === 's') onStep();
  else if (k === 'c') { if (search) clearSearch(); }
  else if (k === 'w') setTool('wall');
  else if (k === 'e') setTool('erase');
  else if (k === 'a') setTool('start');
  else if (k === 'b') setTool('end');
}

function bindUI() {
  const $ = (id) => document.getElementById(id);
  Object.assign(ui, {
    run: $('run'), step: $('step'), clearPath: $('clearPath'), status: $('status'),
    visited: $('statVisited'), frontier: $('statFrontier'), path: $('statPath'),
    tools: [...document.querySelectorAll('.tool')],
  });

  // Keep mouse clicks from leaving focus on buttons, so Space always runs the search.
  document.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));

  ui.tools.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  ui.run.addEventListener('click', onRun);
  ui.step.addEventListener('click', onStep);
  ui.clearPath.addEventListener('click', () => clearSearch());
  $('random').addEventListener('click', randomWalls);
  $('maze').addEventListener('click', generateMaze);
  $('clearWalls').addEventListener('click', () => { walls.fill(0); gridChanged(); });
  $('diagonal').addEventListener('change', (e) => { allowDiagonal = e.target.checked; gridChanged(); });
  $('speed').addEventListener('input', (e) => { speedLevel = Number(e.target.value); });
  speedLevel = Number($('speed').value);

  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointercancel', onPointerUp);
  canvasEl.addEventListener('pointerleave', () => { if (!drag) hover = -1; });
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', onKeyDown);
}

// ---------------------------------------------------------------- p5

function loadPalette() {
  const css = getComputedStyle(document.documentElement);
  for (const name of ['cell', 'gridline', 'wall', 'open', 'closed', 'path', 'start', 'end', 'current', 'hover']) {
    palette[name] = color(css.getPropertyValue(`--${name}`).trim());
  }
}

function setup() {
  buildGrid(measureGrid());
  const c = createCanvas(cols * cell + 1, rows * cell + 1);
  c.parent('stage');
  canvasEl = c.elt;

  loadPalette();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', loadPalette);
  textFont('system-ui');
  textStyle(BOLD);
  textAlign(CENTER, CENTER);

  bindUI();
  refreshUI();
}

let resizeTimer;
function windowResized() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const m = measureGrid();
    if (m.cols === cols && m.rows === rows && m.size === cell) return;
    buildGrid(m);
    resizeCanvas(cols * cell + 1, rows * cell + 1);
    if (mode === 'done') gridChanged();
    else if (search) clearSearch();
  }, 150);
}

function advance() {
  if (mode !== 'running') return;
  const rate = SPEEDS[speedLevel - 1];
  if (rate === Infinity) {
    runToEnd(search);
    return finish();
  }
  stepBudget += rate;
  while (stepBudget >= 1) {
    stepBudget--;
    if (step(search) !== 'continue') return finish();
  }
  refreshUI();
}

function center(i) {
  return [xOf(i) * cell + cell / 2 + 0.5, yOf(i) * cell + cell / 2 + 0.5];
}

function drawEndpoint(i, col, label) {
  const [cx, cy] = center(i);
  noStroke();
  fill(col);
  circle(cx, cy, cell * 0.82);
  fill(255);
  textSize(cell * 0.46);
  text(label, cx, cy + 1);
}

function draw() {
  advance();

  const s = search;
  background(palette.gridline);
  noStroke();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = idx(x, y);
      let c = palette.cell;
      if (walls[i]) c = palette.wall;
      else if (s && s.state[i] === 2) c = palette.closed;
      else if (s && s.state[i] === 1) c = palette.open;
      fill(c);
      rect(x * cell + 1, y * cell + 1, cell - 1, cell - 1);
    }
  }

  // Final path, or the best path so far while searching.
  let path = [];
  if (s && s.result === 'found') path = s.path;
  else if (s && !s.result && s.current >= 0) path = tracePath(s, s.current);

  if (path.length > 1) {
    noFill();
    stroke(palette.path);
    strokeWeight(Math.max(3, cell * 0.26));
    strokeCap(ROUND);
    strokeJoin(ROUND);
    beginShape();
    for (const i of path) vertex(...center(i));
    endShape();
  }

  if (s && !s.result && s.current >= 0) {
    noFill();
    stroke(palette.current);
    strokeWeight(2);
    rect(xOf(s.current) * cell + 1.5, yOf(s.current) * cell + 1.5, cell - 2, cell - 2, 3);
  }

  if (hover >= 0 && !drag) {
    noFill();
    stroke(palette.hover);
    strokeWeight(1.5);
    rect(xOf(hover) * cell + 1, yOf(hover) * cell + 1, cell - 1, cell - 1, 3);
  }

  drawEndpoint(startIdx, palette.start, 'A');
  drawEndpoint(endIdx, palette.end, 'B');
}
