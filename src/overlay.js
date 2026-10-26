'use strict';

// Drawing layer. It owns the drawing state (tool, colour, width, undo history)
// and tells the toolbar about it through the "state" event.

const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textBox = document.getElementById('text');

// Finished strokes are painted once into this off-screen layer; each frame
// only copies it and draws what is still moving on top.
const base = document.createElement('canvas');
const baseCtx = base.getContext('2d');
let baseKey = null;

const KEY_TOOLS = {
  p: 'pen', m: 'marker', a: 'arrow', l: 'line', r: 'rect',
  o: 'ellipse', t: 'text', e: 'eraser', x: 'laser', f: 'spot',
};
const SHAPES = ['line', 'arrow', 'rect', 'ellipse'];
const MAX_HISTORY = 300;

let config = {
  colors: ['#FF3B30', '#FFCC00', '#34C759', '#0A84FF', '#FFFFFF', '#111111'],
  width: 4,
  laserSeconds: 1.5,
};
const st = { drawing: false, tool: 'pen', color: 0, width: 4, spotRadius: 180 };

// One drawing per monitor: { history: [items[]], index, board: null|'white'|'black' }
const docs = new Map();
let doc = getDoc('');

let live = null;        // item being drawn
let erasing = null;     // { base, current } while the eraser is down
let activeTool = null;  // tool of the stroke in progress
let activeLaser = null;
let pointer = null;     // last pointer position over the overlay
let lastErase = null;
let textAt = null;      // open text box: { x, y, size, color }
const lasers = [];      // { color, width, pts: [[x, y, time]] }
let widthPreviewUntil = 0;

function getDoc(key) {
  if (!docs.has(key)) docs.set(key, { history: [[]], index: 0, board: null });
  return docs.get(key);
}

const items = () => doc.history[doc.index];
const color = () => config.colors[st.color] || '#FF3B30';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- history ----------

function commit(next) {
  doc.history = doc.history.slice(0, doc.index + 1);
  doc.history.push(next);
  if (doc.history.length > MAX_HISTORY) doc.history.shift();
  doc.index = doc.history.length - 1;
  changed();
}

function undo() {
  if (doc.index > 0) { doc.index--; changed(); }
}

function redo() {
  if (doc.index < doc.history.length - 1) { doc.index++; changed(); }
}

function clearAll() {
  closeText();
  lasers.length = 0;
  if (items().length) commit([]);
  else changed();
}

// ---------- state ----------

function setTool(tool) {
  if (tool !== 'text') commitText();
  st.tool = tool;
  document.body.className = document.body.className.replace(/\btool-\S+/g, '').trim();
  document.body.classList.add('tool-' + tool);
  if (!st.drawing) invoke('set_drawing', { drawing: true });
  changed();
}

function setColor(i) {
  if (i < 0 || i >= config.colors.length) return;
  st.color = i;
  if (textAt) {
    textAt.color = color();
    textBox.style.color = textAt.color;
  }
  changed();
}

function setWidth(w) {
  st.width = clamp(Math.round(w), 1, 40);
  widthPreviewUntil = performance.now() + 700;
  changed();
}

function setBoard(kind) {
  doc.board = doc.board === kind ? null : kind;
  changed();
}

function changed() {
  dirty();
  emit('state', {
    tool: st.tool,
    color: st.color,
    width: st.width,
    colors: config.colors,
    board: doc.board,
    canUndo: doc.index > 0,
    canRedo: doc.index < doc.history.length - 1,
  });
}

// ---------- rendering ----------

let needsRender = true;
let wasAnimating = false;
let dpr = 1;

function dirty() { needsRender = true; }

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = base.width = Math.round(innerWidth * dpr);
  canvas.height = base.height = Math.round(innerHeight * dpr);
  baseKey = null;
  dirty();
}

function frame(now) {
  requestAnimationFrame(frame);
  pruneLasers(now);
  const animating = lasers.length > 0 || widthPreviewUntil > now;
  if (!needsRender && !animating && !wasAnimating) return;
  wasAnimating = animating;
  needsRender = false;
  render(now);
}

function renderBase(list) {
  if (baseKey && baseKey.list === list && baseKey.board === doc.board) return;
  baseKey = { list, board: doc.board };
  baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  baseCtx.clearRect(0, 0, innerWidth, innerHeight);
  if (doc.board) {
    baseCtx.fillStyle = doc.board === 'white' ? '#ffffff' : '#111216';
    baseCtx.fillRect(0, 0, innerWidth, innerHeight);
  }
  for (const it of list) drawItem(baseCtx, it);
}

function render(now) {
  const W = innerWidth, H = innerHeight;
  renderBase(erasing ? erasing.current : items());
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (live) drawItem(ctx, live);
  drawLasers(now);
  if (st.drawing && pointer) {
    if (st.tool === 'spot') drawSpot(W, H);
    else drawCursor(now);
  }
}

function drawItem(g, it) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = it.color;
  g.lineWidth = it.width;
  switch (it.type) {
    case 'pen':
    case 'marker':
      if (it.type === 'marker') g.globalAlpha = 0.35;
      if (it.pressure) strokePressure(g, it);
      else strokePoints(g, it.pts, it.width);
      break;
    case 'line':
      g.beginPath();
      g.moveTo(it.x1, it.y1);
      g.lineTo(it.x2, it.y2);
      g.stroke();
      break;
    case 'arrow':
      drawArrow(g, it);
      break;
    case 'rect': {
      const b = box(it);
      g.strokeRect(b.x, b.y, b.w, b.h);
      break;
    }
    case 'ellipse': {
      const b = box(it);
      g.beginPath();
      g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'text':
      g.font = font(it.size);
      g.textBaseline = 'middle';
      it.text.split('\n').forEach((line, i) => {
        g.fillText(line, it.x, it.y + (i + 0.5) * it.size * 1.2);
      });
      break;
  }
  g.restore();
}

// Smooth stroke: quadratic curves through the midpoints.
function strokePoints(g, pts, width) {
  if (pts.length === 1) {
    g.beginPath();
    g.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last[0], last[1]);
  g.stroke();
}

// Pen tablet: width follows the pressure of each point.
function strokePressure(g, it) {
  const pts = it.pts;
  if (pts.length === 1) {
    strokePoints(g, pts, it.width * (0.3 + pts[0][2] * 1.4));
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    g.lineWidth = it.width * (0.3 + pts[i][2] * 1.4);
    g.beginPath();
    g.moveTo(pts[i - 1][0], pts[i - 1][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
}

function drawArrow(g, it) {
  const { x1, y1, x2, y2, width } = it;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const head = Math.min(Math.max(14, width * 4.5), len * 0.6);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2 - Math.cos(angle) * head * 0.7, y2 - Math.sin(angle) * head * 0.7);
  g.stroke();
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - head * Math.cos(angle - 0.42), y2 - head * Math.sin(angle - 0.42));
  g.lineTo(x2 - head * Math.cos(angle + 0.42), y2 - head * Math.sin(angle + 0.42));
  g.closePath();
  g.lineWidth = Math.max(1, width / 2);
  g.fill();
  g.stroke();
}

function drawLasers(now) {
  const life = config.laserSeconds * 1000;
  ctx.save();
  ctx.lineCap = 'round';
  for (const laser of lasers) {
    ctx.strokeStyle = laser.color;
    ctx.shadowColor = laser.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = laser.width;
    const pts = laser.pts;
    for (let i = 1; i < pts.length; i++) {
      const alpha = 1 - (now - pts[i][2]) / life;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function pruneLasers(now) {
  const life = config.laserSeconds * 1000;
  for (let i = lasers.length - 1; i >= 0; i--) {
    const laser = lasers[i];
    if (laser === activeLaser) continue;
    if (now - laser.pts[laser.pts.length - 1][2] > life) {
      lasers.splice(i, 1);
      dirty();
    }
  }
}

function drawSpot(W, H) {
  const { x, y } = pointer;
  const r = st.spotRadius;
  const g = ctx.createRadialGradient(x, y, r * 0.85, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCursor(now) {
  const { x, y } = pointer;
  ctx.save();
  if (st.tool === 'eraser') {
    const r = eraserRadius();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  } else if (st.tool === 'laser') {
    ctx.fillStyle = color();
    ctx.shadowColor = color();
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(x, y, Math.max(4, st.width), 0, Math.PI * 2); ctx.fill();
  } else if (widthPreviewUntil > now) {
    const w = st.tool === 'marker' ? st.width * 4 : st.width;
    ctx.globalAlpha = st.tool === 'marker' ? 0.35 : 0.9;
    ctx.fillStyle = color();
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, w / 2), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function box(it) {
  return {
    x: Math.min(it.x1, it.x2),
    y: Math.min(it.y1, it.y2),
    w: Math.abs(it.x2 - it.x1),
    h: Math.abs(it.y2 - it.y1),
  };
}

const font = (size) => `600 ${size}px "Segoe UI", sans-serif`;
const textSize = () => Math.round(14 + st.width * 5);
const eraserRadius = () => Math.max(10, st.width * 3);

// ---------- eraser ----------

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitPolyline(p, pts, tol) {
  if (pts.length === 1) return Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= tol;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(p.x, p.y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= tol) return true;
  }
  return false;
}

function hits(it, p, r) {
  const tol = r + (it.width || 0) / 2;
  switch (it.type) {
    case 'pen':
    case 'marker':
      return hitPolyline(p, it.pts, tol);
    case 'line':
    case 'arrow':
      return distToSegment(p.x, p.y, it.x1, it.y1, it.x2, it.y2) <= tol;
    case 'rect': {
      const b = box(it);
      return hitPolyline(p, [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]], tol);
    }
    case 'ellipse': {
      const b = box(it);
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push([b.x + b.w / 2 + Math.cos(a) * b.w / 2, b.y + b.h / 2 + Math.sin(a) * b.h / 2]);
      }
      return hitPolyline(p, pts, tol);
    }
    case 'text':
      return p.x >= it.x - r && p.x <= it.x + it.w + r && p.y >= it.y - r && p.y <= it.y + it.h + r;
  }
  return false;
}

// Samples the path between pointer events so fast swipes still erase.
function eraseTo(p) {
  const r = eraserRadius();
  const from = lastErase || p;
  const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / (r / 2)));
  for (let s = 1; s <= steps; s++) {
    const q = { x: from.x + (p.x - from.x) * s / steps, y: from.y + (p.y - from.y) * s / steps };
    erasing.current = erasing.current.filter((it) => !hits(it, q, r));
  }
  lastErase = p;
}

// ---------- text ----------

function openText(x, y) {
  textAt = { x, y, size: textSize(), color: color() };
  Object.assign(textBox.style, {
    display: 'block',
    left: x + 'px',
    top: y + 'px',
    color: textAt.color,
    font: font(textAt.size),
    lineHeight: '1.2',
  });
  textBox.value = '';
  autosizeText();
  setTimeout(() => textBox.focus(), 0);
}

function autosizeText() {
  textBox.style.width = '0';
  textBox.style.height = '0';
  textBox.style.width = Math.max(40, textBox.scrollWidth + 4) + 'px';
  textBox.style.height = textBox.scrollHeight + 'px';
}

function commitText() {
  if (!textAt) return;
  const text = textBox.value.replace(/\s+$/, '');
  if (text) {
    ctx.font = font(textAt.size);
    const lines = text.split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    commit([...items(), { type: 'text', ...textAt, text, w, h: lines.length * textAt.size * 1.2 }]);
  }
  closeText();
}

function closeText() {
  textAt = null;
  textBox.style.display = 'none';
  textBox.value = '';
}

textBox.addEventListener('input', autosizeText);
textBox.addEventListener('blur', commitText);
textBox.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeText(); }
});

// ---------- pointer ----------

function point(e) {
  return { x: e.clientX, y: e.clientY };
}

// Shift: straight lines snap to 45 degrees, boxes become squares/circles.
function shapeEnd(it, p, shift) {
  let x = p.x, y = p.y;
  if (shift) {
    const dx = x - it.x1, dy = y - it.y1;
    if (it.type === 'line' || it.type === 'arrow') {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      x = it.x1 + Math.cos(angle) * len;
      y = it.y1 + Math.sin(angle) * len;
    } else {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      x = it.x1 + Math.sign(dx || 1) * side;
      y = it.y1 + Math.sign(dy || 1) * side;
    }
  }
  it.x2 = x;
  it.y2 = y;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!st.drawing) return;
  const penEraser = e.button === 5;
  if (e.button !== 0 && !penEraser) return;
  if (textAt) { commitText(); return; }
  canvas.setPointerCapture(e.pointerId);
  const p = point(e);
  pointer = p;
  activeTool = penEraser ? 'eraser' : st.tool;

  switch (activeTool) {
    case 'pen':
    case 'marker':
      live = {
        type: activeTool,
        color: color(),
        width: activeTool === 'marker' ? st.width * 4 : st.width,
        pts: [[p.x, p.y, e.pressure || 0.5]],
      };
      if (activeTool === 'pen' && e.pointerType === 'pen') live.pressure = true;
      break;
    case 'line':
    case 'arrow':
    case 'rect':
    case 'ellipse':
      live = { type: activeTool, color: color(), width: st.width, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      break;
    case 'text':
      activeTool = null;
      openText(p.x, p.y);
      break;
    case 'eraser':
      erasing = { base: items(), current: items() };
      lastErase = null;
      eraseTo(p);
      break;
    case 'laser':
      activeLaser = { color: color(), width: Math.max(3, st.width), pts: [[p.x, p.y, performance.now()]] };
      lasers.push(activeLaser);
      break;
  }
  dirty();
});

canvas.addEventListener('pointermove', (e) => {
  if (!st.drawing) return;
  pointer = point(e);
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  switch (activeTool) {
    case 'pen':
    case 'marker':
      for (const ev of events) live.pts.push([ev.clientX, ev.clientY, ev.pressure || 0.5]);
      break;
    case 'line':
    case 'arrow':
    case 'rect':
    case 'ellipse':
      shapeEnd(live, pointer, e.shiftKey);
      break;
    case 'eraser':
      eraseTo(pointer);
      break;
    case 'laser':
      for (const ev of events) activeLaser.pts.push([ev.clientX, ev.clientY, performance.now()]);
      break;
  }
  dirty();
});

function endStroke() {
  if (live) {
    const tiny = SHAPES.includes(live.type) && Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 3;
    if (!tiny) commit([...items(), live]);
  }
  if (erasing && erasing.current.length !== erasing.base.length) commit(erasing.current);
  live = null;
  erasing = null;
  activeLaser = null;
  activeTool = null;
  dirty();
}

canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', () => { pointer = null; dirty(); });

window.addEventListener('wheel', (e) => {
  if (!st.drawing) return;
  e.preventDefault();
  const step = -Math.sign(e.deltaY);
  if (st.tool === 'spot') {
    st.spotRadius = clamp(st.spotRadius + step * 20, 40, 900);
    dirty();
  } else {
    setWidth(st.width + step);
  }
}, { passive: false });

// ---------- keyboard ----------

function handleKey(k) {
  const key = k.key.toLowerCase();
  if (k.ctrl) {
    if (key === 'z') k.shift ? redo() : undo();
    else if (key === 'y') redo();
    return;
  }
  if (key === 'escape') {
    invoke('set_drawing', { drawing: false });
  } else if (/^[1-9]$/.test(key)) {
    setColor(Number(key) - 1);
  } else if (KEY_TOOLS[key]) {
    setTool(KEY_TOOLS[key]);
  } else if (key === 'c') {
    clearAll();
  } else if (key === 'w') {
    setBoard('white');
  } else if (key === 'k') {
    setBoard('black');
  } else if (key === '[' || key === '-') {
    setWidth(st.width - 1);
  } else if (key === ']' || key === '=' || key === '+') {
    setWidth(st.width + 1);
  }
}

// Pressing or releasing Shift mid-shape snaps it without moving the mouse.
function onShift(e) {
  if (e.key !== 'Shift' || !live || !SHAPES.includes(live.type) || !pointer) return;
  shapeEnd(live, pointer, e.type === 'keydown');
  dirty();
}

window.addEventListener('keyup', onShift);
window.addEventListener('keydown', (e) => {
  if (!st.drawing || e.target === textBox) return;
  if (e.key === 'Shift') return onShift(e);
  if (e.key === 'Control') return;
  e.preventDefault();
  handleKey({ key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey });
});

// ---------- wiring ----------

function setMode(drawing) {
  st.drawing = drawing;
  document.body.classList.toggle('drawing', drawing);
  if (!drawing) {
    commitText();
    if (activeTool) endStroke();
    pointer = null;
  }
  changed();
}

listen('mode', ({ payload }) => setMode(payload));
listen('clear', clearAll);
listen('monitor', ({ payload }) => {
  commitText();
  doc = getDoc(payload);
  changed();
});
listen('cmd', ({ payload: c }) => {
  switch (c.action) {
    case 'tool': setTool(c.value); break;
    case 'color': setColor(c.value); break;
    case 'width': setWidth(c.value); break;
    case 'board': setBoard(c.value); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'clear': clearAll(); break;
    case 'key': handleKey(c); break;
    case 'sync': changed(); break;
  }
});

window.addEventListener('resize', resize);

(async () => {
  try {
    config = { ...config, ...(await invoke('get_config')) };
  } catch (_) { /* keep defaults */ }
  st.width = clamp(Math.round(config.width), 1, 40);
  doc = getDoc(await invoke('overlay_monitor'));
  document.body.classList.add('tool-' + st.tool);
  resize();
  setMode(await invoke('get_mode'));
  requestAnimationFrame(frame);
})();
