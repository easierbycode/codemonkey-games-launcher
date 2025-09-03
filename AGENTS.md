# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/`; tests in `tests/`; scripts in `scripts/`; static assets in `assets/`.
- Prefer feature-first folders: `src/features/<feature>/` with colocated code, tests, and docs.
- Keep configuration at the repo root (`README.md`, `AGENTS.md`, `.editorconfig`, `.env.example`).

## Build, Test, and Development Commands
- Local dev: `make dev` (starts watcher/server; adjust to your stack).
- Build: `make build` (produces production artifacts under `dist/` or `build/`).
- Test: `make test` (runs unit tests; use `make test-watch` for TDD).
- Lint/format: `make lint` and `make fmt`.
If `make` targets are missing, add them as thin wrappers over your language tools (e.g., npm, pytest, cargo).

## Coding Style & Naming Conventions
- Indentation: 2 spaces for JS/TS; 4 spaces for Python.
- Formatters: Prettier (JS/TS) or Black (Python). Lint with ESLint or Ruff.
- Naming: `camelCase` variables/functions, `PascalCase` types/classes, `kebab-case` filenames (or `snake_case.py` for Python).
- Keep modules small (<300 lines) and single-purpose; export only what’s needed.

## Testing Guidelines
- Frameworks: Jest/Vitest for JS/TS, or Pytest for Python.
- File names: `*.test.ts` / `*.spec.ts` or `test_*.py` in `tests/` or next to sources.
- Coverage: target ≥80% lines on changed code. Run `make test` before every PR.

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits (e.g., `feat: add level loader`, `fix: prevent crash on pause`).
- Scope changes narrowly; keep commits logically atomic.
- PRs: include a clear description, linked issues (`Closes #123`), screenshots or CLI output when relevant, and notes on testing/impact.
- CI must pass (build, lint, test). Request review once green.

## Security & Configuration Tips
- Never commit secrets. Use `.env` locally; update `.env.example` when adding new variables.
- Validate and sanitize all external inputs. Prefer parameterized queries and safe APIs.
