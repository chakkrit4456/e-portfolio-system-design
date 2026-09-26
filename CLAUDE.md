# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

- `project/` — Claude Design handoff bundle (HTML/CSS/JS prototypes). `project/BPCD e-Portfolio v2.dc.html` is the source-of-truth design; `project/uploads/BPCD_iPCP_Requirement_Step1.md` holds requirements. These are reference only — do not edit or ship them.
- `app/` — the real web app (Node.js/Express + PostgreSQL) implementing that design. All commands below run from `app/`. `app/README.md` (Thai) is the user-facing setup doc.

UI text, enum values and error messages are in Thai. Status/type enums (e.g. `'รับรองแล้ว'`, `'โครงการ'`) are stored as Thai strings and duplicated in `server.js` (`WORK_TYPES`, `WORK_STATUSES`, `EV_STATUSES`) and `public/app.js` (`TYPES`, `WORK_STATUSES`, `ST`) — keep them in sync.

## Commands (in `app/`)

```bash
docker compose up -d      # start PostgreSQL 16 (volume pgdata; never `down -v`)
npm install
npm run dev               # node --watch, loads .env if present
npm start
npm run db:init           # create schema + seed without starting the server
```

Requires Node ≥ 20.6 (`--env-file-if-exists`). Copy `.env.example` to `.env`. There is no build step, linter, or test suite.

The database must be UTF8-encoded; `migrate()` in `db/index.js` refuses to start otherwise.

## Architecture

- **`server.js`** — single-file Express app: session auth (`express-session` stored in Postgres via `connect-pg-simple`), JSON API under `/api`, multer uploads to `app/uploads/` served through authenticated `/files/:id`, and an SPA fallback serving `public/index.html`.
  - On startup: `migrate()` runs `db/schema.sql` (must stay idempotent — `CREATE ... IF NOT EXISTS`), then `db/seed.js` seeds `admin`/`staff` users (password from `SEED_PASSWORD`) only if empty.
  - Middleware: `auth` / `admin` guards; `wrap()` for async handlers; central error handler maps multer errors.
  - **CSRF**: every mutating `/api` request must send `X-CSRF-Token` matching the session token (`GET /api/csrf`). The client `api()` helper in `public/app.js` handles this — use it for new calls rather than raw `fetch`.
  - **Login**: IP rate limit (`express-rate-limit`) + per-account lockout via `users.failed_attempts` / `locked_until`.
  - **Uploads**: extension allow-list plus magic-byte check of file contents; rejected files are deleted.
  - **AI proxy**: `/api/ai/chat`, `/api/ai/polish`, `/api/ai/test` call an OpenAI-compatible endpoint configured by admins in the `settings` table (key `'ai'`). The API key is AES-256-GCM encrypted with a key derived from `SESSION_SECRET` and never sent to the browser.
  - Mutations call `audit()` to write to `audit_log`.
- **`db/`** — `index.js` (pg pool, `migrate`, `audit`), `schema.sql` (users, works, evidence, kpis, competencies, settings, audit_log), `seed.js` (demo data from the prototype).
- **`public/`** — vanilla JS SPA (`app.js`, no framework, no bundler) + `styles.css` recreating the v2 design. `GET /api/portfolio` returns the user's full portfolio in one payload that the client renders from.

## Production deploy

`app/deploy/install.sh` (run as root on Debian 13 / TurnKey Node.js) is an idempotent, step-by-step installer: base packages → Node ≥ 20.6 → PostgreSQL with a UTF8 DB (offers backup + recreate if not UTF8) → rsync code to `/opt/bpcd-eportfolio` + create `.env` (never overwrites) → systemd service `bpcd-eportfolio` → admin password set/reset → nginx reverse proxy → optional auto deploy (systemd timer `bpcd-eportfolio-update` runs `deploy/auto-update.sh` every 2 min: fetches a clone in `/opt/bpcd-eportfolio-src`, rsyncs, restarts, rolls back if the health check fails). `--check` only diagnoses, `--yes` accepts defaults; `APP_DIR`, `APP_USER`, `APP_PORT`, `DB_NAME`, etc. are overridable via env vars. Every step asks before changing anything — keep it that way when editing, and keep messages in Thai.

`SESSION_SECRET` signs sessions and CSRF tokens and encrypts the stored AI key — changing it logs everyone out and invalidates the saved API key. Set `COOKIE_SECURE=true` only behind HTTPS.
