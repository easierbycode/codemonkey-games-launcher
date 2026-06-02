# CodeMonkey Games Launcher

A kiosk-style desktop launcher for browser games (Phaser / Kaplay / Ruffle),
built on [Deno](https://deno.com/) + [Fresh](https://fresh.deno.dev/). It runs a
local server and opens the game library full-screen in a Chromium kiosk window,
and it ships as native binaries for **macOS**, **Windows**, and **Linux/Kazeta**.

## Downloads

- **Download page:** <https://codemonkey-games-launcher.deno.dev/>
  (always links to the latest release; auto-detects your OS)
- **All releases:** <https://github.com/easierbycode/codemonkey-games-launcher/releases>

> macOS builds are **unsigned** and **Apple-Silicon only** (built on
> `macos-latest`, which is arm64). On first launch, right-click the app and
> choose **Open** to get past Gatekeeper. On Windows, unzip and run the `.exe`.

## How it fits together

| Piece | What it is | Where |
|-------|-----------|-------|
| **Launcher** | The Fresh app, compiled to a self-contained binary. Serves the UI locally and opens the kiosk browser. | `main.ts`, `routes/`, `static/`, `lib/` |
| **Download page** | A standalone, zero-dependency Deno server hosted on Deno Deploy. Reads GitHub Releases at runtime so links always point at the newest version. | `deploy/download.ts` |
| **Build CI** | Builds the binaries and publishes them to the GitHub Release for a tag. | `.github/workflows/build.yml` |
| **Deploy CI** | Deploys the download page to Deno Deploy. | `.github/workflows/deploy.yml` |

## Requirements

- [Deno](https://deno.com/) **2.x** (`deno --version`)

## Local development

```sh
# Run the launcher locally (watches static/, routes/, islands/)
deno task start            # http://127.0.0.1:8000  (also tries to open a kiosk browser)
CMG_DISABLE_KIOSK=1 deno task start   # ...without launching the kiosk browser

# Preview the public download page locally
deno run --no-lock --allow-net --allow-env deploy/download.ts   # http://localhost:8000
```

> There is no committed `deno.lock` (see [Notes](#notes)). Use `--no-lock`
> locally if a stale lock ever gets in the way.

## Building binaries locally

```sh
deno task build:mac        # build/mac/CodemonkeyGamesLauncher.dmg (+ .app)
deno task build:mac:pkg    # build/mac/CodemonkeyGamesLauncher.pkg
deno task build:windows    # build/windows/ (.exe + assets)  — registers the URL protocol on Windows
deno task build:kazeta     # build/kazeta/ (Kazeta bundle)
```

## Releasing

Releases are fully automated. Pushing a version tag builds every platform and
attaches the binaries to the GitHub Release; the download page then picks them
up automatically — **no redeploy required.**

### Cut a new release

```sh
# 1. Make sure master is green and up to date
git switch master && git pull

# 2. Tag the version and push the tag
git tag v1.2.3
git push origin v1.2.3
```

That triggers the **Build binaries** workflow, which produces and publishes:

| Asset | Platform |
|-------|----------|
| `CodeMonkeyGamesLauncher-<version>-macos.dmg` | macOS (Apple Silicon) |
| `CodeMonkeyGamesLauncher-<version>-macos.pkg` | macOS installer |
| `CodeMonkeyGamesLauncher-<version>-windows.zip` | Windows x64 |
| `CodeMonkeyGamesLauncher-<version>-kazeta.zip` | Linux / Kazeta |

Within a minute the download page reflects the new version.

### Rebuild an existing tag

GitHub → **Actions** → **Build binaries** → **Run workflow** → enter the tag
(e.g. `v1.2.3`). The binaries are rebuilt and re-attached to that release.

### Dry run (artifacts only, no release)

Run the **Build binaries** workflow with the tag input left **blank**. It builds
all platforms and uploads them as workflow artifacts (named `0.0.0-dev`) without
creating or touching any release.

## The download page

`deploy/download.ts` is a single-file Deno server with no remote imports.

- Redeploys automatically when you push changes under `deploy/**` to `master`.
- Endpoints:
  - `/` — the HTML download page (OS auto-detected from the User-Agent)
  - `/api/latest` — JSON of the latest release and its categorized assets
  - `/download/macos` · `/download/windows` · `/download/linux` — 302 redirects
    that always resolve to the newest asset (e.g. `/download/macos?kind=pkg`)
  - `/healthz` — liveness check
- Optional environment variables (set in the Deno Deploy project settings):
  - `GH_REPO` — override the source repo (default `easierbycode/codemonkey-games-launcher`)
  - `GH_TOKEN` — a GitHub token to raise the API rate limit from 60 to 5000 req/hr
    (the unauthenticated limit is fine for normal traffic thanks to a 5-minute cache)

## Notes

- **No committed `deno.lock`.** esm.sh periodically rebuilds its `denonext`
  build artifacts, so a pinned lock hash drifts and breaks CI integrity checks
  (this is what previously failed every deploy). The lock is `.gitignore`d and
  the compile tasks / CI use `--no-lock`; each checkout resolves a fresh,
  matching lock.
- **GitHub Actions run on Node 24.** Action versions are pinned to their Node 24
  majors. `denoland/deployctl@v1` has no Node 24 release yet, so the deploy job
  sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to run it on Node 24; remove
  that once `deployctl` ships a newer major.
