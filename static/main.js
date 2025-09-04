const coverflowEl = document.getElementById('coverflow');
const gameframe = document.getElementById('gameframe');
const zipInput = document.getElementById('zip-input');
const addZipBtn = document.getElementById('add-zip');
const addGithubBtn = document.getElementById('add-github');
const osd = document.getElementById('osd');
const osdClose = document.getElementById('osd-close');
const captureThumbBtn = document.getElementById('capture-thumb');
const controllerConfigBtn = document.getElementById('controller-config');
const exitGameBtn = document.getElementById('exit-game');
const clearStorageBtn = document.getElementById('clear-storage');
const reloadPageBtn = document.getElementById('reload-page');
const osdTitle = document.getElementById('osd-title');

let games = [];
let focusedIndex = 0;
let currentGame = null;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

async function fetchGames() {
  const res = await fetch('/api/games');
  games = await res.json();
  renderCoverflow();
}

function placeholderCard(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 360; canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#121528';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e4000f';
  ctx.fillRect(0, 0, 24, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const wrapped = wrapText(ctx, name.toUpperCase(), 40, canvas.height - 24, canvas.width - 60, 34);
  wrapped.forEach((line, i) => {
    ctx.fillText(line, 40, canvas.height - 24 - (wrapped.length - 1 - i) * 34);
  });
  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, _x, _y, maxWidth, _lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(-4);
}

function renderCoverflow() {
  coverflowEl.innerHTML = '';
  const container = el('div', 'coverflow-container');
  const track = el('div', 'coverflow-track');
  container.appendChild(track);
  coverflowEl.appendChild(container);

  games.forEach((g, i) => {
    const card = el('div', 'card dim');
    card.dataset.index = String(i);
    const title = el('div', 'label', g.name);
    const bg = g.hasThumbnail ? `${g.urlPath}thumbnail.png` : placeholderCard(g.name);
    card.style.backgroundImage = `url(${bg})`;
    card.appendChild(title);
    card.addEventListener('click', () => focusIndex(i, true));
    track.appendChild(card);
  });
  focusIndex(focusedIndex, false);
}

function updateCardTransforms() {
  const cards = Array.from(document.querySelectorAll('.card'));
  cards.forEach((c, i) => {
    c.classList.remove('left', 'right', 'focus', 'dim');
    if (i === focusedIndex) {
      c.classList.add('focus');
    } else if (i < focusedIndex) {
      c.classList.add('left', 'dim');
    } else {
      c.classList.add('right', 'dim');
    }
  });
}

function focusIndex(i, open) {
  if (!games.length) return;
  focusedIndex = Math.max(0, Math.min(games.length - 1, i));
  updateCardTransforms();
  if (open) openGame(games[focusedIndex]);
}

function openGame(game) {
  gameframe.src = game.urlPath + 'index.html';
  document.body.classList.add('playing');
  currentGame = game;
  // Update exit button text with current game name
  exitGameBtn.textContent = `Exit ${game.name}`;
  // Fullscreen the root so OSD (sibling overlay) remains visible in fullscreen
  const root = document.documentElement;
  const req = root.requestFullscreen?.bind(root)
    || document.body?.webkitRequestFullscreen?.bind(document.body)
    || root.webkitRequestFullscreen?.bind(root)
    || root.mozRequestFullScreen?.bind(root)
    || root.msRequestFullscreen?.bind(root);
  try { req && req(); } catch {}
  // Bind key handlers inside iframe once loaded so Shift+ArrowDown works while focused in-game
  gameframe.addEventListener('load', bindIframeKeys, { once: true });
}

function exitGame() {
  gameframe.src = 'about:blank';
  document.body.classList.remove('playing');
  currentGame = null;
  // Reset exit button text
  exitGameBtn.textContent = 'Exit game';
  const d = document;
  if (document.fullscreenElement) {
    const exit = document.exitFullscreen?.bind(document)
      || d.webkitExitFullscreen?.bind(d)
      || d.mozCancelFullScreen?.bind(d)
      || d.msExitFullscreen?.bind(d);
    try {
      const p = exit && exit();
      // Avoid unhandled rejection when not in fullscreen
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }
}

// Keyboard navigation and OSD
function isOSDKey(e) {
  const k = e.key;
  // Support ` and ~ and Backquote code (keyCode 192)
  return k === '`' || k === '~' || e.code === 'Backquote' || e.keyCode === 192;
}

const globalKeyHandler = (e) => {
  if (e.key === 'ArrowLeft') { focusIndex(focusedIndex - 1, false); }
  if (e.key === 'ArrowRight') { focusIndex(focusedIndex + 1, false); }
  if ((e.key === 'Enter' || e.key === ' ') && !document.body.classList.contains('playing')) {
    e.preventDefault();
    focusIndex(focusedIndex, true); // Launch currently focused game
  }
  // Open OSD in both launcher (limited) and in-game (full)
  if (isOSDKey(e)) { e.preventDefault(); toggleOSD(true); }
  if (e.key === 'Escape' && document.body.classList.contains('playing')) {
    exitGame();
  }
};

window.addEventListener('keydown', globalKeyHandler, { capture: true });
document.addEventListener('keydown', globalKeyHandler, { capture: true });

// Gamepad handling is now done by gamepad-support.js

function toggleOSD(show) {
  osd.classList.toggle('hidden', !show);
  // Limited menu when not playing: only show Controller Layout and Close
  const limited = !document.body.classList.contains('playing');
  captureThumbBtn.style.display = limited ? 'none' : '';
  exitGameBtn.style.display = limited ? 'none' : '';
  // Limited-only options
  if (clearStorageBtn) clearStorageBtn.style.display = limited ? '' : 'none';
  if (reloadPageBtn) reloadPageBtn.style.display = limited ? '' : 'none';
  // Title
  if (osdTitle) {
    osdTitle.textContent = limited ? 'Global OSD' : `Game OSD (${currentGame?.name || 'Game'})`;
  }
}
osdClose.addEventListener('click', () => toggleOSD(false));
controllerConfigBtn.addEventListener('click', () => {
  if (window.openControllerConfig) {
    window.openControllerConfig();
  } else {
    alert('Controller configuration not available. Please ensure gamepad-support.js is loaded.');
  }
});
exitGameBtn.addEventListener('click', () => { exitGame(); toggleOSD(false); });

// Limited OSD actions
if (clearStorageBtn) {
  clearStorageBtn.addEventListener('click', () => {
    if (confirm('Clear all localStorage for this launcher? This resets controller mappings and preferences.')) {
      try { localStorage.clear(); } catch {}
      alert('Local storage cleared.');
    }
  });
}
if (reloadPageBtn) {
  reloadPageBtn.addEventListener('click', () => {
    location.reload();
  });
}

// Capture thumbnail.png from in-game canvas if possible
captureThumbBtn.addEventListener('click', async () => {
  const game = games[focusedIndex];
  if (!game) return;
  try {
    const dataUrl = await captureIframeCanvas(gameframe);
    if (!dataUrl) throw new Error('No canvas found');
    const blob = await (await fetch(dataUrl)).blob();
    const buf = await blob.arrayBuffer();
    const res = await fetch(`/api/games/${game.id}/thumbnail`, { method: 'POST', body: buf });
    if (res.ok) {
      await fetchGames();
      toggleOSD(false);
    } else {
      throw new Error('Upload failed');
    }
  } catch (err) {
    console.error(err);
    alert('Could not capture thumbnail; ensure the game uses a <canvas> element.');
  }
});

async function captureIframeCanvas(iframe) {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const canvas = doc.querySelector('canvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}

// Add Game (ZIP)
addZipBtn.addEventListener('click', () => zipInput.click());
zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) return;
  const name = prompt('Game name (folder-friendly):', file.name.replace(/\.zip$/i, '')) || 'game';
  const subdir = prompt('Game location: root, dist, or docs?', 'root') || 'root';
  const form = new FormData();
  form.set('file', file);
  form.set('name', name);
  form.set('subdir', subdir);
  const res = await fetch('/api/add-game/from-zip', { method: 'POST', body: form });
  if (res.ok) {
    const data = await res.json();
    await fetchGames();
    const idx = games.findIndex((g) => g.id === data.id);
    focusIndex(idx === -1 ? 0 : idx, false); // Focus but don't auto-launch
    alert(`Game "${name}" added successfully! Click on it to launch.`);
  } else {
    alert('Upload failed');
  }
  zipInput.value = '';
});

// Add Game (GitHub)
addGithubBtn.addEventListener('click', async () => {
  const repo = prompt('GitHub repo URL (e.g., https://github.com/user/repo):');
  if (!repo) return;
  const branch = prompt('Branch (default: main):', 'main') || 'main';
  const subdir = prompt('Game location: root, dist, or docs?', 'root') || 'root';
  const name = prompt('Game name (optional):', '') || undefined;
  const res = await fetch('/api/add-game/from-github', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo, branch, subdir, name }),
  });
  if (res.ok) {
    const data = await res.json();
    await fetchGames();
    const idx = games.findIndex((g) => g.id === data.id);
    focusIndex(idx === -1 ? 0 : idx, false); // Focus but don't auto-launch
    const gameName = name || repo.split('/').pop() || 'game';
    alert(`Game "${gameName}" added successfully! Click on it to launch.`);
  } else {
    alert('Download failed');
  }
});

// Initial load
fetchGames();

// Expose to gamepad system
window.focusIndex = focusIndex;
Object.defineProperty(window, 'focusedIndex', {
  get: () => focusedIndex,
  set: (value) => { focusedIndex = value; }
});
window.toggleOSD = toggleOSD;

// Attach Shift+ArrowDown handler inside iframe (same-origin games)
function bindIframeKeys() {
  try {
    const w = gameframe.contentWindow; const d = gameframe.contentDocument;
    if (!w || !d) return;
    const handler = (e) => {
      if (isOSDKey(e)) {
        e.preventDefault();
        toggleOSD(true);
      }
      if (e.key === 'Escape') {
        exitGame();
      }
    };
    // Capture phase increases chance to catch before game handlers stopPropagation
    d.addEventListener('keydown', handler, { capture: true });
    w.addEventListener('keydown', handler, { capture: true });
  } catch {
    // Cross-origin or access error; ignore
  }
}

// Listen for OSD postMessage from injected script inside game pages
window.addEventListener('message', (ev) => {
  if (!ev.data) return;
  // Accept only from the active gameframe
  if (ev.source !== gameframe.contentWindow) return;
  const msg = ev.data;
  if (msg.cmg === 'osd') {
    if (msg.action === 'open') toggleOSD(true);
    if (msg.action === 'exit') exitGame();
  }
});
