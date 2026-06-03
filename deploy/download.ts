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

// Transparent NES-parody wordmark, inlined so the page has no external image
// dependency and renders no opaque logo box on the light background.
const LOGO_DATA_URI = "data:image/png;base64,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";

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
<meta name="theme-color" content="#d8d8d8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#d8d8d8; --bg2:#c4c8d1; --fg:#1b1f2a; --muted:#5b6172;
    --accent:#e0266a; --accent2:#0b7f9b; --card:#ffffff; --card2:#eef0f4; --line:#cdd0d9;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    font-family:'Orbitron',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    color:var(--fg); min-height:100vh;
    background:
      radial-gradient(1100px 600px at 50% -10%, rgba(11,127,155,.12), transparent 60%),
      radial-gradient(900px 500px at 85% 110%, rgba(224,38,106,.10), transparent 60%),
      radial-gradient(150% 125% at 50% -10%, var(--bg) 0%, var(--bg2) 75%);
    display:flex; flex-direction:column; align-items:center;
    padding:48px 20px 64px;
  }
  .wrap{width:100%;max-width:920px}
  header{text-align:center;margin-bottom:40px}
  .logo{height:64px;width:auto;image-rendering:pixelated;margin-bottom:18px;filter:drop-shadow(0 0 16px rgba(11,127,155,.35))}
  h1{
    font-weight:900;letter-spacing:.04em;margin:0 0 6px;
    font-size:clamp(28px,5vw,46px);line-height:1.05;
    background:linear-gradient(90deg,var(--accent2),var(--fg) 55%,var(--accent));
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .tag{color:var(--muted);font-size:14px;font-weight:600;letter-spacing:.18em;text-transform:uppercase}
  .metaline{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;color:var(--muted);font-size:13px;flex-wrap:wrap}
  .pill{background:rgba(11,127,155,.12);border:1px solid rgba(11,127,155,.45);color:var(--accent2);
        padding:3px 12px;border-radius:999px;font-weight:700;letter-spacing:.08em;font-size:12px}
  .meta-dot{opacity:.5}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:8px}
  .card{
    position:relative;background:linear-gradient(180deg,var(--card),var(--card2));
    border:1px solid var(--line);border-radius:16px;padding:26px 22px 24px;text-align:center;
    box-shadow:0 1px 2px rgba(16,18,33,.05),0 10px 30px -18px rgba(16,18,33,.25);
    transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;
  }
  .card:hover{transform:translateY(-3px);border-color:rgba(11,127,155,.55);box-shadow:0 1px 2px rgba(16,18,33,.05),0 16px 40px -20px rgba(11,127,155,.4)}
  .card.recommended{border-color:var(--accent);box-shadow:0 0 0 1px rgba(224,38,106,.3),0 18px 50px -22px rgba(224,38,106,.45)}
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
    background:linear-gradient(90deg,var(--accent2),#2563eb);color:#fff;
    border:none;text-shadow:0 1px 1px rgba(0,0,0,.18);transition:filter .15s ease,transform .1s ease;
  }
  .btn:hover{filter:brightness(1.08)}
  .btn:active{transform:scale(.98)}
  .btn-muted{background:#e4e6ec;color:var(--muted);text-shadow:none}
  .size{font-size:11px;opacity:.8;font-weight:700}
  .alts{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
  .alt{color:var(--muted);font-size:11px;text-decoration:none;border:1px solid var(--line);
       padding:5px 10px;border-radius:8px;font-weight:700;letter-spacing:.04em}
  .alt:hover{color:var(--fg);border-color:var(--accent2)}
  .empty{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:34px;text-align:center;color:var(--muted);box-shadow:0 10px 30px -18px rgba(16,18,33,.25)}
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
      <img class="logo" src="${LOGO_DATA_URI}" alt="CodeMonkey Games" />
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
