// Disable right-click/context menu globally in the launcher UI
try {
  const __cmHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    return false;
  };
  window.addEventListener('contextmenu', __cmHandler, true);
  document.addEventListener('contextmenu', __cmHandler, true);
} catch {}

const gridEl = document.getElementById('grid');
const qInput = document.getElementById('q');
const sortSel = document.getElementById('sort');
const viewSel = document.getElementById('view');
const countEl = document.getElementById('count');

const playerShell = document.getElementById('player-shell');
const nowPlayingTitle = document.getElementById('now-playing-title');
const playerExitBtn = document.getElementById('player-exit');
const playerOSDBtn = document.getElementById('player-osd');

const gameframe = document.getElementById('gameframe');
const zipInput = document.getElementById('zip-input');
const addZipBtn = document.getElementById('add-zip');
const addGithubBtn = document.getElementById('add-github');
const addZipMenu = document.getElementById('add-zip-menu');

const osd = document.getElementById('osd');
const osdClose = document.getElementById('osd-close');
const captureThumbBtn = document.getElementById('capture-thumb');
const controllerConfigBtn = document.getElementById('controller-config');
const exitGameBtn = document.getElementById('exit-game');
const clearStorageBtn = document.getElementById('clear-storage');
const reloadPageBtn = document.getElementById('reload-page');
const osdTitle = document.getElementById('osd-title');
const recommendedButtonsEl = document.getElementById('recommended-buttons');

const gameMenu = document.getElementById('game-menu');
const gameMenuTitle = document.getElementById('game-menu-title');
const updateGameBtn = document.getElementById('update-game-btn');
const deleteGameBtn = document.getElementById('delete-game-btn');
const cancelBtn = document.getElementById('cancel-btn');

let allGames = [];
let games = [];
let focusedIndex = 0;
let selectedGameId = null;
let currentGame = null;

function getRecommendedButtonList(recommended) {
  if (!recommended) return [];
  if (Array.isArray(recommended)) return recommended;
  if (Array.isArray(recommended.buttons)) return recommended.buttons;
  return [];
}

function notifyGamepadManagerOfGameChange(game) {
  try {
    if (window.gamepadManager && typeof window.gamepadManager.onLauncherGameChanged === 'function') {
      window.gamepadManager.onLauncherGameChanged(game || null);
    }
  } catch (err) {
    console.warn('Failed to notify gamepad system of game change', err);
  }
}

function placeholderCard(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 480;
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
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(-4);
}

async function fetchGames() {
  try {
    const res = await fetch('/api/games');
    const data = await res.json();
    allGames = Array.isArray(data) ? data : (Array.isArray(data.games) ? data.games : []);
  } catch (err) {
    console.error('Failed to load games', err);
    gridEl.innerHTML = '<p class="no-games">Failed to load games.</p>';
    countEl.textContent = '0';
    games = [];
    selectedGameId = null;
    return;
  }
  renderGames({ preserveSelection: true });
}

function sortGames(list) {
  const mode = sortSel?.value || 'az';
  if (mode === 'za') return list.sort((a, b) => b.name.localeCompare(a.name));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function filterGames() {
  const query = (qInput?.value || '').trim().toLowerCase();
  const base = sortGames([...allGames]);
  if (!query) return base;
  return base.filter((g) => g.name.toLowerCase().includes(query));
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch] || ch));
}

function cardHTML(game, idx, cacheBust) {
  const cover = game.hasThumbnail ? `${game.urlPath}thumbnail.png?v=${cacheBust}` : placeholderCard(game.name);
  const source = game.sourceInfo?.source ? game.sourceInfo.source.toUpperCase() : 'LOCAL';
  const safeName = escapeHtml(game.name);
  return `
    <article class="card" data-idx="${idx}">
      <div class="thumb" data-play="${idx}">
        <img src="${cover}" alt="${safeName} cover" loading="lazy">
      </div>
      <div class="meta">
        <div class="row">
          <div class="name" title="${safeName}">${safeName}</div>
          <button class="kebab" data-menu="${idx}" aria-label="Open menu for ${safeName}">⋮</button>
        </div>
        <div class="row source">
          <span>${source}</span>
          <button class="play" data-play="${idx}" aria-label="Play ${safeName}">Play</button>
        </div>
      </div>
    </article>
  `;
}

function renderGames({ preserveSelection = false } = {}) {
  games = filterGames();
  countEl.textContent = String(games.length);
  gridEl.classList.toggle('list', viewSel?.value === 'list');

  if (!games.length) {
    gridEl.innerHTML = '<p class="no-games">No games found.</p>';
    focusedIndex = 0;
    selectedGameId = null;
    return;
  }

  const cacheBust = Date.now();
  gridEl.innerHTML = games.map((g, idx) => cardHTML(g, idx, cacheBust)).join('');

  if (!preserveSelection || !selectedGameId) {
    focusedIndex = Math.min(focusedIndex, games.length - 1);
    selectedGameId = games[focusedIndex]?.id || games[0].id;
  } else {
    const idx = games.findIndex((g) => g.id === selectedGameId);
    focusedIndex = idx === -1 ? 0 : idx;
    selectedGameId = games[focusedIndex]?.id || selectedGameId;
  }

  applyFocus();
}

function applyFocus(scroll = false) {
  const cards = Array.from(gridEl.querySelectorAll('.card'));
  cards.forEach((card, idx) => {
    const isFocus = idx === focusedIndex;
    card.classList.toggle('focus', isFocus);
    if (isFocus && scroll) {
      try { card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch {}
    }
  });
}

function getColumnCount() {
  const card = gridEl.querySelector('.card');
  if (!card) return 1;
  const cardWidth = card.getBoundingClientRect().width || 1;
  const gridWidth = gridEl.getBoundingClientRect().width || cardWidth;
  return Math.max(1, Math.round(gridWidth / cardWidth));
}

function focusIndex(i, open, scroll = true) {
  if (!games.length) return;
  focusedIndex = Math.max(0, Math.min(games.length - 1, i));
  selectedGameId = games[focusedIndex]?.id || null;
  applyFocus(scroll);
  if (open) openGame(games[focusedIndex]);
}

function openGame(game) {
  if (!game) return;
  const target = `${game.urlPath}index.html`;
  gameframe.src = target;
  currentGame = game;
  selectedGameId = game.id;
  document.body.classList.add('playing');
  document.documentElement.classList.add('playing');
  playerShell.classList.remove('hidden');
  playerShell.classList.add('visible');
  if (nowPlayingTitle) nowPlayingTitle.textContent = game.name;
  notifyGamepadManagerOfGameChange(game);
  exitGameBtn.textContent = `Exit ${game.name}`;
  const root = document.documentElement;
  const req = root.requestFullscreen?.bind(root)
    || document.body?.webkitRequestFullscreen?.bind(document.body)
    || root.webkitRequestFullscreen?.bind(root)
    || root.mozRequestFullScreen?.bind(root)
    || root.msRequestFullscreen?.bind(root);
  try { req && req(); } catch {}
  gameframe.addEventListener('load', bindIframeKeys, { once: true });
}

function exitGame() {
  gameframe.src = 'about:blank';
  document.body.classList.remove('playing');
  document.documentElement.classList.remove('playing');
  playerShell.classList.add('hidden');
  playerShell.classList.remove('visible');
  notifyGamepadManagerOfGameChange(null);
  currentGame = null;
  exitGameBtn.textContent = 'Exit game';
  try {
    if (document.fullscreenElement) {
      const d = document;
      const exit = d.exitFullscreen?.bind(d)
        || d.webkitExitFullscreen?.bind(d)
        || d.mozCancelFullScreen?.bind(d)
        || d.msExitFullscreen?.bind(d);
      const p = exit && exit();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch {}
}

function isOSDKey(e) {
  const k = e.key;
  return k === '`' || k === '~' || e.code === 'Backquote' || e.keyCode === 192;
}

const globalKeyHandler = (e) => {
  const playing = document.body.classList.contains('playing');
  const tag = (e.target?.tagName || '').toLowerCase();
  const isFormField = e.target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  if (!playing && !isFormField) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusIndex(focusedIndex - 1, false, true); }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusIndex(focusedIndex + 1, false, true); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusIndex(focusedIndex - getColumnCount(), false, true); }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIndex(focusedIndex + getColumnCount(), false, true); }
    if ((e.key === 'Enter' || e.key === ' ') && !playing) {
      e.preventDefault();
      focusIndex(focusedIndex, true);
    }
  }
  if (isOSDKey(e)) { e.preventDefault(); toggleOSD(true); }
  if (e.key === 'Escape' && playing) {
    exitGame();
  }
};

window.addEventListener('keydown', globalKeyHandler, { capture: true });

function toggleOSD(show) {
  osd.classList.toggle('hidden', !show);
  const global = !document.body.classList.contains('playing');
  captureThumbBtn.style.display = global ? 'none' : '';
  exitGameBtn.style.display = global ? 'none' : '';
  if (clearStorageBtn) clearStorageBtn.style.display = global ? '' : 'none';
  if (reloadPageBtn) reloadPageBtn.style.display = global ? '' : 'none';

  if (osdTitle) {
    osdTitle.textContent = global ? 'Global OSD' : `Game OSD (${currentGame?.name || 'Game'})`;
  }

  recommendedButtonsEl.innerHTML = '';
  if (!global) {
    const recommended = getRecommendedButtonList(currentGame?.recommendedButtons);
    if (recommended.length) {
      for (const btn of recommended) {
        const buttonEl = document.createElement('button');
        buttonEl.textContent = btn.label;
        buttonEl.addEventListener('click', () => {
          try {
            gameframe.contentWindow?.postMessage({
              cmg: 'map_button',
              mapsTo: btn.mapsTo,
              elementId: btn.elementId,
            }, location.origin);
          } catch (err) {
            console.error('Failed to post message to game iframe', err);
          }
          toggleOSD(false);
        });
        recommendedButtonsEl.appendChild(buttonEl);
      }
    }

    try {
      if (gameframe.contentWindow) {
        gameframe.contentWindow.postMessage({ cmg: 'cursor', visible: !!show }, location.origin);
        gameframe.contentWindow.postMessage({ cmg: 'input', blocked: !!show }, location.origin);
      }
    } catch {}
  }
}

osdClose.addEventListener('click', () => toggleOSD(false));
playerOSDBtn?.addEventListener('click', () => toggleOSD(true));

controllerConfigBtn.addEventListener('click', () => {
  if (window.openControllerConfig) {
    window.openControllerConfig();
  } else {
    alert('Controller configuration not available. Please ensure gamepad-support.js is loaded.');
  }
});
exitGameBtn.addEventListener('click', () => { exitGame(); toggleOSD(false); });
playerExitBtn?.addEventListener('click', () => exitGame());

if (clearStorageBtn) {
  clearStorageBtn.addEventListener('click', () => {
    if (confirm('Clear all localStorage for this launcher? This resets controller mappings and preferences.')) {
      try { localStorage.clear(); } catch {}
      alert('Local storage cleared.');
    }
  });
}
if (reloadPageBtn) {
  reloadPageBtn.addEventListener('click', () => { location.reload(); });
}

captureThumbBtn.addEventListener('click', async () => {
  const game = (document.body.classList.contains('playing') && currentGame) ? currentGame : games[focusedIndex];
  if (!game) return;
  try {
    const dataUrl = await captureIframeCanvas(gameframe);
    if (!dataUrl) throw new Error('No content found to capture');
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
    alert('Could not capture thumbnail.');
  }
});

async function captureIframeCanvas(iframe) {
  const doc = iframe.contentDocument;
  if (!doc) return null;

  const canvases = Array.from(doc.querySelectorAll('canvas'));
  const visible = canvases.filter((c) => (c.offsetWidth > 0 && c.offsetHeight > 0));
  const pickFrom = visible.length ? visible : canvases;
  const target = pickFrom.sort((a, b) => (a.width * a.height) - (b.width * b.height)).pop();

  if (target) {
    const w = target.width || target.offsetWidth;
    const h = target.height || target.offsetHeight;
    if (!w || !h) return null;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(target, 0, 0, w, h);
      return off.toDataURL('image/png');
    } catch (e) {
      try { return target.toDataURL('image/png'); } catch { /* continue to html2canvas */ }
    }
  }

  if (typeof html2canvas === 'function') {
    try {
      const canvas = await html2canvas(doc.body, {
        allowTaint: true,
        useCORS: true,
        width: iframe.clientWidth,
        height: iframe.clientHeight,
        x: 0,
        y: 0,
        scrollX: -doc.documentElement.scrollLeft,
        scrollY: -doc.documentElement.scrollTop,
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('html2canvas failed:', e);
      return null;
    }
  }

  return null;
}

// Add Game (ZIP)
addZipBtn?.addEventListener('click', () => addZipMenu?.classList.remove('hidden'));
addZipMenu?.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-zip]');
  if (!actionEl) {
    if (e.target === addZipMenu) addZipMenu.classList.add('hidden');
    return;
  }
  const action = actionEl.getAttribute('data-zip');
  if (action === 'local') {
    zipInput.click();
  } else if (action === 'url') {
    handleAddUrl();
  }
  addZipMenu.classList.add('hidden');
});

zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) return;
  await handleZipFile(file);
  zipInput.value = '';
});

async function handleZipFile(file) {
  const name = prompt('Game name (folder-friendly):', file.name.replace(/\.zip$/i, '')) || 'game';
  const subdir = prompt('Game location: root, dist, or docs?', 'root') || 'root';
  const form = new FormData();
  form.set('file', file);
  form.set('name', name);
  form.set('subdir', subdir);
  const res = await fetch('/api/add-game/from-zip', { method: 'POST', body: form });
  if (res.ok) {
    const data = await res.json();
    selectedGameId = data.id;
    await fetchGames();
    const idx = games.findIndex((g) => g.id === data.id);
    focusIndex(idx === -1 ? 0 : idx, false);
    alert(`Game "${name}" added successfully! Click Play to launch.`);
  } else {
    alert('Upload failed');
  }
}

async function handleAddUrl() {
  const url = prompt('Game ZIP URL:');
  if (!url) return;
  const name = prompt('Game name (optional):', '') || undefined;
  const subdir = prompt('Game location: root, dist, or docs?', 'root') || 'root';
  const res = await fetch('/api/add-game/from-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, subdir, name }),
  });
  if (res.ok) {
    const data = await res.json();
    selectedGameId = data.id;
    await fetchGames();
    const idx = games.findIndex((g) => g.id === data.id);
    focusIndex(idx === -1 ? 0 : idx, false);
    const gameName = name || url.split('/').pop()?.replace(/\.zip$/, '') || 'game';
    alert(`Game "${gameName}" added successfully! Click Play to launch.`);
  } else {
    alert('Download failed');
  }
}

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
    selectedGameId = data.id;
    await fetchGames();
    const idx = games.findIndex((g) => g.id === data.id);
    focusIndex(idx === -1 ? 0 : idx, false);
    const gameName = name || repo.split('/').pop() || 'game';
    alert(`Game "${gameName}" added successfully! Click Play to launch.`);
  } else {
    alert('Download failed');
  }
});

// Grid interactions
gridEl.addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]');
  if (play) {
    const raw = Number(play.getAttribute('data-play'));
    const idx = Number.isFinite(raw) ? raw : 0;
    focusIndex(idx, true);
    return;
  }
  const menu = e.target.closest('[data-menu]');
  if (menu) {
    const raw = Number(menu.getAttribute('data-menu'));
    const idx = Number.isFinite(raw) ? raw : 0;
    focusIndex(idx, false);
    showGameMenu(games[Math.max(0, Math.min(games.length - 1, idx))]);
    return;
  }
  const card = e.target.closest('.card');
  if (card) {
    const raw = Number(card.getAttribute('data-idx'));
    const idx = Number.isFinite(raw) ? raw : 0;
    focusIndex(idx, true);
  }
});

qInput?.addEventListener('input', () => renderGames({ preserveSelection: true }));
sortSel?.addEventListener('change', () => renderGames({ preserveSelection: true }));
viewSel?.addEventListener('change', () => renderGames({ preserveSelection: true }));

function showGameMenu(game) {
  if (!game) return;
  const capitalizedName = game.name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  gameMenuTitle.textContent = capitalizedName;
  gameMenu.classList.remove('hidden');
  gameMenu.dataset.gameId = game.id;
  gameMenu.dataset.gameIndex = games.indexOf(game).toString();

  const isUpdatable = game.sourceInfo && (game.sourceInfo.source === 'github' || game.sourceInfo.source === 'url');
  updateGameBtn.style.display = isUpdatable ? '' : 'none';
}

function hideGameMenu() {
  gameMenu.classList.add('hidden');
  delete gameMenu.dataset.gameId;
  delete gameMenu.dataset.gameIndex;
}

async function deleteGame(gameId) {
  if (!confirm('Are you sure you want to delete this game? This action cannot be undone.')) return;
  try {
    const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchGames();
      alert('Game deleted successfully!');
    } else {
      throw new Error('Delete failed');
    }
  } catch (err) {
    console.error('Error deleting game:', err);
    alert('Failed to delete game. Please try again.');
  }
}

updateGameBtn.addEventListener('click', async () => {
  const gameId = gameMenu.dataset.gameId;
  if (!gameId) return;

  try {
    const res = await fetch(`/api/games/${gameId}/update`, { method: 'POST' });
    if (res.ok) {
      alert('Game updated successfully!');
      if (currentGame && currentGame.id === gameId) {
        gameframe.src = gameframe.src;
      }
      await fetchGames();
    } else {
      const errorText = await res.text();
      throw new Error(`Update failed: ${errorText}`);
    }
  } catch (err) {
    console.error('Error updating game:', err);
    alert(err.message);
  } finally {
    hideGameMenu();
  }
});

deleteGameBtn.addEventListener('click', () => {
  const gameId = gameMenu.dataset.gameId;
  if (gameId) deleteGame(gameId);
  hideGameMenu();
});

cancelBtn.addEventListener('click', hideGameMenu);
gameMenu.addEventListener('click', (e) => {
  if (e.target === gameMenu) hideGameMenu();
});

// Expose to gamepad system
window.focusIndex = focusIndex;
Object.defineProperty(window, 'focusedIndex', {
  get: () => focusedIndex,
  set: (value) => { focusedIndex = value; },
});
window.toggleOSD = toggleOSD;
window.showGameMenu = showGameMenu;
window.hideGameMenu = hideGameMenu;
Object.defineProperty(window, 'games', {
  get: () => games,
  set: (value) => { games = value; },
});
Object.defineProperty(window, 'currentGame', {
  get: () => currentGame,
  set: () => { /* ignore external mutation attempts */ },
});
window.getCurrentGame = () => currentGame;

function bindIframeKeys() {
  try {
    const w = gameframe.contentWindow;
    const d = gameframe.contentDocument;
    if (!w || !d) return;
    try {
      const docEl = d.documentElement;
      const bodyEl = d.body || d.querySelector('body');
      if (docEl) {
        docEl.style.overflow = 'hidden';
        docEl.style.height = '100%';
      }
      if (bodyEl) {
        bodyEl.style.overflow = 'hidden';
        bodyEl.style.height = '100%';
      }
    } catch {}
    const handler = (e) => {
      if (isOSDKey(e)) {
        e.preventDefault();
        toggleOSD(true);
      }
      if (e.key === 'Escape') {
        exitGame();
      }
    };
    d.addEventListener('keydown', handler, { capture: true });
    w.addEventListener('keydown', handler, { capture: true });
  } catch {
    // Cross-origin or access error; ignore
  }
}

window.addEventListener('message', (ev) => {
  if (!ev.data) return;
  if (ev.source !== gameframe.contentWindow) return;
  const msg = ev.data;
  if (msg.cmg === 'osd') {
    if (msg.action === 'open') toggleOSD(true);
    if (msg.action === 'exit') exitGame();
  }
});

// Heartbeat to keep the parent process alive
(function startHeartbeat() {
  const isLauncher = window.__CMG_LAUNCHER__ || (window.__CMG__ && window.__CMG__.launcher);
  if (!isLauncher && !location.port) {
    return;
  }

  const interval = 3000;
  setInterval(async () => {
    if (document.hidden) return;
    try {
      await fetch('/api/heartbeat', { method: 'POST', body: '{}' });
    } catch (e) {
      console.warn('Heartbeat failed.', e);
    }
  }, interval);
})();

// Initial load
fetchGames();
