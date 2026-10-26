'use strict';

// Floating toolbar. It sends commands to the drawing layer ("cmd" event) and
// mirrors the state the layer reports back ("state" event).

const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const svg = (body) => `<svg viewBox="0 0 24 24">${body}</svg>`;
const ICONS = {
  mouse: svg('<path d="M5 3l6.5 17 2.3-7.2L21 10.5z"/>'),
  pen: svg('<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  marker: svg('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
  arrow: svg('<path d="M5 19 19 5"/><path d="M9 5h10v10"/>'),
  line: svg('<path d="M5 19 19 5"/>'),
  rect: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
  text: svg('<path d="M5 7V4.5h14V7"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>'),
  eraser: svg('<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'),
  laser: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7.5" opacity=".45"/>'),
  spot: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  clear: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>'),
  board: svg('<rect x="4" y="4" width="16" height="16" rx="2.5"/>'),
  boards: svg('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M6.5 20 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5z" fill="currentColor" stroke="none"/>'),
  minimize: svg('<path d="M5 12h14"/>'),
  menu: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  vertical: svg('<rect x="8.5" y="3" width="7" height="18" rx="2"/>'),
  horizontal: svg('<rect x="3" y="8.5" width="18" height="7" rx="2"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};

const KEYS = {
  pen: 'P', marker: 'M', arrow: 'A', line: 'L', rect: 'R', ellipse: 'O',
  text: 'T', eraser: 'E', laser: 'X', spot: 'F', white: 'W', black: 'K',
};

// Tools sharing one button. The button shows the last one used; clicking it
// again (or right-clicking) opens the others.
const GROUPS = {
  shapes: { tools: ['arrow', 'line', 'rect', 'ellipse'], current: 'arrow' },
  pointers: { tools: ['laser', 'spot'], current: 'laser' },
};
const WIDTH_PRESETS = [2, 4, 8, 14];

const $ = (id) => document.getElementById(id);
const pill = $('pill');
const flyout = $('flyout');
const modeBtn = $('mode');
const widthBtn = $('width');
const bubble = $('bubble');
const send = (action, value) => emit('cmd', { action, value });

let state = { tool: 'pen', color: 0, width: 4, colors: [], board: null, canUndo: false, canRedo: false };
let drawing = false;
let drawHotkey = 'Ctrl+Shift+D';
let orientation = 'horizontal';
let openGroup = null;

// Buttons whose tooltip comes from the i18n table: [element, key].
const titled = [];

function button(icon, titleKey, onClick, extraClass) {
  const b = document.createElement('button');
  b.className = 'btn' + (extraClass ? ' ' + extraClass : '');
  b.innerHTML = ICONS[icon] + (KEYS[icon] ? `<b class="key">${KEYS[icon]}</b>` : '');
  b.addEventListener('click', onClick);
  if (titleKey) titled.push([b, titleKey]);
  return b;
}

function groupButton(name, onClick, menuFor) {
  const b = document.createElement('button');
  b.className = 'btn more';
  b.dataset.group = menuFor || name;
  b.addEventListener('click', onClick);
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    toggleFlyout(menuFor || name, b);
  });
  return b;
}

// ---------- tools ----------

const toolButtons = {};
const groupButtons = {};

function toolGroupButton(name) {
  const b = groupButton(name, () => {
    const g = GROUPS[name];
    if (drawing && state.tool === g.current) toggleFlyout(name, b);
    else send('tool', g.current);
  });
  groupButtons[name] = b;
  return b;
}

for (const tool of ['pen', 'marker']) toolButtons[tool] = button(tool, tool, () => send('tool', tool));
for (const tool of ['text', 'eraser']) toolButtons[tool] = button(tool, tool, () => send('tool', tool));
$('tools').append(
  toolButtons.pen,
  toolButtons.marker,
  toolGroupButton('shapes'),
  toolButtons.text,
  toolButtons.eraser,
  toolGroupButton('pointers'),
);

// ---------- actions ----------

const undoBtn = button('undo', 'undo', () => send('undo'));
const redoBtn = button('redo', 'redo', () => send('redo'));
const boardsBtn = groupButton('boards', () => toggleFlyout('boards', boardsBtn));
boardsBtn.innerHTML = ICONS.boards;
titled.push([boardsBtn, 'boards']);
const menuBtn = groupButton('menu', () => toggleFlyout('menu', menuBtn));
menuBtn.innerHTML = ICONS.menu;
titled.push([menuBtn, 'menu']);
$('actions').append(
  undoBtn,
  redoBtn,
  button('clear', 'clear', () => send('clear')),
  boardsBtn,
  button('minimize', 'minimize', minimize),
  menuBtn,
);
titled.push([$('grip'), 'grip'], [bubble, 'bubble']);

modeBtn.addEventListener('click', () => invoke('set_drawing', { drawing: !drawing }));

widthBtn.addEventListener('click', () => {
  const next = WIDTH_PRESETS.find((w) => w > state.width) ?? WIDTH_PRESETS[0];
  send('width', next);
});
widthBtn.addEventListener('wheel', (e) => {
  e.preventDefault();
  send('width', state.width - Math.sign(e.deltaY));
}, { passive: false });

// ---------- flyout ----------

function flyoutItems(name) {
  const pick = (fn) => () => { fn(); closeFlyout(); };
  if (GROUPS[name]) {
    return GROUPS[name].tools.map((tool) => {
      const b = button(tool, null, pick(() => send('tool', tool)));
      b.title = t(tool);
      b.classList.toggle('on', drawing && state.tool === tool);
      return b;
    });
  }
  if (name === 'boards') {
    return ['white', 'black'].map((kind) => {
      const b = button('board', null, pick(() => send('board', kind)), 'board-' + kind);
      b.insertAdjacentHTML('beforeend', `<b class="key">${KEYS[kind]}</b>`);
      b.title = t(kind);
      b.classList.toggle('on', state.board === kind);
      return b;
    });
  }
  // "More" menu
  const next = orientation === 'vertical' ? 'horizontal' : 'vertical';
  const flip = button(next, null, pick(() => {
    setOrientation(next);
    invoke('set_toolbar_orientation', { orientation: next });
  }));
  flip.title = t(next);
  const quit = button('close', null, () => invoke('quit'));
  quit.title = t('quit');
  const skale = document.createElement('button');
  skale.className = 'btn skale';
  skale.innerHTML = '<img src="skaleclub.png" alt="">';
  skale.title = t('madeBy');
  skale.addEventListener('click', pick(() => invoke('open_site')));
  return [flip, skale, quit];
}

function toggleFlyout(name, anchor) {
  if (openGroup === name) return closeFlyout();
  openGroup = name;
  flyout.replaceChildren(...flyoutItems(name));
  flyout.style.display = 'flex';
  const a = anchor.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  if (orientation === 'vertical') {
    flyout.style.left = p.right + 6 + 'px';
    flyout.style.top = a.top - 5 + 'px';
  } else {
    flyout.style.left = a.left - 5 + 'px';
    flyout.style.top = p.bottom + 6 + 'px';
  }
  fitWindow();
}

function closeFlyout() {
  if (!openGroup) return;
  openGroup = null;
  flyout.style.display = 'none';
  fitWindow();
}

document.addEventListener('mousedown', (e) => {
  if (openGroup && !flyout.contains(e.target) && !e.target.closest(`[data-group="${openGroup}"]`)) closeFlyout();
}, true);
window.addEventListener('blur', closeFlyout);

// ---------- rendering ----------

function renderColors() {
  const box = $('colors');
  box.innerHTML = '';
  state.colors.forEach((c, i) => {
    const s = document.createElement('button');
    s.className = 'swatch' + (i === state.color ? ' on' : '');
    s.style.background = c;
    s.title = t('color', { n: i + 1 });
    s.addEventListener('click', () => send('color', i));
    box.append(s);
  });
}

function render() {
  for (const [el, key] of titled) el.title = t(key);
  modeBtn.classList.toggle('on', drawing);
  modeBtn.innerHTML = drawing ? `${ICONS.pen}<span>${t('drawing')}</span>` : `${ICONS.mouse}<span>${t('mouse')}</span>`;
  modeBtn.title = t('modeTitle', { key: drawHotkey });
  bubble.classList.toggle('on', drawing);
  for (const [tool, b] of Object.entries(toolButtons)) b.classList.toggle('on', drawing && tool === state.tool);
  for (const [name, b] of Object.entries(groupButtons)) {
    const g = GROUPS[name];
    b.innerHTML = ICONS[g.current] + `<b class="key">${KEYS[g.current]}</b>`;
    b.title = `${t(g.current)} · ${t('more')}`;
    b.classList.toggle('on', drawing && g.tools.includes(state.tool));
  }
  boardsBtn.classList.toggle('on', !!state.board);
  const dot = widthBtn.firstElementChild;
  const d = Math.round(Math.min(22, 4 + state.width * 0.9));
  dot.style.width = dot.style.height = d + 'px';
  dot.style.background = state.colors[state.color] || '#fff';
  widthBtn.title = t('width', { n: state.width });
  undoBtn.disabled = !state.canUndo;
  redoBtn.disabled = !state.canRedo;
}

// ---------- window size: bar (+ open flyout) or bubble ----------

function fitWindow() {
  const mini = document.body.classList.contains('mini');
  const parts = mini ? [bubble] : openGroup ? [pill, flyout] : [pill];
  let right = 0, bottom = 0;
  for (const el of parts) {
    const r = el.getBoundingClientRect();
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  invoke('set_toolbar_size', { width: Math.ceil(right) + 12, height: Math.ceil(bottom) + 12 });
}

function setOrientation(o) {
  orientation = o === 'vertical' ? 'vertical' : 'horizontal';
  document.body.classList.toggle('vertical', orientation === 'vertical');
  closeFlyout();
  fitWindow();
}

function minimize() {
  closeFlyout();
  document.body.classList.add('mini');
  fitWindow();
}

function restore() {
  document.body.classList.remove('mini');
  fitWindow();
}

// Bubble: a click restores the bar, a drag moves the window.
let press = null;
bubble.addEventListener('mousedown', (e) => {
  if (e.button === 0) press = { x: e.screenX, y: e.screenY };
});
bubble.addEventListener('mousemove', (e) => {
  if (press && Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4) {
    press = null;
    appWindow.startDragging();
  }
});
bubble.addEventListener('mouseup', () => {
  if (press) restore();
  press = null;
});

// Shortcuts typed while the bar has focus go to the drawing layer.
window.addEventListener('keydown', (e) => {
  if (['Shift', 'Control', 'Alt', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  if (e.key === 'Escape' && openGroup) return closeFlyout();
  emit('cmd', { action: 'key', key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey });
});

listen('state', ({ payload }) => {
  const colorsChanged = JSON.stringify(payload.colors) !== JSON.stringify(state.colors);
  state = payload;
  for (const g of Object.values(GROUPS)) if (g.tools.includes(state.tool)) g.current = state.tool;
  if (colorsChanged) renderColors();
  else document.querySelectorAll('.swatch').forEach((s, i) => s.classList.toggle('on', i === state.color));
  render();
});
listen('mode', ({ payload }) => {
  drawing = payload;
  render();
});
listen('language', ({ payload }) => {
  setLanguage(payload);
  closeFlyout();
  renderColors();
  render();
  // Labels change length, so the bar may need another width.
  requestAnimationFrame(fitWindow);
});

(async () => {
  try {
    const config = await invoke('get_config');
    setLanguage(config.language);
    drawHotkey = config.drawHotkey;
    state.colors = config.colors;
    state.width = config.width;
    orientation = config.toolbarOrientation;
  } catch (_) { /* keep defaults */ }
  document.body.classList.toggle('vertical', orientation === 'vertical');
  drawing = await invoke('get_mode');
  renderColors();
  render();
  send('sync');
  requestAnimationFrame(fitWindow);
})();
