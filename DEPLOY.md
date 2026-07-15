# Deploying Zenduit Outbound Intelligence (self-hosted on a Mac)

End-to-end guide. **Part A** runs on the Windows dev machine (push code to GitHub).
**Part B** runs on the Mac (pull + run under Docker Desktop).

Architecture recap: one `docker compose` stack of three services —
`app` (FastAPI serving the built React SPA **and** `/api` on port 3001),
`postgres` (users/auth table only), and `cloudflared` (outbound tunnel → public HTTPS URL).
No inbound ports are opened; only cloudflared dials out.

Storage is split: **Postgres** holds the `users` table only; all business data
(`library.json`, `credentials.json`, `sync_state.json`, `outcomes.json`) are flat
JSON files living in the bind-mounted `./data` folder.

---

## Part A — On this Windows machine (push to GitHub)

### A1. Confirm secrets are NOT tracked
Real secrets must never reach GitHub. These are already gitignored — confirm:

```bash
git status --short          # .env / credentials.json / data/ should NOT appear
git ls-files | grep -iE "\.env$|credentials\.json|sync_state\.json"   # must print nothing
```

`.env.example` (placeholder values only) **is** tracked — that's correct.

### A2. Commit the Docker stack
```bash
git add -A
git commit -m "Add Docker self-host stack (compose, Dockerfile, .env.example, DEPLOY.md)"
git push origin dev
```

> You're on branch `dev`. Either deploy `dev` on the Mac, or merge to `main` first
> (`git checkout main && git merge dev && git push origin main`) and deploy `main`.
> Just be consistent about which branch the Mac pulls.

That's all for the Windows side. Your real API keys, JWT secret, and DB password
stay local and are recreated fresh on the Mac in Part B.

---

## Part B — On the Mac (pull + run)

### B1. Install prerequisites
- **Docker Desktop for Mac** — https://www.docker.com/products/docker-desktop/
  Launch it; wait for the whale icon in the menu bar to go steady.
- Verify in Terminal:
  ```bash
  docker --version
  docker compose version
  ```
- **Git** (preinstalled on macOS, or `xcode-select --install`).

### B2. Clone the repo
```bash
git clone https://github.com/vanshsohi-zenduit/zenduit-intel.git
cd zenduit-intel
git checkout dev          # match the branch you pushed in A2
```

### B3. Create the production `.env`
`.env` is gitignored, so it did NOT come down with the clone — you build it fresh:

```bash
cp .env.example .env
```

Edit `.env` and set these (open in any editor: `open -e .env` or `nano .env`):

| Variable | Value to set |
|---|---|
| `GOOGLE_API_KEY` | Your real Gemini API key (`AIza...`) |
| `JWT_SECRET` | Generate one: `openssl rand -hex 32` → paste the output |
| `ADMIN_EMAIL` | Your admin login email (e.g. `admin@zenduit.com`) |
| `ADMIN_PASSWORD` | A strong admin password (you'll log in with this) |
| `POSTGRES_PASSWORD` | A strong DB password (any value; it seeds the container) |
| `AUTH_DISABLED` | **Leave blank** — never set this for a public deploy |

Leave `DATABASE_URL` commented out — compose builds it automatically from the
`POSTGRES_*` vars and points it at the `postgres` service.
Optional integrations (Brain MCP, n8n, ClickUp, Gmail, Slack, Zoho) are best left
blank here and configured later in the in-app **Settings** tab.

> Security: if `JWT_SECRET` is missing while auth is enabled, the app hard-fails on
> startup by design. That's expected — set it.

### B4. Seed the data directory
The `app` container bind-mounts `./data` for the JSON stores. Create it, and copy
over any existing data you want to carry across:

```bash
mkdir -p data
# If migrating from another machine, copy your existing JSON stores in, e.g.:
#   scp you@oldmachine:/path/library.json      ./data/
#   scp you@oldmachine:/path/credentials.json  ./data/
#   scp you@oldmachine:/path/sync_state.json   ./data/
#   scp you@oldmachine:/path/outcomes.json     ./data/
```

Starting fresh is fine — the files are created on first use.

### B4b. Company Brain MCP (recommended — CRM/meeting intelligence)
The compose stack includes a `brain-mcp` service that powers the "Product
Intelligence" phase (matched customer wins, meeting quotes, battlecards). It is
built from the **separate `company-brain` repo**, which must be cloned as a
**sibling** of this repo, and it only queries an existing **Supabase** database —
so it needs `company-brain/.env` with the Supabase + Gemini + Zoho credentials.

```bash
# From the PARENT folder that contains outbound-intel (a.k.a. zenduit-intel):
cd ..
git clone https://github.com/vanshsohi-zenduit/company-brain.git
cd company-brain
cp .env.example .env      # then fill: SUPABASE_URL, SUPABASE_DB_URL,
                          # SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, ZOHO_*,
                          # and optionally MCP_API_KEY
cd ../zenduit-intel       # back to this repo
```

Layout must end up as:
```
<parent>/
  ├── zenduit-intel/     ← this repo (compose lives here; references ../company-brain)
  └── company-brain/     ← sibling repo with its own .env
```

Auth: if you set `MCP_API_KEY` in `company-brain/.env`, set the **same value** as
`BRAIN_MCP_API_KEY` in this repo's `.env`. Leave both blank to disable auth
(safe — `brain-mcp` is internal-only, never exposed to the host or internet).

> **Skipping Brain?** If you don't clone `company-brain`, `docker compose up
> --build` will fail trying to build `brain-mcp`. Either clone it, or comment out
> the `brain-mcp` service block in `docker-compose.yml` — the `app` does not depend
> on it and will fall back to static product context.

> **LinkedIn MCP is intentionally not wired up** (it scrapes LinkedIn via a real
> logged-in account — ToS/ban risk). The LinkedIn phase self-skips when
> `LINKEDIN_MCP_URL` is unset. To enable it later, add a `linkedin-mcp` service and
> set `LINKEDIN_MCP_URL=http://linkedin-mcp:<port>`.

### B5. Build and start
```bash
docker compose up --build -d
```

First build takes a few minutes (installs npm + Python deps, builds the SPA, and
builds `brain-mcp` from `../company-brain`). `-d` runs it detached. Check health:

```bash
docker compose ps
```

You want `postgres` + `brain-mcp` healthy and `app` + `cloudflared` running.
Verify the brain is reachable from the app's network:

```bash
docker compose exec app python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://brain-mcp:3100/health')))"
# → {'ok': True, 'service': 'company-brain-mcp', 'transport': 'http'}
```

### B6. Get your public URL
`cloudflared` prints a rotating public HTTPS URL in its logs:

```bash
docker compose logs cloudflared | grep trycloudflare.com
```

Open that `https://<random>.trycloudflare.com` in a browser → the app loads.
Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

Locally on the Mac you can also reach it at **http://localhost:3001**.

### B7. Post-launch: finish configuration in-app
Log in → gear icon (**Settings**) → fill in optional integration keys
(n8n, ClickUp, Gmail, Slack, Zoho). These save to `data/credentials.json` and
load into the backend automatically.

> **Company Brain is NOT in Settings** (by design). It's pinned to the internal
> self-hosted `brain-mcp` service via compose (`BRAIN_MCP_URL=http://brain-mcp:3100`)
> and cannot be overridden from the UI or a stale `credentials.json`. Configure it
> only through `company-brain/.env` (data/credentials) as described in B4b.

To add more rep/user logins: as the admin, use the user-creation flow
(`POST /api/users` is admin-gated).

---

## Day-2 operations (on the Mac)

```bash
# Follow logs
docker compose logs -f app

# Redeploy after pulling new code
git pull                       # then:
docker compose up --build -d

# Stop (data + users preserved)
docker compose down

# Stop AND wipe the Postgres users volume (business JSON in ./data is untouched)
docker compose down -v
```

### What persists where
| Data | Location | Survives `down` | Survives `down -v` |
|---|---|---|---|
| User accounts / auth | Postgres volume `pgdata` | ✅ | ❌ (admin re-seeds from `.env` on next boot) |
| Leads, credentials, leaderboard, outcomes | `./data/*.json` on disk | ✅ | ✅ |

**Backups:** copy the `./data` folder (all business data). For the users table,
`docker compose exec postgres pg_dump -U intel intel > users-backup.sql`.

### The tunnel URL rotates
Every `cloudflared` restart yields a new `*.trycloudflare.com` URL. Logins (JWTs)
survive the change — just re-fetch the URL from the logs. For a **permanent**
subdomain, set up a Cloudflare *named tunnel* (requires a Cloudflare-managed
domain; no code change needed — swap the `cloudflared` command for your tunnel token).

---

## Updating the app (shipping new code)

The loop is: push on the dev machine → pull + rebuild on the Mac.

```bash
# On the dev machine
git add -A && git commit -m "your change" && git push origin dev

# On the Mac
git pull
docker compose up --build -d
```

**Your data is safe across updates.** A rebuild replaces the app *image* only — it
never touches the Postgres `pgdata` volume or the `./data` JSON files:

| Data | Survives `up --build -d`? |
|---|---|
| User accounts / logins | ✅ (Postgres volume untouched by rebuilds) |
| Leads, credentials, leaderboard, outcomes | ✅ (`./data/*.json` on disk, not in the image) |

Only `docker compose down -v` wipes the users volume. A plain rebuild never does.

**What changes during an update:**
- **Brief downtime** — a few seconds while the old container is swapped for the new one.
- **The public URL is preserved** — compose recreates only the `app` service (its
  image changed) and leaves `cloudflared` running, so the `*.trycloudflare.com` URL
  stays the same. It only rotates if you restart/recreate `cloudflared` or run `down`.

**Three gotchas:**
1. **Always use `--build`.** The React frontend is baked into the image at build time.
   A plain `docker compose up -d` (no `--build`) keeps serving the *old* frontend.
2. **Dependency changes are automatic.** New `requirements.txt` / `package.json`
   entries are installed by the rebuild — no extra step.
3. **DB schema changes are the one caveat.** Startup runs `create_all`, which only
   *creates missing tables* — it does NOT alter existing ones. Adding a column to the
   `User` model won't apply to an existing Postgres volume; that needs a manual
   `ALTER TABLE` / migration. All other stores are schema-less JSON, so unaffected.

**Safe-update habit — snapshot before a risky change (it's just files):**
```bash
cp -r data data.backup-$(date +%F)
docker compose exec postgres pg_dump -U intel intel > users-$(date +%F).sql   # optional
git pull && docker compose up --build -d
```
If something breaks: `git checkout <previous-commit> && docker compose up --build -d`.
Your `./data` folder is untouched, so you roll straight back.

---

## Troubleshooting
- **`app` restarts / exits immediately** → `docker compose logs app`. Most common
  cause: `JWT_SECRET` blank while `AUTH_DISABLED` is also blank. Set `JWT_SECRET`.
- **`init_db` warnings at startup** → normal; the app retries while Postgres finishes
  booting (`depends_on: service_healthy` plus a retry loop).
- **Can't log in** → confirm `ADMIN_EMAIL`/`ADMIN_PASSWORD` were set *before* the
  first `up` (admin is seeded on first boot). If you set them later, restart:
  `docker compose up -d` (seeding is idempotent and re-runs).
- **`npm ci` fails during build** → ensure `package-lock.json` was committed (it is).
- **No public URL in logs** → `docker compose restart cloudflared` then re-grep.
