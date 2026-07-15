# CLAUDE.md

**Zenduit Outbound Intelligence** — B2B sales intelligence tool for Zenduit (fleet telematics).
Given a prospect's website/LinkedIn, it runs a multi-phase AI pipeline producing:
company research, executive briefing, objection handling, 14-day outreach sequence, and 5 personalised scripts.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS v4 + Framer Motion + React Router v7 |
| Backend | Python FastAPI + LangGraph |
| LLM | Google Gemini (`gemini-3.5-flash` default) + optional multi-subagent deep research |
| Product context | Brain MCP (Railway) — `company-brain` server |
| Research | grounded Gemini (Google Search) → DDG loop fallback; optional multi-subagent deep-research mode |
| Library | Flat JSON file `library.json` (gitignored) |
| Credentials | `credentials.json` (gitignored) — managed via in-app Settings tab |
| Sync state | `sync_state.json` (gitignored) — ClickUp task tracking + leaderboard |
| Auth | Multi-user email + password (bcrypt), login issues a **JWT** (PyJWT HS256). `app/auth.py` |
| Users DB | **Postgres** (async SQLAlchemy) — `users` table ONLY; all other stores stay JSON. `app/db.py`, `app/models.py` |
| Deploy | Docker Compose on a Mac: `app` (FastAPI serves `dist/` + `/api`) + `postgres` + `cloudflared` (public tunnel) |

---

## Running the app

```bash
# Install Python deps (once)
pip install -r requirements.txt

# Terminal 1 — FastAPI backend (port 3001)
uvicorn app.main:app --port 3001 --reload

# Terminal 2 — Vite frontend (port 8080)
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

For **local dev without login**, set `AUTH_DISABLED=1` (env or `.env`). With auth enabled you must set `JWT_SECRET` or the backend refuses to start.

**Credentials:** Most API keys are managed via the in-app **Settings** tab (gear icon in sidebar). They are saved to `credentials.json` and loaded into `os.environ` at startup via `app/credentials.py`. A set of `ENV_ONLY_FIELDS` are **deliberately NOT in the Settings schema and are never merged from `credentials.json` into `os.environ`** — so env/compose always wins and the UI (or a stale credentials.json) can't shadow them. This covers the auth/DB vars (`JWT_SECRET`, `DATABASE_URL`, `ADMIN_*`, `AUTH_DISABLED`, `POSTGRES_*`, `DATA_DIR`) **and the Brain MCP vars** (`BRAIN_MCP_URL`, `BRAIN_MCP_API_KEY`) — Brain is pinned to the internal self-hosted `brain-mcp` compose service (`BRAIN_MCP_URL=http://brain-mcp:3100`), not user-editable.

### Production (self-hosted on a Mac with Docker Desktop)

```bash
cp .env.example .env    # fill JWT_SECRET (openssl rand -hex 32), ADMIN_EMAIL/PASSWORD,
                        # POSTGRES_PASSWORD, GOOGLE_API_KEY, …  (leave AUTH_DISABLED unset)
mkdir -p data && cp library.json credentials.json data/   # carry over existing JSON stores
docker compose up --build -d
docker compose logs cloudflared | grep trycloudflare.com  # → the public HTTPS URL
```

The `app` container serves the built SPA **and** `/api` same-origin on :3001; only `cloudflared` reaches the internet (outbound — no inbound ports). JSON stores persist via bind mount `./data` (`DATA_DIR=/data`); Postgres via named volume `pgdata`. The quick-tunnel `*.trycloudflare.com` URL **rotates on `cloudflared` restart** (JWTs survive it — no `aud` binding); a Cloudflare domain gives a permanent named-tunnel subdomain with no code change.

---

## Environment variables / Credentials

All of these can be set via the Settings tab in the UI. The backend reads them from `credentials.json` → `os.environ` via `get_config()`.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | Gemini API key (AIza...) |
| `GEMINI_RESEARCH_MODEL` | No | Research model (default: `gemini-2.0-flash`) |
| `GEMINI_GENERATION_MODEL` | No | Strategy generation model (default: `gemini-2.0-flash`) |
| `DEEP_RESEARCH_MODE` | No | Set to `true` to enable the multi-subagent grounded deep-research pipeline (planner → 4 parallel extractors → reconciler). Slower + more API calls than the default single-shot grounded path |
| `BRAIN_MCP_URL` | No | Brain MCP URL — **env/compose only** (not in Settings). Compose pins it to `http://brain-mcp:3100` (internal self-hosted service) |
| `BRAIN_MCP_API_KEY` | No | Brain MCP auth key — **env/compose only**. Must match company-brain's `MCP_API_KEY`; leave blank both sides to disable auth |
| `LINKEDIN_MCP_URL` | No | LinkedIn MCP URL |
| `N8N_BASE_URL` | No | n8n instance URL |
| `N8N_RESEARCH_WEBHOOK_PATH` | No | Webhook path (default: `/webhook/company-research`) |
| `N8N_API_KEY` | No | n8n webhook auth token |
| `GMAIL_USER` | No | Gmail address for outbound emails (e.g. `intel@zenduit.com`) |
| `GMAIL_APP_PASSWORD` | No | Google App Password (not regular password) — enables email automation |
| `MANAGER_EMAIL` | No | Receives overdue ClickUp task alerts |
| `CLICKUP_API_TOKEN` | No | ClickUp personal API token — enables task creation |
| `CLICKUP_LIST_ID` | No | ClickUp list ID where lead tasks are created |
| `CLICKUP_OVERDUE_HOURS` | No | Hours before task is considered overdue (default: `48`) |
| `CLICKUP_POLL_INTERVAL_SEC` | No | How often to poll ClickUp for completions (default: `600`) |
| `ZOHO_WEBHOOK_SECRET` | No | Optional — Zoho Flow sends this as `X-Zoho-Signature` header |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook for BOOKED alerts |
| `PUBLIC_APP_URL` | No | Base URL for shareable lead links (default: `http://localhost:8080`) |
| `ALLOWED_ORIGIN` | No | CORS origin (default: `http://localhost:8080`) |

**Auth / DB vars (env or compose only — NOT in the Settings schema):**

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** (unless `AUTH_DISABLED=1`) | Secret used to sign login JWTs (`openssl rand -hex 32`). Startup hard-fails if missing |
| `JWT_TTL_HOURS` | No | Token lifetime (default `12`) |
| `AUTH_DISABLED` | No | `1` = open API / dev mode (bypasses all auth). **Leave unset in production** |
| `DATABASE_URL` | **Yes** (unless `AUTH_DISABLED`) | e.g. `postgresql+asyncpg://intel:pw@postgres:5432/intel`. Compose builds this from the `POSTGRES_*` vars |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker | Seed the Postgres container + build `DATABASE_URL` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Seeds an admin user on first startup (idempotent) |
| `DATA_DIR` | No | Directory for the JSON stores (default cwd; `/data` in Docker). **Must be a real env var**, not in `credentials.json` |

---

## Architecture

### Multi-agent pipeline (`app/graph.py`)

```
context_node → research_node → strategy_node → complete_node → END
```

**Phase 1 — context_node** (`app/nodes/context_node.py`)
- **Agentic**: a Gemini agent decides which Brain MCP tools to call based on the prospect
- Tools available: `find_similar_accounts_by_description`, `get_customer_profile`, `search_customer_meetings`, `find_customers_with_signal`, `search_product_knowledge`
- Captures `similar_accounts` Python-side (not LLM-re-serialized); LLM synthesizes `product_context` prose
- Falls back to hardcoded `ZENDUIT_CONTEXT` if Brain MCP is unavailable

**Phase 2 — research_node** (`app/nodes/research_node.py`)
Dispatcher: if `DEEP_RESEARCH_MODE` is truthy → Path B (deep). Otherwise → Path C (grounded), falling back to Path D on failure.
- **Path A (n8n)**: POSTs to `N8N_BASE_URL + N8N_RESEARCH_WEBHOOK_PATH`. Expects full intel JSON in response.
- **Path B (Simulated Deep Research — multi-subagent)**: enabled by `DEEP_RESEARCH_MODE=true`. Fans out grounded Gemini calls to *simulate* a deep-research agent (replaces the old Interactions API model):
  1. **Planner** (`_plan_queries`) — one non-grounded call breaks the company into 4 targeted search queries (JSON array; falls back to static templates on parse failure).
  2. **Extractors** (`_extract_facts`) — the 4 queries run **in parallel** (`asyncio.gather(..., return_exceptions=True)`), each a grounded Gemini call (`GoogleSearch()`), tolerating partial failure.
  3. **Reconciler** (`_reconcile`) — one non-grounded call folds all findings into the app's full `_INTEL_SCHEMA`, computing `fleetSize`, `currentFleetPlatform`, `trackableAssets`, `displacementAngle`, `decisionMakerHint`. Emits the same `tool`/`research_summary`/`phase` SSE events as Path C. Falls back to Path C on failure.
- **Path C (Google Search Grounding)**: single grounded `generate_content` call via `_grounded_generate()`. Default interactive path; works reliably from cloud servers.
- **Path D (inline DDG loop)**: Runs a Gemini tool-use loop (up to 8 iterations) with `web_search` (DuckDuckGo) and `web_fetch` tools. SSRF protection blocks private IPs. Final fallback.
- **HQ fix**: `_blank_vague_hq()` blanks values like "North America", "USA", "Canada" from `_REGION_BLOCKLIST` post-parse. Prompt includes a dedicated LOCATION step requiring "City, State/Province, Country" format.
- Returns structured intel JSON matching the schema in `research_node.py`.

**Phase 3 — strategy_node** (`app/nodes/strategy_node.py`)
- Executive Briefing (HTML) — **streamed** as `briefing_chunk` SSE events
- Objection Table (HTML)
- 14-Day Sequence (JSON)
- 5 Outreach Scripts (JSON)

**complete_node** — emits the `complete` SSE event with all artifacts.

### Credentials system (`app/credentials.py`)

`load_credentials()` is called as the **very first thing** in `app/main.py` — before any other import that uses `get_config()`. This ensures `credentials.json` values are in `os.environ` before module-level `get_config()` calls in `research_node.py` run.

```python
from app.credentials import load_credentials, get_config, ...
load_credentials()  # must be first
```

`get_config(key, default)` replaces all `os.getenv()` calls throughout the backend. `PLAINTEXT_FIELDS` distinguishes non-secret fields (pre-filled in UI) from secrets (password-masked).

### Universal trigger — SDR automation (`app/main.py`)

**`POST /api/library/entry`** is the single entry point for all lead sources. Whenever a lead is saved here, if `assignedRep` is present and credentials are configured, it fires:
1. `send_lead_ready(rep, entry)` — HTML email to the rep via Gmail SMTP
2. `create_lead_task(rep, entry)` — ClickUp task assigned to the rep

All three sources funnel through this endpoint:
- **Manual research** — after `complete` SSE event, frontend calls `saveLibraryEntry(entry)` → `POST /api/library/entry`
- **Bulk CSV upload** — `BulkUpload.jsx` calls `saveLibraryEntry(entry)` per row (not a batch overwrite)
- **Zoho webhook** — `POST /api/zoho/lead` → AI field extraction → headless pipeline → `append_library_entry()` + manual trigger

The `assignedRep` field on each entry:
```json
{
  "assignedRep": {
    "name": "Savo Lekovic",
    "email": "savo@zenduit.com",
    "clickupMemberId": 87426920
  }
}
```

### ClickUp integration (`app/clients/clickup.py`)

`CLICKUP_MEMBERS` is a static dict of ~100 reps (name → member ID). `resolve_clickup_id(name)` does exact match → case-insensitive → first-name match. Tasks are created with: assignee, markdown description, link to `/lead/:id`, due date based on `CLICKUP_OVERDUE_HOURS`.

`clickup_poll_loop()` (`app/poller.py`) runs as a background task started in the FastAPI `lifespan`. It polls every `CLICKUP_POLL_INTERVAL_SEC` seconds:
- Task closed + not yet counted → `leaderboard_increment()` + `mark_task_counted()`
- Task open + age > `CLICKUP_OVERDUE_HOURS` + not alerted → `send_overdue()` to `MANAGER_EMAIL` + `mark_task_alerted()`

### Leaderboard (`app/leaderboard.py` + `app/sync_state.py`)

Stored in `sync_state.json` under `"leaderboard": { rep_email: { calls: int, entries: [ISO] } }`. `compute_leaderboard(period)` filters by weekly (7d) / monthly (30d) / all-time. Exposed via `GET /api/leaderboard?period=weekly|monthly|all`.

### Zoho webhook (`app/clients/zoho_crm.py`)

Zoho Flow POSTs lead data to `POST /api/zoho/lead`. The server calls `extract_lead_fields_ai(payload)` which sends the raw payload to Gemini with a prompt to dynamically detect and extract fields regardless of naming convention (camelCase, snake_case, Title Case). Returns: `companyName`, `websiteUrl`, `contactName`, `contactTitle`, `contactEmail`, `contactPhone`, `hq`, `industry`, `fleetSize`, `ownerName`, `ownerEmail`, `leadId`. Deduped by `leadId` via `sync_state.json`.

### Email (`app/email_sender.py`)

Gmail SMTP via Python stdlib `smtplib` + `asyncio.run_in_executor`. `send_lead_ready()` sends a branded HTML email with company stats table and CTA button linking to `/lead/:id`. `send_overdue()` sends a plain manager alert. Both are no-ops if `GMAIL_USER`/`GMAIL_APP_PASSWORD` not configured.

### Lead detail page (`src/pages/LeadDetail.jsx` + `GET /api/library/{lead_id}`)

Shareable read-only brief at `/lead/:id`. Used in ClickUp task descriptions and email CTA. Renders company hero, stat row, summary, contact card, sales angles, recent news. React Router v7 handles routing in `src/main.jsx`.

### Headless pipeline (`app/pipeline.py`)

`run_pipeline(company_name, website_url, linkedin_url, seed_intel)` uses a lazily-built `_graph`. Returns the same result shape as the SSE pipeline. Used for Zoho webhook background processing (no SSE connection).

### n8n Research Workflow

Import `n8n/company_research.json` into your n8n instance:
1. Open n8n → Workflows → Import from File
2. Select `n8n/company_research.json`
3. Configure credentials: add your **Google Gemini** credential
4. Activate the workflow
5. Set `N8N_BASE_URL` and `N8N_RESEARCH_WEBHOOK_PATH=/webhook/company-research` in Settings

### Brain MCP integration

The Brain MCP server (`company-brain`) at `BRAIN_MCP_URL` is called via the MCP 2025-03-26 streamable HTTP transport.

Tools used by the agentic context node:
- `find_similar_accounts_by_description(description, industry, limit)`
- `get_account_summary(zoho_crm_id)`
- `search_meeting_chunks(query, zoho_crm_id, tag_filter)`
- `find_accounts_by_tag(tag_slugs)`
- `search_product_docs(query, product_family, knowledge_type, competitor)`

All calls fall back gracefully if Brain MCP is unavailable.

### SSE event protocol

The `/api/generate` endpoint streams these events:

| Event | Payload |
|---|---|
| `phase` | `{ phase, label, status: 'start'\|'complete'\|'skip'\|'generating', data? }` |
| `tool` | `{ name, input }` — web search/fetch tool calls |
| `tool_result` | `{ name, kind: 'search'\|'fetch', ... }` |
| `research_summary` | `{ searches[], sources[], fieldsPopulated[], fieldProvenance[], seedFields[] }` |
| `generation_input` | `{ companyContext, intelFields[], productContextChars, linkedinContact, linkedinHooks }` |
| `briefing_chunk` | `{ chunk }` — streaming HTML tokens |
| `complete` | `{ intel, briefing, objections, sequence, scripts, variants, companyName }` |
| `error` | `{ message }` |

### All endpoints

"Auth" below: `required` = valid **JWT** bearer token (or any request when `AUTH_DISABLED=1`); `—`/`optional` endpoints still carry `Depends(verify_api_key)` in code but tolerate dev mode.

| Route | Auth | Description |
|---|---|---|
| `POST /api/auth/login` | public | `{email,password}` → `{token: <JWT>}`. Rate-limited 5/min; generic 401 on failure |
| `POST /api/users` | admin | Create a user (admin JWT required). `{email,password,is_admin}` |
| `POST /api/generate` | optional | Full 4-phase SSE pipeline |
| `POST /api/bulk` | optional | Dynamic per-row intel extraction + scoring (max 20 rows) |
| `GET /api/library` | — | Read saved prospect library |
| `POST /api/library` | required | Overwrite full library (legacy — prefer `/api/library/entry`) |
| `POST /api/library/entry` | required | Add single entry + fire email/ClickUp automations |
| `GET /api/library/{lead_id}` | — | Get single library entry by ID (used by `/lead/:id` page) |
| `GET /api/outcomes` | — | List logged outcomes |
| `POST /api/outcomes` | required | Create/update an outcome |
| `DELETE /api/outcomes/{id}` | required | Delete an outcome |
| `GET /api/outcomes/stats` | — | Aggregated campaign stats |
| `POST /api/classify-reply` | optional | Gemini classifies a prospect reply |
| `POST /api/zoho/lead` | signature | Zoho Flow webhook — AI field extraction + headless pipeline |
| `GET /api/reps` | — | List all reps from CLICKUP_MEMBERS dict |
| `GET /api/leaderboard` | — | Call leaderboard (`?period=weekly\|monthly\|all`) |
| `GET /api/settings` | — | Read all credential keys (secrets masked) |
| `POST /api/settings` | required | Save credentials to `credentials.json` |
| `GET /api/health` | — | Health check incl. gmail/clickup/zoho_webhook flags |

### Closed-loop campaign tracking

- **Store**: `app/outcomes.py` → flat `outcomes.json` (gitignored)
- **Status enum**: `SENT`, `NO_RESPONSE`, `BOOKED`, `FUTURE`, `UNKNOWN`, `REJECTED`
- **A/B opener variants**: `strategy_node` generates 3 first-touch openers (A/B/C); per-variant performance in stats
- **Slack alerts**: `app/notify.py` posts to `SLACK_WEBHOOK_URL` when outcome is `BOOKED`
- **UI**: `src/components/CampaignDashboard.jsx` (Campaign tab)

---

## Frontend structure

| File | Purpose |
|---|---|
| `src/main.jsx` | React Router v7 — `/lead/:id` → LeadDetail, `/*` → App |
| `src/App.jsx` | Main app shell — tab routing, `saveToLibrary` calls `saveLibraryEntry` |
| `src/components/Sidebar.jsx` | Nav including Settings tab |
| `src/components/ProspectInput.jsx` | Company input form — websiteUrl optional, searchable rep dropdown |
| `src/components/BulkUpload.jsx` | CSV upload — per-row `saveLibraryEntry`, detects rep/owner/assigned_to column |
| `src/components/Settings.jsx` | Credentials manager — grouped by integration, green/red indicators |
| `src/pages/LeadDetail.jsx` | Shareable `/lead/:id` read-only brief page |
| `src/components/CampaignDashboard.jsx` | Campaign stats + leaderboard |
| `src/lib/mcpClient.js` | All API calls — incl. `saveLibraryEntry`, `fetchLead`, `fetchReps`, `fetchLeaderboard`, `fetchSettings`, `saveSettings` |

---

## Backend file map

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app, all endpoints, lifespan (init DB + seed admin + start ClickUp poll loop) |
| `app/auth.py` | bcrypt hash/verify, JWT issue/decode, `verify_api_key` + `require_admin` deps, `auth_disabled()` |
| `app/db.py` | Async SQLAlchemy engine/session, `init_db()` (retry/backoff), `get_sessionmaker()` |
| `app/models.py` | `User` SQLAlchemy model (email, password_hash, is_admin, is_active) |
| `app/credentials.py` | `load_credentials()`, `get_config()`, `SETTINGS_SCHEMA`, `PLAINTEXT_FIELDS` |
| `app/library.py` | `read_library`, `write_library`, `append_library_entry` (locked), `get_library_entry` |
| `app/sync_state.py` | `sync_state.json` — Zoho dedup, ClickUp task metadata, leaderboard |
| `app/leaderboard.py` | `leaderboard_increment()`, `compute_leaderboard(period)` |
| `app/pipeline.py` | Headless `run_pipeline()` for Zoho webhook (no SSE) |
| `app/email_sender.py` | Gmail SMTP `send_lead_ready()` + `send_overdue()` |
| `app/poller.py` | `clickup_poll_loop()` — task completion → leaderboard, overdue → manager email |
| `app/rep_directory.py` | `resolve_rep(name, email)` → `{name, email, clickupMemberId}` |
| `app/clients/clickup.py` | `CLICKUP_MEMBERS` dict (~100 reps), `create_lead_task()`, `fetch_tasks()` |
| `app/clients/zoho_crm.py` | `extract_lead_fields_ai(payload)` — Gemini-powered dynamic field extraction |
| `app/nodes/research_node.py` | Research dispatcher: grounded / multi-subagent deep research / DDG loop + HQ vague-region fix |
| `app/graph.py` | LangGraph pipeline definition |
| `app/state.py` | `IntelState` TypedDict |
| `app/outcomes.py` | Outcome CRUD + stats aggregation |
| `app/notify.py` | Slack webhook for BOOKED alerts |

---

## Key patterns and gotchas

**`load_credentials()` must be called first.** It's the first statement after imports in `app/main.py`. `research_node.py` has module-level `get_config()` calls that run at import time — if `load_credentials()` runs after the import, credentials won't be available.

**Auth is multi-user JWT, not a shared secret.** Login (`POST /api/auth/login`) verifies `{email,password}` against the Postgres `users` table (bcrypt) and returns a signed JWT; the frontend stores it in `localStorage` and sends `Authorization: Bearer <jwt>`. `verify_api_key` (in `app/auth.py`, imported into `main.py` under the SAME name) validates the JWT statelessly — so all existing `Depends(verify_api_key)` sites are unchanged. `require_admin` gates `POST /api/users`. Dev bypass is gated ONLY on `AUTH_DISABLED=1` (never "empty secret"); startup hard-fails if `JWT_SECRET` is missing while auth is enabled. Health `auth_required = not auth_disabled()`. Anti-enumeration: unknown-email / bad-password / inactive all return the same `401 "Invalid email or password"`. Login is rate-limited 5/min. `aiosqlite` is a test-only stand-in — production uses `asyncpg`.

**`append_library_entry()` not `write_library()` for new saves.** The append function uses `asyncio.Lock` to prevent race conditions when multiple saves arrive concurrently (e.g. bulk upload).

**Deep research mode fans out ~6 Gemini calls.** `DEEP_RESEARCH_MODE=true` runs planner + 4 parallel grounded extractors + reconciler — more thorough but more API calls and mind rate limits. Leave it off for the fast single-shot grounded path (default). The 4 extractors run in parallel and tolerate partial failure (`return_exceptions=True`), so one failed search won't sink the run.

**ClickUp member dict is hardcoded.** `app/clients/clickup.py` contains `CLICKUP_MEMBERS` with ~100 reps. To add/remove reps, edit this dict directly. `resolve_clickup_id()` does fuzzy matching: exact → case-insensitive → first-name.

**Zoho webhook dedup.** `_process_zoho_lead()` checks `sync_state.json["zoho_processed_lead_ids"]` before running the pipeline. If `leadId` is blank (Zoho didn't include it), the lead will not be deduped.

**Settings secrets are write-only from the UI.** `GET /api/settings` returns `value: null` for secret fields (anything not in `PLAINTEXT_FIELDS`). To update a secret, type the full new value. Submitting a blank secret field is a no-op (skipped).

**websiteUrl is optional.** `ProspectInput.jsx` only requires `companyName`. The research pipeline handles missing website gracefully.

---

## Files to clean up (manual deletion)

The following files are superseded and can be deleted:
- `server.js` — replaced by `app/` Python backend
- `linkedin.js` — replaced by n8n workflow
- `notebooklm.js` — replaced by Brain MCP client
- `src/lib/strategyGen.js` — dead code (never imported)
- `inspect_app.js` — Playwright debug artifact

---

## Security notes

- `StrategyDisplay.jsx` — LLM HTML is sanitized with DOMPurify before rendering
- `research_node.py` — `web_fetch` blocks RFC-1918 + loopback addresses (SSRF protection)
- Rate limiting: 10 req/min on `/api/generate`, 40/min on `/api/bulk`, 60/min on `/api/library/entry`, 5/min on `/api/auth/login`
- Auth: multi-user JWT (see Key patterns). `JWT_SECRET` required; passwords bcrypt-hashed; `AUTH_DISABLED=1` opens the API for local dev only
- CORS: locked to `ALLOWED_ORIGIN` (default `http://localhost:8080`); production is single-origin so CORS is moot for the SPA
- `credentials.json`, `sync_state.json`, `.env`, and `data/` are gitignored; `.dockerignore` keeps `.env`/`credentials.json`/data out of image layers
- `GET /api/library/{lead_id}` is intentionally public (the `/lead/:id` share page) — safety rests on unguessable `uuid4().hex` IDs
