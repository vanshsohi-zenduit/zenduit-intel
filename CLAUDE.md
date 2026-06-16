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
| LLM | Google Gemini (`gemini-2.0-flash` default) + optional Deep Research API |
| Product context | Brain MCP (Railway) — `company-brain` server |
| Research | n8n webhook → fallback to inline Gemini agent (DDG loop) → optional Deep Research |
| Library | Flat JSON file `library.json` (gitignored) |
| Credentials | `credentials.json` (gitignored) — managed via in-app Settings tab |
| Sync state | `sync_state.json` (gitignored) — ClickUp task tracking + leaderboard |

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

**Credentials:** All API keys are managed via the in-app **Settings** tab (gear icon in sidebar). They are saved to `credentials.json` and loaded into `os.environ` at startup via `app/credentials.py`. You do not need a `.env` file — the Settings UI replaces it.

---

## Environment variables / Credentials

All of these can be set via the Settings tab in the UI. The backend reads them from `credentials.json` → `os.environ` via `get_config()`.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | Gemini API key (AIza...) |
| `GEMINI_RESEARCH_MODEL` | No | Research model (default: `gemini-2.0-flash`) |
| `GEMINI_GENERATION_MODEL` | No | Strategy generation model (default: `gemini-2.0-flash`) |
| `GEMINI_DEEP_RESEARCH_MODEL` | No | Set to `deep-research-preview-04-2026` to enable Deep Research (takes 3-10 min/lead) |
| `BRAIN_MCP_URL` | No | Brain MCP Railway URL |
| `BRAIN_MCP_API_KEY` | No | Brain MCP auth key |
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
| `API_SECRET` | No | Bearer token to protect mutation endpoints |
| `ALLOWED_ORIGIN` | No | CORS origin (default: `http://localhost:8080`) |

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
- **Path A (n8n)**: POSTs to `N8N_BASE_URL + N8N_RESEARCH_WEBHOOK_PATH`. Expects full intel JSON in response.
- **Path B (Deep Research)**: If `GEMINI_DEEP_RESEARCH_MODEL` is set, calls Google's Interactions API (`client.interactions.create(input=query, agent=model, background=True)`), polls every 10s up to 60 iterations, then parses the report with Gemini Flash into structured JSON. Falls back to Path C on failure.
- **Path C (inline DDG loop)**: Runs a Gemini tool-use loop (up to 8 iterations) with `web_search` (DuckDuckGo) and `web_fetch` tools. SSRF protection blocks private IPs.
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

| Route | Auth | Description |
|---|---|---|
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
| `app/main.py` | FastAPI app, all endpoints, lifespan (starts ClickUp poll loop) |
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
| `app/nodes/research_node.py` | DDG loop + Deep Research dispatcher + HQ vague-region fix |
| `app/graph.py` | LangGraph pipeline definition |
| `app/state.py` | `IntelState` TypedDict |
| `app/outcomes.py` | Outcome CRUD + stats aggregation |
| `app/notify.py` | Slack webhook for BOOKED alerts |

---

## Key patterns and gotchas

**`load_credentials()` must be called first.** It's the first statement after imports in `app/main.py`. `research_node.py` has module-level `get_config()` calls that run at import time — if `load_credentials()` runs after the import, credentials won't be available.

**`append_library_entry()` not `write_library()` for new saves.** The append function uses `asyncio.Lock` to prevent race conditions when multiple saves arrive concurrently (e.g. bulk upload).

**Deep Research is slow by design.** 3–10 minutes per lead. Only activate `GEMINI_DEEP_RESEARCH_MODEL` for background/webhook flows, not interactive use. The DDG loop (Path C) is better for the browser SSE flow.

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
- Rate limiting: 10 req/min on `/api/generate`, 40/min on `/api/bulk`, 60/min on `/api/library/entry`
- Auth: set `API_SECRET` in Settings to require `Authorization: Bearer <secret>` on mutation endpoints
- CORS: locked to `ALLOWED_ORIGIN` (default `http://localhost:8080`)
- `credentials.json` and `sync_state.json` are gitignored
