"""
Zenduit Outbound Intelligence — FastAPI backend (LangGraph + Gemini)
"""
import asyncio
import json
import logging
import os
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv()

# Load persisted credentials into os.environ BEFORE anything reads env vars
from app.credentials import (
    load_credentials,
    get_config,
    read_credentials_file,
    write_credentials_file,
    SETTINGS_SCHEMA,
    PLAINTEXT_FIELDS,
)
load_credentials()

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.graph import build_graph
from app.library import read_library, write_library, append_library_entry, get_library_entry
from app.notify import notify_booking
from app.outcomes import (
    OUTCOME_STATUSES,
    compute_stats,
    delete_outcome,
    read_outcomes,
    record_outcome,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

# ── Startup validation ────────────────────────────────────────────────────────
_gak = get_config("GOOGLE_API_KEY", "")
if not _gak or _gak.startswith("AIza...") or len(_gak) < 20:
    log.warning("GOOGLE_API_KEY is not set — AI features will not work until configured via Settings.")

# ── Lifespan (ClickUp poll loop) ──────────────────────────────────────────────
_poll_task = None


@asynccontextmanager
async def lifespan(app_: FastAPI):
    global _poll_task
    if get_config("CLICKUP_API_TOKEN") and get_config("CLICKUP_LIST_ID"):
        from app.poller import clickup_poll_loop
        _poll_task = asyncio.create_task(clickup_poll_loop())
        log.info("ClickUp poll loop started")
    yield
    if _poll_task:
        _poll_task.cancel()
        try:
            await _poll_task
        except asyncio.CancelledError:
            pass


# ── App setup ─────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Zenduit Outbound Intel", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_config("ALLOWED_ORIGIN", "http://localhost:8080")],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ── LangGraph pipeline ────────────────────────────────────────────────────────
graph = build_graph()


def _content_text(content) -> str:
    """Normalise a chat-model response — Gemini returns content as either a plain
    string or a list of block dicts ([{'type':'text','text':...}]). str()-ing the
    list yields Python repr (single quotes) and breaks JSON parsing, so flatten it."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            (item.get("text", "") if isinstance(item, dict) else str(item))
            for item in content
        )
    return str(content) if content else ""

# ── Auth ──────────────────────────────────────────────────────────────────────

async def verify_api_key(request: Request):
    secret = get_config("API_SECRET")
    if not secret:
        return  # Auth not configured — development mode
    auth = request.headers.get("Authorization", "")
    if not secrets.compare_digest(auth, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


class LoginRequest(BaseModel):
    password: str


@app.post("/api/auth/login")
async def login(body: LoginRequest):
    secret = get_config("API_SECRET")
    if not secret:
        return {"token": ""}  # dev mode — no auth configured
    if not secrets.compare_digest(body.password, secret):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": secret}


# ── Request / response models ─────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    companyName: str = ""
    websiteUrl: str = ""
    linkedinUrl: str = ""
    # Known facts already on hand (e.g. from a bulk CSV row) — passed so the
    # pipeline enriches them instead of starting blank and overwriting them.
    seedIntel: dict | None = None


class BulkRequest(BaseModel):
    # Each prospect is the raw spreadsheet row as an arbitrary key/value map —
    # columns vary sheet to sheet, so we don't impose a fixed schema here.
    prospects: list[dict]


class LibrarySaveRequest(BaseModel):
    library: list


class OutcomeRequest(BaseModel):
    # None = "field not supplied" — lets a partial update touch only what it sends
    # without wiping the rest. On create, missing fields fall back to defaults.
    id: str = ""
    company: str | None = None
    channel: str | None = None
    variant: str | None = None
    status: str | None = None
    reason: str | None = None
    notes: str | None = None


class ClassifyReplyRequest(BaseModel):
    reply: str
    companyName: str = ""
    context: str = ""


# ── POST /api/generate ────────────────────────────────────────────────────────

@app.post("/api/generate")
@limiter.limit("10/minute")
async def generate(
    request: Request,
    body: GenerateRequest,
    _auth=Depends(verify_api_key),
):
    if not body.websiteUrl and not body.companyName:
        raise HTTPException(400, "Provide at least websiteUrl or companyName.")

    initial_state = {
        "company_name": body.companyName,
        "website_url": body.websiteUrl,
        "linkedin_url": body.linkedinUrl,
        "seed_intel": body.seedIntel or None,
        "website_intel": None,
        "linkedin_intel": None,
        "product_context": None,
        "similar_accounts": None,
        "briefing": None,
        "objections": None,
        "sequence": None,
        "scripts": None,
        "variants": None,
        "errors": [],
    }

    async def event_stream():
        try:
            async for event in graph.astream_events(initial_state, version="v2"):
                if await request.is_disconnected():
                    break

                ev_type = event.get("event", "")
                ev_name = event.get("name", "")

                if ev_type == "on_custom_event":
                    # Phase markers, briefing_chunk, complete, tool events
                    yield f"event: {ev_name}\ndata: {json.dumps(event['data'])}\n\n"

        except Exception as exc:
            log.exception("Pipeline error")
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── POST /api/bulk ────────────────────────────────────────────────────────────

BULK_MODEL = get_config("GEMINI_RESEARCH_MODEL", "gemini-3.5-flash")

ZENDUIT_CONTEXT_SHORT = """
Zenduit fleet telematics products: ZenduONE (GPS+behavior+compliance),
ZenduCAM (AI dashcam), ZenduFuel (fuel monitoring), ZenduMaintenance (predictive),
ZenduIQ (analytics). Target: trucking, construction, oil & gas, distribution.
ROI: 12% idle reduction, 18% insurance savings, 8% fuel savings.
""".strip()

# Per-request cap — also the client batch size. Batches above this are split
# client-side, so the rate limit (below) must comfortably exceed the batch count.
BULK_BATCH_CAP = 20

# index/sequence columns carry no signal — drop them from the extraction prompt
_NOISE_KEYS = {"#", "id", "index", "no", "no.", "sno", "s.no", "row", "row_number"}
_NAME_KEYS = ("company_name", "company", "name", "account", "organization", "account_name")
_SITE_KEYS = ("website", "website_url", "url", "domain", "site", "web")


def _norm_key(k: str) -> str:
    return str(k).strip().lower().replace(" ", "_")


def _pick(row: dict, candidates) -> str:
    """Find the first non-empty value whose normalized key matches a candidate
    (exact first, then substring) — used as a fallback when the LLM omits a field."""
    norm = {_norm_key(k): ("" if v is None else str(v).strip()) for k, v in row.items()}
    for c in candidates:
        if norm.get(c):
            return norm[c]
    for c in candidates:
        for k, v in norm.items():
            if c in k and v:
                return v
    return ""


def _row_to_field_block(row: dict, max_field_len: int = 1500) -> str:
    lines = []
    for k, v in row.items():
        if v is None:
            continue
        val = str(v).strip()
        if not val or _norm_key(k) in _NOISE_KEYS:
            continue
        if len(val) > max_field_len:
            val = val[:max_field_len] + "…"
        label = str(k).strip().replace("_", " ")
        lines.append(f"- {label}: {val}")
    return "\n".join(lines)


async def _extract_prospect(llm, row: dict) -> dict:
    """Dynamically extract Zenduit-relevant intel from one raw spreadsheet row,
    whatever columns it happens to have. Emits the full schema the UI renders
    (company facts + primary contact). Low temperature + an explicit
    no-hallucination instruction so sparse rows return honest empties."""
    field_block = _row_to_field_block(row)
    prompt = f"""{ZENDUIT_CONTEXT_SHORT}

You are given ONE prospect's raw data as fields pulled from a spreadsheet. The
columns vary from sheet to sheet — use whatever is present and ignore what is
missing. Read EVERY field, including long description/operations text and any
contacts list (often formatted "Name (Seniority) - Title [linkedin-url] | ...").

PROSPECT DATA:
{field_block or "(no usable fields)"}

Extract and infer the values below. If something is genuinely absent and cannot be
reasonably inferred FROM THE DATA ABOVE, return an empty string (or [] for arrays).
Do NOT invent fleet sizes, contacts, emails, LinkedIn URLs, DOT numbers, or any
fact not supported by the data. For the primary contact, pick the most senior
decision-maker (prefer C-Level / President / VP / Director of Operations/Safety).

Return compact JSON only (no markdown):
{{
  "companyName": "company name",
  "website": "domain or url if present, else empty",
  "industry": "industry/sector",
  "hq": "headquarters city/state/address if present, else empty",
  "fleetSize": "fleet size or asset counts pulled from description/operations text (e.g. '115 tractors, 290 trailers'), else empty",
  "employeeCount": "employee or driver count if stated (e.g. '111 CDL drivers'), else empty",
  "summary": "2-3 sentence plain-language summary of what the company does, from the description",
  "topPainPoint": "the single most likely operational pain point Zenduit can solve",
  "topProduct": "best-fit Zenduit product name",
  "painPoints": ["2-4 specific operational pain points relevant to fleet telematics"],
  "competitors": ["any current telematics/GPS vendors named in the data, else []"],
  "trackableAssets": ["asset/equipment types from operations, e.g. 'Tractors','Trailers','Reefer','Flatbed'"],
  "signals": ["1-4 concrete buying signals or notable facts found in the data"],
  "displacementAngle": "one line on how Zenduit displaces their current setup or fills a gap",
  "decisionMakerHint": "which role to target (e.g. 'VP Operations / Safety Director')",
  "contactName": "primary decision-maker's full name from the contacts field, else empty",
  "contactTitle": "that contact's title, else empty",
  "contactPhone": "first phone number from any phones field, else empty",
  "contactEmail": "ONLY if an email literally appears in the data, else empty — never guess",
  "contactLinkedIn": "that contact's LinkedIn URL EXACTLY as it appears in brackets, else empty — never fabricate",
  "contactRoleSummary": "one line on the contact's role/seniority, else empty",
  "currentFleetPlatform": "current telematics/GPS platform ONLY if named in the data, else empty",
  "score": <integer 1-10 fit for Zenduit fleet telematics>,
  "reason": "one line justifying the score"
}}"""
    resp = await llm.ainvoke([
        SystemMessage(content="You are a B2B fleet sales analyst for Zenduit. Use ONLY the provided data — never fabricate names, emails, URLs, or numbers. Return only valid JSON, no markdown."),
        HumanMessage(content=prompt),
    ])
    raw = _content_text(resp.content)
    match = re.search(r"\{[\s\S]*\}", raw)
    data = json.loads(match.group()) if match else {}
    if not isinstance(data, dict):
        data = {}

    # fallbacks from the raw row so a row is never nameless/siteless
    if not data.get("companyName"):
        data["companyName"] = _pick(row, _NAME_KEYS)
    if not data.get("website"):
        data["website"] = _pick(row, _SITE_KEYS)
    # normalise array fields
    for arr_key in ("painPoints", "competitors", "trackableAssets", "signals"):
        if not isinstance(data.get(arr_key), list):
            data[arr_key] = []
    # convenience composite still used by the bulk row display + export
    name, title = data.get("contactName", ""), data.get("contactTitle", "")
    data["keyContact"] = f"{name} — {title}" if name and title else (name or "")
    try:
        data["score"] = max(1, min(10, int(float(data.get("score", 5)))))
    except (TypeError, ValueError):
        data["score"] = 5
    return data


@app.post("/api/bulk")
@limiter.limit("40/minute")
async def bulk(
    request: Request,
    body: BulkRequest,
    _auth=Depends(verify_api_key),
):
    if not body.prospects:
        raise HTTPException(400, "Provide a non-empty prospects array.")

    llm = ChatGoogleGenerativeAI(model=BULK_MODEL, temperature=0.2)
    results = []

    for row in body.prospects[:BULK_BATCH_CAP]:
        if not isinstance(row, dict):
            results.append({"companyName": "", "status": "error", "reason": "invalid row"})
            continue
        try:
            data = await _extract_prospect(llm, row)
            results.append({**data, "status": "success"})
        except Exception as exc:
            results.append({
                "companyName": _pick(row, _NAME_KEYS),
                "website": _pick(row, _SITE_KEYS),
                "status": "error",
                "reason": str(exc),
            })

    return {"results": results}


# ── Library ───────────────────────────────────────────────────────────────────

@app.get("/api/library")
async def get_library(_auth=Depends(verify_api_key)):
    return await read_library()


@app.post("/api/library")
async def save_library(
    body: LibrarySaveRequest,
    _auth=Depends(verify_api_key),
):
    await write_library(body.library)
    return {"ok": True, "count": len(body.library)}


# ── Outcomes (closed-loop campaign tracking) ───────────────────────────────────

@app.get("/api/outcomes")
async def get_outcomes(_auth=Depends(verify_api_key)):
    return await read_outcomes()


@app.get("/api/outcomes/stats")
async def get_outcome_stats(_auth=Depends(verify_api_key)):
    return compute_stats(await read_outcomes())


@app.post("/api/outcomes")
@limiter.limit("60/minute")
async def post_outcome(
    request: Request,
    body: OutcomeRequest,
    _auth=Depends(verify_api_key),
):
    # company is required to create; on update (id present) it may be omitted
    if not body.id and not (body.company or "").strip():
        raise HTTPException(400, "company is required")
    record = await record_outcome(body.model_dump())
    prev_status = record.pop("_prevStatus", None)
    # Alert on a *transition* into BOOKED — covers create-as-booked and the common
    # "flip an existing row to BOOKED" path, without re-alerting on later edits.
    if record.get("status") == "BOOKED" and prev_status != "BOOKED":
        await notify_booking(record)
    return record


@app.delete("/api/outcomes/{outcome_id}")
async def remove_outcome(
    outcome_id: str,
    _auth=Depends(verify_api_key),
):
    ok = await delete_outcome(outcome_id)
    if not ok:
        raise HTTPException(404, "outcome not found")
    return {"ok": True}


# ── Reply classifier + objection miner ─────────────────────────────────────────

CLASSIFY_MODEL = get_config("GEMINI_RESEARCH_MODEL", "gemini-3.5-flash")

# The classifier emits the "replied" subset of the outcome enum so its result can
# be logged straight into the outcome tracker.
_CLASSIFY_STATUSES = ["BOOKED", "FUTURE", "UNKNOWN", "REJECTED"]


@app.post("/api/classify-reply")
@limiter.limit("20/minute")
async def classify_reply(
    request: Request,
    body: ClassifyReplyRequest,
    _auth=Depends(verify_api_key),
):
    if not body.reply.strip():
        raise HTTPException(400, "reply text is required")

    llm = ChatGoogleGenerativeAI(model=CLASSIFY_MODEL, temperature=0.1)
    ctx = ""
    if body.companyName.strip():
        ctx += f"Prospect company: {body.companyName.strip()}\n"
    if body.context.strip():
        ctx += f"Outreach context: {body.context.strip()}\n"

    prompt = f"""{ctx}A prospect replied to a Zenduit sales outreach. Their reply is in triple quotes:

\"\"\"{body.reply.strip()}\"\"\"

Classify the reply into exactly one status:
- BOOKED   — they agreed to a meeting/call or proposed a specific time
- FUTURE   — interested but want to be contacted later / not right now
- REJECTED — declined, not interested, or asked to stop
- UNKNOWN  — replied but intent is unclear

Return ONLY compact JSON (no markdown fences):
{{ "status": "BOOKED|FUTURE|REJECTED|UNKNOWN", "reason": "one line — the objection or the core of their reply", "suggestedNextStep": "one concrete next action for the rep" }}"""

    try:
        resp = await llm.ainvoke([
            SystemMessage(content="You are a B2B sales reply analyst. Return only valid JSON, no markdown."),
            HumanMessage(content=prompt),
        ])
        raw = _content_text(resp.content)
        match = re.search(r"\{[\s\S]*\}", raw)
        data = json.loads(match.group()) if match else {}
    except Exception as exc:
        log.warning("classify-reply failed: %s", exc)
        data = {}

    status = str(data.get("status", "")).strip().upper()
    if status not in _CLASSIFY_STATUSES:
        status = "UNKNOWN"
    return {
        "status": status,
        "reason": str(data.get("reason", "")).strip(),
        "suggestedNextStep": str(data.get("suggestedNextStep", "")).strip(),
    }


# ── Single-entry library save (universal trigger) ─────────────────────────────

class LibraryEntryRequest(BaseModel):
    id: str = ""
    companyName: str = ""
    assignedRep: dict | None = None
    intel: dict | None = None
    # Accept any extra fields
    class Config:
        extra = "allow"


@app.post("/api/library/entry")
@limiter.limit("60/minute")
async def save_library_entry(
    request: Request,
    _auth=Depends(verify_api_key),
):
    body = await request.json()
    if not body.get("id"):
        body["id"] = uuid.uuid4().hex
    body.setdefault("savedAt", datetime.utcnow().isoformat())
    entry = await append_library_entry(body)

    rep = body.get("assignedRep") or {}
    if rep.get("email") and get_config("GMAIL_USER"):
        from app.email_sender import send_lead_ready
        asyncio.create_task(send_lead_ready(rep, entry))
    if rep.get("email") and get_config("CLICKUP_API_TOKEN") and get_config("CLICKUP_LIST_ID"):
        asyncio.create_task(_create_and_track_task(rep, entry))

    return {"status": "saved", "id": entry["id"]}


async def _create_and_track_task(rep: dict, entry: dict):
    from app.clients.clickup import create_lead_task
    from app.sync_state import save_task
    task_id = await create_lead_task(rep, entry)
    if task_id:
        await save_task(
            entry.get("id", ""),
            task_id,
            rep.get("email", ""),
            entry.get("companyName", ""),
        )


@app.get("/api/library/{lead_id}")
async def get_lead(lead_id: str):
    entry = await get_library_entry(lead_id)
    if not entry:
        raise HTTPException(404, "Lead not found")
    return entry


# ── Zoho CRM webhook ──────────────────────────────────────────────────────────

@app.post("/api/zoho/lead")
async def zoho_lead_webhook(request: Request):
    secret = get_config("ZOHO_WEBHOOK_SECRET")
    if secret and request.headers.get("X-Zoho-Signature") != secret:
        raise HTTPException(403, "Invalid signature")
    payload = await request.json()
    asyncio.create_task(_process_zoho_lead(payload))
    return {"status": "accepted"}


async def _process_zoho_lead(payload: dict):
    from app.clients.zoho_crm import extract_lead_fields_ai
    from app.rep_directory import resolve_rep
    from app.sync_state import read_sync_state, mark_lead_processed
    from app.pipeline import run_pipeline
    from app.email_sender import send_lead_ready

    try:
        seed = await extract_lead_fields_ai(payload)
        lead_id = seed.get("leadId", "")

        state = await read_sync_state()
        if lead_id and lead_id in state.get("zoho_processed_lead_ids", []):
            log.info("Zoho lead %s already processed, skipping", lead_id)
            return

        rep = await resolve_rep(seed.get("ownerName", ""), seed.get("ownerEmail", ""))
        result = await run_pipeline(
            company_name=seed.get("companyName", ""),
            website_url=seed.get("websiteUrl", ""),
            seed_intel=seed,
        )
        entry = {
            **result,
            "id": uuid.uuid4().hex,
            "savedAt": datetime.utcnow().isoformat(),
            "assignedRep": rep,
            "source": "zoho",
        }
        await append_library_entry(entry)

        if rep.get("email") and get_config("GMAIL_USER"):
            asyncio.create_task(send_lead_ready(rep, entry))
        if rep.get("email") and get_config("CLICKUP_API_TOKEN") and get_config("CLICKUP_LIST_ID"):
            asyncio.create_task(_create_and_track_task(rep, entry))

        if lead_id:
            await mark_lead_processed(lead_id)

        log.info("Zoho lead processed: %s -> entry %s", seed.get("companyName"), entry["id"])
    except Exception as e:
        log.error("Zoho lead processing failed: %s", e)


# ── Reps ──────────────────────────────────────────────────────────────────────

@app.get("/api/reps")
async def get_reps(_auth=Depends(verify_api_key)):
    from app.clients.clickup import CLICKUP_MEMBERS
    return sorted(
        [{"name": k, "id": v} for k, v in CLICKUP_MEMBERS.items()],
        key=lambda r: r["name"],
    )


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings(_auth=Depends(verify_api_key)):
    saved = await read_credentials_file()
    result = {}
    for group, keys in SETTINGS_SCHEMA.items():
        for key in keys:
            val = get_config(key) or saved.get(key, "")
            result[key] = {
                "group": group,
                "configured": bool(val),
                "value": val if key in PLAINTEXT_FIELDS else None,
            }
    return result


@app.post("/api/settings")
@limiter.limit("30/minute")
async def save_settings(
    request: Request,
    _auth=Depends(verify_api_key),
):
    body = await request.json()
    saved = await read_credentials_file()
    for k, v in body.items():
        if v is not None and str(v).strip():
            saved[k] = str(v).strip()
    await write_credentials_file(saved)
    return {"status": "saved", "keys": list(body.keys())}


# ── Leaderboard ───────────────────────────────────────────────────────────────

@app.get("/api/leaderboard")
async def get_leaderboard(period: str = "all", _auth=Depends(verify_api_key)):
    from app.leaderboard import compute_leaderboard
    if period not in ("all", "weekly", "monthly"):
        raise HTTPException(400, "period must be all, weekly, or monthly")
    return await compute_leaderboard(period)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "auth_required": bool(get_config("API_SECRET")),
        "model": BULK_MODEL,
        "brain_mcp": bool(get_config("BRAIN_MCP_URL")),
        "linkedin_mcp": bool(get_config("LINKEDIN_MCP_URL")),
        "slack_alerts": bool(get_config("SLACK_WEBHOOK_URL")),
        "gmail": bool(get_config("GMAIL_USER") and get_config("GMAIL_APP_PASSWORD")),
        "clickup": bool(get_config("CLICKUP_API_TOKEN") and get_config("CLICKUP_LIST_ID")),
        "zoho_webhook": bool(get_config("ZOHO_WEBHOOK_SECRET")),
        "outcome_statuses": OUTCOME_STATUSES,
    }


# ── LinkedIn ───────────────────────────────────────────────────────────────────

@app.get("/api/linkedin/status")
async def linkedin_status():
    url = get_config("LINKEDIN_MCP_URL", "").rstrip("/")
    if not url:
        return {"connected": False, "reason": "LINKEDIN_MCP_URL not configured"}
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{url}/health")
        online = r.status_code < 500
    except Exception:
        online = False
    return {"connected": online, "url": url}


class LinkedInSendRequest(BaseModel):
    profileUrl: str
    message: str


@app.post("/api/linkedin/send")
@limiter.limit("20/minute")
async def linkedin_send(
    request: Request,
    body: LinkedInSendRequest,
    _auth=Depends(verify_api_key),
):
    if not body.profileUrl or not body.message:
        raise HTTPException(400, "profileUrl and message are required")
    if not get_config("LINKEDIN_MCP_URL"):
        raise HTTPException(503, "LinkedIn MCP not configured — configure it in Settings")
    from app.clients.linkedin_mcp import send_linkedin_message
    try:
        result = await send_linkedin_message(body.profileUrl, body.message)
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(500, str(exc))


# ── SPA static file serving (production) ─────────────────────────────────────

_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.isdir(_DIST):
    _assets = os.path.join(_DIST, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(_DIST, "index.html"))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(get_config("PORT", "3001"))
    log.info("Starting Zenduit Intel backend on port %d", port)
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
