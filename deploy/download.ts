// CodeMonkey Games Launcher — public download page.
//
// This is the ONLY thing deployed to Deno Deploy. It is intentionally a
// single, zero-dependency Deno server: no Fresh, no preact, no esm.sh, no
// build step. That keeps the deploy bulletproof (the old Fresh deploy kept
// breaking on esm.sh lockfile drift) and lets the page run instantly.
//
// Download links are resolved dynamically from the repo's GitHub Releases, so
// the page always points at the latest published binaries with no redeploy.

const REPO = Deno.env.get("GH_REPO") ?? "easierbycode/codemonkey-games-launcher";
const GH_TOKEN = Deno.env.get("GH_TOKEN") ?? Deno.env.get("GITHUB_TOKEN") ?? "";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const CACHE_TTL_MS = 5 * 60 * 1000; // GitHub unauthenticated API is 60 req/hr/IP.

type PlatformId = "macos" | "windows" | "linux";

interface AssetView {
  name: string;
  url: string;
  size: number;
  ext: string;
}

interface PlatformBucket {
  primary: AssetView | null;
  all: AssetView[];
}

interface Latest {
  tag: string;
  version: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  platforms: Record<PlatformId, PlatformBucket>;
  hasAnyAsset: boolean;
}

const PLATFORM_META: Record<
  PlatformId,
  { label: string; sub: string; icon: string }
> = {
  macos: { label: "macOS", sub: "Apple Silicon · .dmg", icon: "🍎" },
  windows: { label: "Windows", sub: "64-bit · .zip (.exe inside)", icon: "🪟" },
  linux: { label: "Linux / Kazeta", sub: "Kazeta bundle · .zip", icon: "🐧" },
};

// ---------------------------------------------------------------------------
// Release fetching (cached in-isolate)
// ---------------------------------------------------------------------------

let cache: { at: number; data: Latest | null } | null = null;

// Checksums, signatures and patch/metadata files are not user-facing
// downloads — keep them out of the buttons and the "other downloads" list.
const METADATA_EXT = new Set([
  "sha256",
  "sha256sum",
  "sha512",
  "sha1",
  "md5",
  "sig",
  "asc",
  "pem",
  "blockmap",
  "bsdiff",
  "txt",
  "json",
  "yml",
  "yaml",
]);

function isMetadataAsset(name: string): boolean {
  return METADATA_EXT.has(extOf(name));
}

function classify(name: string): PlatformId | null {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg") || n.endsWith(".pkg") || /\bmac(os)?\b/.test(n)) {
    return "macos";
  }
  if (n.endsWith(".exe") || n.includes("windows") || /\bwin(64|32)?\b/.test(n)) {
    return "windows";
  }
  if (n.includes("kazeta") || n.includes("linux")) return "linux";
  return null;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function pickPrimary(platform: PlatformId, assets: AssetView[]): AssetView | null {
  if (assets.length === 0) return null;
  const order: Record<PlatformId, string[]> = {
    macos: ["dmg", "pkg"],
    windows: ["zip", "exe"],
    linux: ["zip", "AppImage".toLowerCase(), "tar.gz"],
  };
  for (const ext of order[platform]) {
    const hit = assets.find((a) => a.ext === ext);
    if (hit) return hit;
  }
  return assets[0];
}

function emptyPlatforms(): Record<PlatformId, PlatformBucket> {
  return {
    macos: { primary: null, all: [] },
    windows: { primary: null, all: [] },
    linux: { primary: null, all: [] },
  };
}

async function fetchLatest(): Promise<Latest | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "codemonkey-games-launcher-download-page",
    "x-github-api-version": "2022-11-28",
  };
  if (GH_TOKEN) headers.authorization = `Bearer ${GH_TOKEN}`;

  let data: Latest | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers },
    );
    if (res.ok) {
      // deno-lint-ignore no-explicit-any
      const json: any = await res.json();
      const platforms = emptyPlatforms();
      for (const a of json.assets ?? []) {
        if (isMetadataAsset(a.name)) continue;
        const p = classify(a.name);
        if (!p) continue;
        platforms[p].all.push({
          name: a.name,
          url: a.browser_download_url,
          size: a.size ?? 0,
          ext: extOf(a.name),
        });
      }
      let hasAnyAsset = false;
      for (const key of Object.keys(platforms) as PlatformId[]) {
        platforms[key].primary = pickPrimary(key, platforms[key].all);
        if (platforms[key].all.length) hasAnyAsset = true;
      }
      const tag: string = json.tag_name ?? "";
      data = {
        tag,
        version: tag.replace(/^v/, ""),
        name: json.name || tag,
        htmlUrl: json.html_url || RELEASES_URL,
        publishedAt: json.published_at ?? "",
        platforms,
        hasAnyAsset,
      };
    } else {
      console.warn(`GitHub releases API returned ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to fetch latest release:", err);
  }

  // Cache even null/empty results briefly so a transient API failure or an
  // unauthenticated rate-limit does not hammer GitHub on every request.
  cache = { at: now, data };
  return data;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(n: number): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function detectOS(ua: string): PlatformId | null {
  const u = ua.toLowerCase();
  if (u.includes("windows")) return "windows";
  if (
    u.includes("mac os") || u.includes("macintosh") || u.includes("iphone") ||
    u.includes("ipad")
  ) {
    return "macos";
  }
  if (u.includes("linux") || u.includes("android") || u.includes("cros")) {
    return "linux";
  }
  return null;
}

function platformCard(
  id: PlatformId,
  bucket: PlatformBucket,
  recommended: boolean,
): string {
  const meta = PLATFORM_META[id];
  const has = !!bucket.primary;
  const href = has ? `/download/${id}` : RELEASES_URL;
  const sizeLabel = bucket.primary?.size
    ? `<span class="size">${formatBytes(bucket.primary.size)}</span>`
    : "";
  const extras = bucket.all
    .filter((a) => a !== bucket.primary)
    .slice(0, 4)
    .map(
      (a) =>
        `<a class="alt" href="${esc(a.url)}">.${esc(a.ext)} <span class="size">${
          formatBytes(a.size)
        }</span></a>`,
    )
    .join("");

  return `
    <div class="card${recommended ? " recommended" : ""}${has ? "" : " disabled"}">
      ${recommended ? `<div class="badge">Detected on your device</div>` : ""}
      <div class="card-icon" aria-hidden="true">${meta.icon}</div>
      <h3>${meta.label}</h3>
      <p class="sub">${meta.sub}</p>
      <a class="btn${has ? "" : " btn-muted"}" href="${esc(href)}"${
    has ? "" : ` title="No build published yet"`
  }>
        ${has ? "Download" : "View releases"} ${sizeLabel}
      </a>
      ${extras ? `<div class="alts">${extras}</div>` : ""}
    </div>`;
}

function renderPage(latest: Latest | null, detected: PlatformId | null): string {
  const versionBadge = latest?.version
    ? `<span class="pill">v${esc(latest.version)}</span>`
    : "";
  const dateLine = latest?.publishedAt
    ? `<span class="meta-dot">·</span><span>Released ${
      esc(formatDate(latest.publishedAt))
    }</span>`
    : "";

  let body: string;
  if (latest && latest.hasAnyAsset) {
    const order: PlatformId[] = ["macos", "windows", "linux"];
    // Put the detected OS first so the recommended card leads.
    order.sort((a, b) =>
      (b === detected ? 1 : 0) - (a === detected ? 1 : 0)
    );
    const cards = order
      .map((id) =>
        platformCard(id, latest.platforms[id], id === detected)
      )
      .join("");
    body = `<div class="cards">${cards}</div>`;
  } else {
    body = `
      <div class="empty">
        <p>No binaries are published yet${
      latest?.tag ? ` for <strong>${esc(latest.tag)}</strong>` : ""
    }.</p>
        <p>Builds are produced automatically by the release pipeline. Check back shortly, or browse all releases:</p>
        <a class="btn" href="${esc(RELEASES_URL)}">View all releases</a>
      </div>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Download · CodeMonkey Games Launcher</title>
<meta name="description" content="Download the CodeMonkey Games Launcher for macOS, Windows, and Linux/Kazeta. Always the latest version." />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#070912; --bg2:#0e1326; --fg:#eaf0ff; --muted:#8b95b8;
    --accent:#ff3d7f; --accent2:#22d3ee; --card:#11162b; --line:#222a47;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    font-family:'Orbitron',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    color:var(--fg); min-height:100vh;
    background:
      radial-gradient(1100px 600px at 50% -10%, rgba(34,211,238,.14), transparent 60%),
      radial-gradient(900px 500px at 85% 110%, rgba(255,61,127,.16), transparent 60%),
      linear-gradient(180deg,var(--bg),var(--bg2));
    display:flex; flex-direction:column; align-items:center;
    padding:48px 20px 64px;
  }
  .wrap{width:100%;max-width:920px}
  header{text-align:center;margin-bottom:40px}
  .logo{height:64px;width:auto;image-rendering:pixelated;margin-bottom:18px;filter:drop-shadow(0 0 18px rgba(34,211,238,.45))}
  h1{
    font-weight:900;letter-spacing:.04em;margin:0 0 6px;
    font-size:clamp(28px,5vw,46px);line-height:1.05;
    background:linear-gradient(90deg,var(--accent2),var(--fg) 55%,var(--accent));
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .tag{color:var(--muted);font-size:14px;font-weight:600;letter-spacing:.18em;text-transform:uppercase}
  .metaline{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;color:var(--muted);font-size:13px;flex-wrap:wrap}
  .pill{background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.45);color:var(--accent2);
        padding:3px 12px;border-radius:999px;font-weight:700;letter-spacing:.08em;font-size:12px}
  .meta-dot{opacity:.5}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:8px}
  .card{
    position:relative;background:linear-gradient(180deg,var(--card),#0c1124);
    border:1px solid var(--line);border-radius:16px;padding:26px 22px 24px;text-align:center;
    transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;
  }
  .card:hover{transform:translateY(-3px);border-color:rgba(34,211,238,.5)}
  .card.recommended{border-color:var(--accent);box-shadow:0 0 0 1px rgba(255,61,127,.35),0 18px 50px -20px rgba(255,61,127,.6)}
  .card.disabled{opacity:.6}
  .badge{
    position:absolute;top:-11px;left:50%;transform:translateX(-50%);
    background:var(--accent);color:#fff;font-size:10px;font-weight:800;letter-spacing:.12em;
    text-transform:uppercase;padding:4px 12px;border-radius:999px;white-space:nowrap
  }
  .card-icon{font-size:34px;line-height:1;margin-bottom:6px;min-height:34px}
  .card h3{margin:6px 0 2px;font-size:20px;font-weight:800;letter-spacing:.03em}
  .sub{color:var(--muted);font-size:12px;margin:0 0 18px;font-weight:600;letter-spacing:.03em}
  .btn{
    display:inline-flex;align-items:center;gap:8px;justify-content:center;
    width:100%;padding:13px 16px;border-radius:10px;text-decoration:none;font-weight:800;
    letter-spacing:.06em;font-size:14px;cursor:pointer;
    background:linear-gradient(90deg,var(--accent2),#3b82f6);color:#03121a;
    border:none;transition:filter .15s ease,transform .1s ease;
  }
  .btn:hover{filter:brightness(1.1)}
  .btn:active{transform:scale(.98)}
  .btn-muted{background:#1b2240;color:var(--muted)}
  .size{font-size:11px;opacity:.8;font-weight:700}
  .alts{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
  .alt{color:var(--muted);font-size:11px;text-decoration:none;border:1px solid var(--line);
       padding:5px 10px;border-radius:8px;font-weight:700;letter-spacing:.04em}
  .alt:hover{color:var(--fg);border-color:var(--accent2)}
  .empty{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:34px;text-align:center;color:var(--muted)}
  .empty .btn{width:auto;display:inline-flex;margin-top:10px}
  footer{margin-top:42px;text-align:center;color:var(--muted);font-size:12px;letter-spacing:.04em}
  footer a{color:var(--accent2);text-decoration:none}
  footer a:hover{text-decoration:underline}
  .note{margin-top:18px;font-size:11px;color:var(--muted);text-align:center;line-height:1.6;max-width:620px;margin-left:auto;margin-right:auto}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <img class="logo" src="https://raw.githubusercontent.com/easierbycode/nes/master/nes-logo.png" alt="" onerror="this.style.display='none'"/>
      <div class="tag">CodeMonkey Games</div>
      <h1>Launcher</h1>
      <div class="metaline">
        ${versionBadge}
        ${dateLine}
        ${versionBadge || dateLine ? `<span class="meta-dot">·</span>` : ""}
        <a href="${esc(RELEASES_URL)}" style="color:var(--muted)">all versions</a>
      </div>
    </header>

    ${body}

    <p class="note">
      macOS builds are unsigned — on first launch, right-click the app and choose
      <strong>Open</strong> to bypass Gatekeeper. Windows: unzip and run the
      <strong>.exe</strong>.
    </p>

    <footer>
      Open source on <a href="https://github.com/${esc(REPO)}">GitHub</a>.
    </footer>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/healthz") {
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  }

  if (path === "/api/latest") {
    const latest = await fetchLatest();
    return new Response(JSON.stringify(latest, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*",
      },
    });
  }

  // Stable redirect links that always resolve to the newest asset, e.g.
  // /download/macos  /download/windows  /download/linux  (/download/macos?kind=pkg)
  const dl = /^\/download\/(macos|windows|linux)\/?$/.exec(path);
  if (dl) {
    const id = dl[1] as PlatformId;
    const latest = await fetchLatest();
    const bucket = latest?.platforms[id];
    let target = bucket?.primary?.url ?? null;
    const kind = url.searchParams.get("kind");
    if (kind && bucket) {
      const alt = bucket.all.find((a) => a.ext === kind.toLowerCase());
      if (alt) target = alt.url;
    }
    return Response.redirect(target ?? RELEASES_URL, 302);
  }

  if (path === "/" || path === "") {
    const latest = await fetchLatest();
    const detected = detectOS(req.headers.get("user-agent") ?? "");
    return new Response(renderPage(latest, detected), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  }

  return new Response("Not found", { status: 404 });
}

// On Deno Deploy the port is managed by the platform (this option is ignored
// there); locally it lets you pick a port with PORT=… for testing.
Deno.serve({ port: Number(Deno.env.get("PORT") ?? "8000") }, handler);
