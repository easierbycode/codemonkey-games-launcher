export const GAME_GENIE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Game Genie</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0d1a;
      --panel: #151a2e;
      --panel-2: #1d2440;
      --accent: #e4000f;
      --accent-2: #ffb300;
      --on: #22c55e;
      --off: #4b5563;
      --text: #f4f6ff;
      --text-dim: #9aa3c7;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      background: radial-gradient(circle at 30% 0%, #1a1f3f 0%, var(--bg) 60%) fixed;
      color: var(--text);
      font-family: 'Orbitron', system-ui, sans-serif;
      overflow: hidden;
    }
    body {
      display: flex;
      flex-direction: column;
      padding: 32px clamp(24px, 6vw, 80px);
      gap: 24px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .title {
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 900;
      letter-spacing: 0.08em;
      margin: 0;
      text-transform: uppercase;
    }
    .title span {
      color: var(--accent);
    }
    .subtitle {
      color: var(--text-dim);
      font-size: 14px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin: 4px 0 0;
    }
    button {
      font-family: inherit;
      cursor: pointer;
    }
    .back {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--text-dim);
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 13px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.15s ease;
    }
    .back:hover, .back:focus {
      border-color: var(--accent);
      color: var(--accent);
      outline: none;
    }
    main {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 18px;
      align-content: start;
      padding: 4px;
    }
    .mod-card {
      background: linear-gradient(160deg, var(--panel) 0%, var(--panel-2) 100%);
      border: 1px solid #2a3252;
      border-radius: 12px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
      overflow: hidden;
    }
    .mod-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--accent);
    }
    .mod-card h2 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.05em;
    }
    .mod-card p {
      margin: 0;
      color: var(--text-dim);
      font-size: 14px;
      line-height: 1.5;
      font-family: system-ui, sans-serif;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
    }
    .status-pill {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 6px 12px;
      border-radius: 99px;
      background: var(--off);
      color: #fff;
      transition: background 0.2s ease;
    }
    .status-pill.on {
      background: var(--on);
    }
    .toggle-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 13px;
      transition: filter 0.15s ease, transform 0.05s ease;
    }
    .toggle-btn:hover, .toggle-btn:focus {
      filter: brightness(1.15);
      outline: none;
    }
    .toggle-btn:active {
      transform: translateY(1px);
    }
    .toggle-btn.on {
      background: var(--off);
    }
    .hint {
      font-family: system-ui, sans-serif;
      color: var(--text-dim);
      font-size: 12px;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1 class="title"><span>Game</span> Genie</h1>
      <p class="subtitle">Mods &amp; cheats for your library</p>
    </div>
    <button class="back" id="back-btn">‹ Back to Launcher</button>
  </header>

  <main id="mods">
    <article class="mod-card" data-mod="voxel-3d">
      <div>
        <h2>2D → 3D Voxel</h2>
        <p>Renders any game as a tilted field of colored 3D voxel cubes. Applies to every game you launch while enabled.</p>
      </div>
      <div class="toggle-row">
        <span class="status-pill" data-status>Off</span>
        <button class="toggle-btn" data-toggle>Enable</button>
      </div>
    </article>
  </main>

  <p class="hint">Toggle takes effect the next time you launch a game. Press <kbd>Esc</kbd> or click Back to return.</p>

  <script>
    (function () {
      const MOD_KEYS = {
        'voxel-3d': 'cmg_mod_voxel_3d',
      };

      function isOn(modId) {
        try {
          return localStorage.getItem(MOD_KEYS[modId]) === '1';
        } catch (_) {
          return false;
        }
      }

      function setOn(modId, on) {
        try {
          if (on) localStorage.setItem(MOD_KEYS[modId], '1');
          else localStorage.removeItem(MOD_KEYS[modId]);
        } catch (_) { /* ignore */ }
      }

      function render(card) {
        const modId = card.dataset.mod;
        const on = isOn(modId);
        const pill = card.querySelector('[data-status]');
        const btn = card.querySelector('[data-toggle]');
        if (pill) {
          pill.textContent = on ? 'On' : 'Off';
          pill.classList.toggle('on', on);
        }
        if (btn) {
          btn.textContent = on ? 'Disable' : 'Enable';
          btn.classList.toggle('on', on);
        }
      }

      const cards = Array.from(document.querySelectorAll('.mod-card'));
      cards.forEach((card) => {
        render(card);
        const btn = card.querySelector('[data-toggle]');
        btn?.addEventListener('click', () => {
          const modId = card.dataset.mod;
          setOn(modId, !isOn(modId));
          render(card);
        });
      });

      function exitToLauncher() {
        try {
          parent.postMessage({ cmg: 'osd', action: 'exit' }, location.origin);
        } catch (_) { /* ignore */ }
      }

      document.getElementById('back-btn')?.addEventListener('click', exitToLauncher);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          exitToLauncher();
        }
      });
    })();
  </script>
</body>
</html>
`;
