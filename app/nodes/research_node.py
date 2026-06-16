"""
Phase 2 — Prospect Research.

Agentic Gemini loop: web_search + web_fetch tools, up to 8 rounds.
Streams tool-call events to the browser as they happen.
"""
import json
import logging
import os
import re
import socket
from urllib.parse import urlparse, urljoin

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from app.state import IntelState
from app.credentials import get_config

log = logging.getLogger(__name__)

_PRIVATE_IP = re.compile(
    r"^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc00:|fe80:)"
)

RESEARCH_MODEL = get_config("GEMINI_RESEARCH_MODEL", "gemini-3.5-flash")
DEEP_RESEARCH_MODEL = get_config("GEMINI_DEEP_RESEARCH_MODEL", "")

_REGION_BLOCKLIST = {
    "north america", "usa", "united states", "canada", "europe",
    "latin america", "south america", "asia", "middle east", "africa",
    "apac", "emea", "global",
}

# Fields where seed data (e.g. a bulk CSV row the user supplied) is ground truth and
# must not be overwritten by web-research guesses. Other fields: research wins, seed
# only fills gaps the research left empty.
_CSV_AUTHORITATIVE = {
    "companyName", "hq", "fleetSize", "employeeCount",
    "contactName", "contactTitle", "contactPhone", "contactEmail",
    "contactLinkedIn", "contactRoleSummary", "currentFleetPlatform",
    "trackableAssets",
}


def _is_empty(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    if isinstance(v, (list, dict, tuple, set)):
        return len(v) == 0
    return False


def _merge_intel(seed: dict, fresh: dict) -> dict:
    """Combine seed (authoritative known facts) with fresh research.
    CSV-authoritative fields: seed wins when present. Everything else:
    research wins, seed fills only the gaps research left empty."""
    if not seed:
        return fresh
    out = dict(fresh)
    for k, v in seed.items():
        if _is_empty(v):
            continue
        if k in _CSV_AUTHORITATIVE or _is_empty(out.get(k)):
            out[k] = v
    return out


# ── Web tools ─────────────────────────────────────────────────────────────────

async def _ddg_search(query: str) -> str:
    try:
        params = {"q": query}
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        }
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                "https://lite.duckduckgo.com/lite/", params=params, headers=headers
            )
        html = resp.text
        url_hits = re.findall(r'href="//duckduckgo\.com/l/\?uddg=([^&"]+)', html)[:7]
        title_hits = re.findall(r"class='result-link'>([^<]+)</a>", html)[:7]
        snippet_hits = re.findall(r"class='result-snippet'>(.+?)</td>", html, re.DOTALL)[:7]
        results = []
        for i, raw_url in enumerate(url_hits):
            decoded = re.sub(r"%([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), raw_url)
            if not decoded.startswith("http"):
                continue
            results.append({
                "title": title_hits[i].strip() if i < len(title_hits) else f"Result {i+1}",
                "url": decoded,
                "snippet": re.sub(r"<[^>]+>", "", snippet_hits[i]).strip() if i < len(snippet_hits) else "",
            })
        return json.dumps(results) if results else json.dumps([{"info": f'No results for "{query}"'}])
    except Exception as exc:
        return json.dumps([{"error": f"Search failed: {exc}"}])


def _validate_url_host(url: str) -> str | None:
    """Return an error string if the URL targets a private/internal host, else None."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return "Error: Only HTTP/HTTPS URLs are allowed"
    host = parsed.hostname or ""
    try:
        ip = socket.gethostbyname(host)
        if _PRIVATE_IP.match(ip):
            return "Error: Private/internal addresses are not accessible"
    except socket.gaierror:
        return f"Error: Could not resolve hostname {host}"
    return None


async def _web_fetch(url: str) -> str:
    try:
        err = _validate_url_host(url)
        if err:
            return err

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        }

        _MAX_REDIRECTS = 5
        current_url = url
        resp = None
        for _ in range(_MAX_REDIRECTS + 1):
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                resp = await client.get(current_url, headers=headers)
            if resp.status_code not in (301, 302, 303, 307, 308):
                break
            location = resp.headers.get("location", "")
            if not location:
                break
            next_url = urljoin(current_url, location)
            redirect_err = _validate_url_host(next_url)
            if redirect_err:
                return f"Error: Redirect blocked — {redirect_err}"
            current_url = next_url
        else:
            return "Error: Too many redirects"
        html = resp.text
        text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
        text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<nav[\s\S]*?</nav>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<footer[\s\S]*?</footer>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<!--[\s\S]*?-->", "", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()[:6000]
        return text or "Page fetched but no readable text content found."
    except Exception as exc:
        return f"Error fetching {url}: {exc}"


@tool
async def web_search(query: str) -> str:
    """Search the web for current information about companies, news, fleet operations, or industry trends."""
    return await _ddg_search(query)


@tool
async def web_fetch(url: str) -> str:
    """Fetch and read the text content of a specific web page. Only HTTP/HTTPS URLs."""
    return await _web_fetch(url)


TOOLS = [web_search, web_fetch]
TOOL_MAP = {t.name: t for t in TOOLS}

# ── Prompts ───────────────────────────────────────────────────────────────────

ZENDUIT_BRIEF = (
    "Zenduit is a fleet telematics company selling: ZenduONE (GPS + driver behavior + compliance), "
    "ZenduCAM (AI dashcam), ZenduFuel (fuel monitoring), ZenduMaintenance (predictive), ZenduIQ (analytics). "
    "Target verticals: trucking, construction, oil & gas, field services, distribution. "
    "Key ROI: 12% idle reduction, 18% insurance savings, 8% fuel savings."
)

RESEARCH_SYSTEM = """You are an elite B2B sales intelligence analyst for Zenduit, a fleet telematics company.
Use web_search and web_fetch aggressively to build deep company and operations intelligence.
Always fetch the actual company website and its key sub-pages.
Never output "Unknown" when you can make a reasonable inference or guess.
After all research, return ONLY a valid JSON object — no markdown, no explanation, just the JSON."""

RESEARCH_SYSTEM_GROUNDED = """You are an elite B2B sales intelligence analyst for Zenduit, a fleet telematics company.
Use Google Search aggressively to build deep company and operations intelligence.
Never output "Unknown" when you can make a reasonable inference or guess.
After all research, return ONLY a valid JSON object — no markdown, no explanation, just the JSON."""


def _build_research_prompt(state: IntelState) -> str:
    company_name = state.get("company_name") or "unknown"
    website_url = state.get("website_url") or "unknown"
    ind = "fleet" if company_name == "unknown" else f"{company_name} industry"

    seed = state.get("seed_intel") or {}
    known = {k: v for k, v in seed.items() if not _is_empty(v) and k not in ("score", "reason", "summary")}
    known_block = ""
    if known:
        known_block = (
            "\nKNOWN FACTS (authoritative — supplied from the user's CRM/spreadsheet). "
            "Treat these as ground truth: do NOT contradict or replace them. Use them to "
            "guide your research, and focus your effort on enriching what's missing "
            "(recent news, competitors, hiring signals, industry trends, displacement angle):\n"
            + json.dumps(known, indent=2)
            + "\n"
        )

    return f"""
TARGET COMPANY:
- Website: {website_url}
- Company Name: {company_name}
{known_block}
ZENDUIT CONTEXT:
{ZENDUIT_BRIEF}

Research this company thoroughly using web_search and web_fetch. Follow ALL these steps:

1. WEBSITE — fetch the main URL and key sub-pages:
   - Fetch {website_url} for overview, industry, and operations
   - Try sub-pages that likely exist: /fleet, /solutions, /safety, /operations, /services, /tracking
   - Fetch /about or /company to understand size, founding, and leadership
   - Fetch /careers to find open fleet/logistics/safety roles (hiring = fleet growth indicator)
   - Fetch /case-studies, /customers, or /resources for social proof and use cases

2. HEADQUARTERS LOCATION — do these searches BEFORE anything else:
   - Search "{company_name} headquarters address city"
   - Search "{company_name} office location"
   - Fetch their /contact page and look for a physical street address
   - "hq" MUST be "City, State/Province, Country" — e.g. "Brooklyn, NY, USA" or "Calgary, AB, Canada"
   - NEVER return just a region like "North America", "USA", "United States", "Canada", "Europe"
   - If you cannot find a city, leave hq as empty string — never guess the country alone

3. RECENT NEWS & TRIGGERS:
   - Search "{company_name} press release OR expansion OR acquisition OR funding 2025 2026"
   - Search "{company_name} fleet OR logistics OR driver OR vehicle news 2025"

4. HIRING SIGNALS (fleet growth indicator):
   - Search "{company_name} hiring driver OR fleet manager OR logistics OR dispatcher OR safety officer"

5. CURRENT VENDORS & DISPLACEMENT ANGLE:
   - Search "{company_name} Samsara OR Geotab OR Verizon Connect OR Lytx OR Motive fleet telematics"
   - Identify what vendor they use now and what specific gap Zenduit could fill

6. INDUSTRY TRENDS:
   - Search "{ind} telematics trends 2025 2026" for 2-3 relevant macro trends

7. CONTACT DISCOVERY — do all of these:
   a) Fetch /about, /team, /contact, or /leadership page — extract staff names and titles
   b) Search "{company_name} \\"fleet manager\\" OR \\"VP operations\\" OR \\"director of logistics\\" contact"
   c) Search "{company_name} \\"fleet\\" OR \\"operations\\" email"
   d) Once you have a name, guess email using common patterns: firstname@domain.com, firstname.lastname@domain.com
   e) Search "{company_name} phone number" or fetch their /contact page
   f) Identify their current telematics/GPS system

   IMPORTANT: Never output "Unknown" for contactName if you found any name at all.

Return ONLY this JSON (no markdown fences):
{{
  "companyName": string,
  "industry": string,
  "hq": string,
  "employeeCount": string,
  "fleetSize": string,
  "summary": string,
  "recentNews": [{{"headline": string, "relevance": string}}],
  "painPoints": [string],
  "competitors": [string],
  "productMatches": [{{"product": string, "reason": string, "value": string}}],
  "prospectContext": string,
  "focus": string,
  "topProduct": string,
  "topPainPoint": string,
  "recentEvent": string,
  "score": number,
  "industryTrends": [string],
  "hiringSignals": string,
  "fundingOrExpansion": string,
  "displacementAngle": string,
  "decisionMakerHint": string,
  "contactName": string,
  "contactTitle": string,
  "contactEmail": string,
  "contactPhone": string,
  "contactRoleSummary": string,
  "currentFleetPlatform": string,
  "trackableAssets": [string]
}}""".strip()


# ── HQ blocklist helper ───────────────────────────────────────────────────────

def _blank_vague_hq(intel: dict) -> dict:
    hq = (intel.get("hq") or "").strip()
    if hq.lower() in _REGION_BLOCKLIST:
        intel["hq"] = ""
    return intel


# ── Deep Research (Google Interactions API) ────────────────────────────────────

async def _deep_research_gemini(state: IntelState) -> dict:
    import asyncio as _asyncio
    import google.genai as genai

    company = state.get("company_name") or "unknown"
    website = state.get("website_url") or ""
    seed = state.get("seed_intel") or {}

    site_clause = f"Their website is {website}." if website and website not in ("unknown", "") else ""
    query = (
        f"Research {company} thoroughly for B2B sales intelligence. {site_clause}\n"
        f"Find: headquarters city and address, industry, fleet size, employee count, "
        f"recent news (funding/expansion/hiring), current telematics/GPS vendor, "
        f"key decision maker (name, title, contact info), top pain points for fleet operations, "
        f"competitors they may be using (Samsara, Geotab, Motive, Verizon Connect, Lytx), "
        f"hiring signals, and any recent events relevant to a fleet telematics sales conversation."
    )

    api_key = get_config("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)
    model = DEEP_RESEARCH_MODEL or "deep-research-preview-04-2026"

    loop = _asyncio.get_event_loop()
    interaction = await loop.run_in_executor(
        None,
        lambda: client.interactions.create(input=query, agent=model, background=True),
    )

    max_polls = 60
    for _ in range(max_polls):
        await _asyncio.sleep(10)
        interaction = await loop.run_in_executor(
            None,
            lambda: client.interactions.get(interaction.id),
        )
        if getattr(interaction, "status", None) in ("completed", "failed"):
            break

    if getattr(interaction, "status", None) != "completed":
        raise RuntimeError(f"Deep research did not complete (status={getattr(interaction,'status','?')})")

    report_text = ""
    for attr in ("result", "output", "text"):
        val = getattr(interaction, attr, None)
        if val:
            report_text = str(val)
            break

    parser_llm = ChatGoogleGenerativeAI(
        model=get_config("GEMINI_RESEARCH_MODEL", "gemini-2.0-flash"),
        google_api_key=api_key,
    )
    parse_prompt = f"""Extract structured sales intelligence from this research report about {company}.

RESEARCH REPORT:
{report_text[:15000]}

Return ONLY valid JSON matching this exact schema (no markdown fences):
{{
  "companyName": string,
  "industry": string,
  "hq": "City, State, Country — city-level required, NEVER just a region or country name. Empty string if city unknown.",
  "employeeCount": string,
  "fleetSize": string,
  "summary": string,
  "recentNews": [{{"headline": string, "relevance": string}}],
  "painPoints": [string],
  "competitors": [string],
  "productMatches": [{{"product": string, "reason": string, "value": string}}],
  "topProduct": string,
  "topPainPoint": string,
  "recentEvent": string,
  "score": number,
  "industryTrends": [string],
  "hiringSignals": string,
  "fundingOrExpansion": string,
  "displacementAngle": string,
  "decisionMakerHint": string,
  "contactName": string,
  "contactTitle": string,
  "contactEmail": string,
  "contactPhone": string,
  "contactRoleSummary": string,
  "currentFleetPlatform": string,
  "trackableAssets": [string]
}}"""

    parse_resp = await parser_llm.ainvoke([HumanMessage(content=parse_prompt)])
    raw = _content_text(parse_resp.content)
    match = re.search(r"\{[\s\S]*\}", raw)
    intel: dict = {}
    if match:
        try:
            intel = json.loads(match.group())
        except json.JSONDecodeError:
            pass
    if not intel:
        intel = {"companyName": company, "summary": report_text[:500]}

    intel = _blank_vague_hq(intel)
    if seed:
        intel = _merge_intel(seed, intel)
    return {"website_intel": intel}


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            (c.get("text", "") if isinstance(c, dict) else str(c)) for c in content
        )
    return str(content) if content else ""


# ── DDG agentic loop (original research_node body) ────────────────────────────

async def _ddg_research_loop(state: IntelState, config: RunnableConfig) -> dict:
    await adispatch_custom_event(
        "phase",
        {"phase": 1, "label": "Website Research", "status": "start"},
        config=config,
    )

    llm = ChatGoogleGenerativeAI(model=RESEARCH_MODEL, temperature=0.1)
    llm_with_tools = llm.bind_tools(TOOLS)

    messages = [
        SystemMessage(content=RESEARCH_SYSTEM),
        HumanMessage(content=_build_research_prompt(state)),
    ]

    sources: list[str] = []   # URLs whose page content was actually scraped
    searches: list[str] = []  # search queries that were run

    for _ in range(8):
        response = await llm_with_tools.ainvoke(messages, config=config)
        messages.append(response)

        if not response.tool_calls:
            break

        for call in response.tool_calls:
            name = call["name"]
            args = call["args"]
            await adispatch_custom_event(
                "tool",
                {"name": name, "input": args},
                config=config,
            )
            tool_fn = TOOL_MAP.get(name)
            result = await tool_fn.ainvoke(args, config=config) if tool_fn else "Unknown tool"
            result_str = str(result)

            # Surface the actual scraped data so the execution log shows what the
            # research is built from — search hits and fetched page content.
            payload: dict = {"name": name}
            if name == "web_search":
                query = args.get("query", "")
                searches.append(query)
                try:
                    hits = json.loads(result_str)
                except (json.JSONDecodeError, TypeError):
                    hits = []
                clean = [h for h in hits if isinstance(h, dict) and h.get("url")]
                payload.update({
                    "kind": "search",
                    "query": query,
                    "count": len(clean),
                    "items": [
                        {
                            "title": (h.get("title") or "")[:140],
                            "url": h.get("url", ""),
                            "snippet": (h.get("snippet") or "")[:220],
                        }
                        for h in clean[:6]
                    ],
                })
            elif name == "web_fetch":
                url = args.get("url", "")
                is_error = result_str.startswith("Error")
                if not is_error and url:
                    sources.append(url)
                payload.update({
                    "kind": "fetch",
                    "url": url,
                    "ok": not is_error,
                    "chars": 0 if is_error else len(result_str),
                    "preview": result_str[:500],
                })
            else:
                payload.update({"kind": "other", "preview": result_str[:300]})

            await adispatch_custom_event("tool_result", payload, config=config)
            messages.append(ToolMessage(content=result_str, tool_call_id=call["id"]))
    else:
        # Hit the iteration cap — do one final call without tools to force JSON output
        response = await ChatGoogleGenerativeAI(model=RESEARCH_MODEL, temperature=0.1).ainvoke(
            messages, config=config
        )

    # LangChain/Gemini returns content as a list of parts when mixing text + tool calls
    content = response.content
    if isinstance(content, list):
        raw = " ".join(
            c.get("text", "") if isinstance(c, dict) else str(c)
            for c in content
        )
    else:
        raw = content or ""

    intel: dict = {}
    try:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            intel = json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        pass

    # Always ensure at minimum the company name and a summary are present
    if not intel:
        intel = {
            "companyName": state.get("company_name") or "Unknown",
            "summary": raw[:500] if raw.strip() else "Research data unavailable",
        }
    elif not intel.get("companyName"):
        intel["companyName"] = state.get("company_name") or "Unknown"

    # Blank vague regional HQ values before merge
    intel = _blank_vague_hq(intel)

    # Preserve authoritative seed facts (CSV) — research enriches, never clobbers them
    seed = state.get("seed_intel") or {}
    if seed:
        intel = _merge_intel(seed, intel)

    log.info("website_intel populated: companyName=%s, keys=%s", intel.get("companyName"), list(intel.keys()))

    # Summarise where the research data came from and which fields it produced —
    # makes the "what scraped data is utilized" story explicit in the execution log.
    seed_fields = {k for k in seed if not _is_empty(seed.get(k))} if seed else set()
    field_provenance = []
    for k, v in intel.items():
        if _is_empty(v):
            continue
        if k in seed_fields and k in _CSV_AUTHORITATIVE:
            source = "sheet"          # CSV is authoritative — seed always wins
        elif k in seed_fields:
            source = "sheet+research"  # seed supplied it; research may have refined it
        else:
            source = "research"        # produced purely from scraped web data
        field_provenance.append({"field": k, "source": source})

    await adispatch_custom_event(
        "research_summary",
        {
            "searches": searches,
            "sources": sorted(set(sources)),
            "fieldsPopulated": [k for k, v in intel.items() if not _is_empty(v)],
            "fieldProvenance": field_provenance,
            "seedFields": sorted(seed_fields),
        },
        config=config,
    )

    await adispatch_custom_event(
        "phase",
        {"phase": 1, "label": "Website Research", "status": "complete", "data": intel},
        config=config,
    )

    return {"website_intel": intel, "errors": []}


# ── Google Search Grounding (primary cloud path) ──────────────────────────────

async def _grounded_research(state: IntelState, config: RunnableConfig) -> dict:
    """Research via Google Search Grounding — works reliably from cloud servers."""
    import asyncio as _asyncio
    import google.genai as genai
    from google.genai import types as genai_types

    await adispatch_custom_event(
        "phase",
        {"phase": 1, "label": "Website Research", "status": "start"},
        config=config,
    )

    api_key = get_config("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)

    grounding_tool = genai_types.Tool(google_search=genai_types.GoogleSearch())
    gen_config = genai_types.GenerateContentConfig(
        tools=[grounding_tool],
        temperature=0.1,
    )

    prompt = RESEARCH_SYSTEM_GROUNDED + "\n\n" + _build_research_prompt(state)

    loop = _asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=RESEARCH_MODEL,
            contents=prompt,
            config=gen_config,
        ),
    )

    # Extract grounding metadata for sources and search queries
    searches: list[str] = []
    sources: list[str] = []
    try:
        gm = response.candidates[0].grounding_metadata
        if gm:
            searches = list(gm.web_search_queries or [])
            sources = [
                c.web.uri for c in (gm.grounding_chunks or [])
                if c.web and c.web.uri
            ]
    except (AttributeError, IndexError):
        pass

    # Emit search events so the execution log shows what was searched
    for query in searches:
        await adispatch_custom_event(
            "tool", {"name": "web_search", "input": {"query": query}}, config=config
        )
        await adispatch_custom_event(
            "tool_result",
            {"name": "web_search", "kind": "search", "query": query, "count": 0, "items": []},
            config=config,
        )

    raw = response.text or ""

    intel: dict = {}
    try:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            intel = json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        pass

    if not intel:
        intel = {
            "companyName": state.get("company_name") or "Unknown",
            "summary": raw[:500] if raw.strip() else "Research data unavailable",
        }
    elif not intel.get("companyName"):
        intel["companyName"] = state.get("company_name") or "Unknown"

    intel = _blank_vague_hq(intel)
    seed = state.get("seed_intel") or {}
    if seed:
        intel = _merge_intel(seed, intel)

    log.info("Grounded research: companyName=%s searches=%d sources=%d",
             intel.get("companyName"), len(searches), len(sources))

    seed_fields = {k for k in seed if not _is_empty(seed.get(k))} if seed else set()
    field_provenance = []
    for k, v in intel.items():
        if _is_empty(v):
            continue
        src = (
            "sheet" if (k in seed_fields and k in _CSV_AUTHORITATIVE)
            else "sheet+research" if k in seed_fields
            else "research"
        )
        field_provenance.append({"field": k, "source": src})

    await adispatch_custom_event(
        "research_summary",
        {
            "searches": searches,
            "sources": sorted(set(sources)),
            "fieldsPopulated": [k for k, v in intel.items() if not _is_empty(v)],
            "fieldProvenance": field_provenance,
            "seedFields": sorted(seed_fields),
        },
        config=config,
    )

    await adispatch_custom_event(
        "phase",
        {"phase": 1, "label": "Website Research", "status": "complete", "data": intel},
        config=config,
    )

    return {"website_intel": intel, "errors": []}


# ── Public node — dispatcher ───────────────────────────────────────────────────

async def research_node(state: IntelState, config: RunnableConfig) -> dict:
    if DEEP_RESEARCH_MODEL:
        try:
            log.info("Using Deep Research model: %s", DEEP_RESEARCH_MODEL)
            await adispatch_custom_event(
                "phase",
                {"phase": 1, "label": "Website Research (Deep)", "status": "start"},
                config=config,
            )
            result = await _deep_research_gemini(state)
            await adispatch_custom_event(
                "phase",
                {"phase": 1, "label": "Website Research (Deep)", "status": "complete",
                 "data": result.get("website_intel", {})},
                config=config,
            )
            return {**result, "errors": []}
        except Exception as e:
            log.warning("Deep research failed (%s), falling back", e)

    try:
        return await _grounded_research(state, config)
    except Exception as e:
        log.warning("Grounded research failed (%s), falling back to DDG loop", e)
        return await _ddg_research_loop(state, config)
