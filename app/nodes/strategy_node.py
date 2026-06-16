"""
Phase 3 — Strategy Generation.

Four Gemini calls:
  1. Executive Briefing (HTML) — streamed as briefing_chunk SSE events
  2. Objection Table (HTML)
  3. 14-Day Sequence (JSON)
  4. Outreach Scripts (JSON, 5 types)

The briefing streams live to the browser; the other three are silent
non-streaming calls to keep total latency reasonable.
"""
import json
import logging
import os
import re

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI

from app.state import IntelState

log = logging.getLogger(__name__)

GENERATION_MODEL = os.getenv("GEMINI_GENERATION_MODEL", "gemini-3.5-flash")


def _text(content) -> str:
    """Normalise Gemini content — may be str or list of block dicts."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content) if content else ""


def _clean(v, fallback=None):
    if not v:
        return fallback
    s = str(v).strip()
    if not s or s.lower() in ("unknown", "n/a", "none", ""):
        return fallback
    return s


def _clean_arr(a, fallback=None):
    if fallback is None:
        fallback = []
    if not isinstance(a, list):
        return fallback
    return [v for v in a if _clean(v)]


def _build_company_context(intel: dict, linkedin_intel: dict = None, company_name_fallback: str = "") -> str:
    li = linkedin_intel or {}
    linkedin_context = _compress_linkedin_intel(li)
    linkedin_signals = " | ".join(_clean_arr(li.get("linkedinSignals"))[:3]) or "no direct signals — use industry triggers"
    person_signals = " | ".join(_clean_arr(li.get("personSignals"))[:2]) or "none"
    name = intel.get("companyName") or company_name_fallback or "Target Company"
    return f"""
COMPANY: {name}
Industry: {_clean(intel.get("industry"), "Fleet Operations")}
Fleet Size: {_clean(intel.get("fleetSize"), "enterprise-scale")}
HQ: {_clean(intel.get("hq"), "North America")}
Top Pain Point: {_clean(intel.get("topPainPoint"), "operational efficiency and fleet visibility")}
Recent Event: {_clean(intel.get("recentEvent")) or _clean(intel.get("fundingOrExpansion")) or "active fleet operations"}
Best Fit Product: {_clean(intel.get("topProduct"), "ZenduONE")}
Current Vendors: {", ".join(_clean_arr(intel.get("competitors"))) or "not identified — assume competitive displacement opportunity"}
LinkedIn Signals: {linkedin_signals}
Person Signals: {person_signals}
Industry Trends: {" | ".join(_clean_arr(intel.get("industryTrends"))[:2]) or "rising fuel costs, ELD compliance, driver retention"}
Hiring Signals: {_clean(intel.get("hiringSignals"), "none found")}
Funding/Expansion: {_clean(intel.get("fundingOrExpansion"), "none found")}
Displacement Angle: {_clean(intel.get("displacementAngle"), "highlight ZenduONE unified platform vs point solutions")}
Decision Maker Hint: {intel.get("decisionMakerHint") or "VP Operations or Fleet Manager"}
{chr(10) + "--- LINKEDIN DATA ---" + chr(10) + linkedin_context + chr(10) + "---" if linkedin_context else ""}
""".strip()


# ── Individual generation steps ───────────────────────────────────────────────

async def _generate_briefing(
    company_ctx: str, product_context: str, config: RunnableConfig
) -> str:
    """Stream briefing HTML tokens as briefing_chunk SSE events."""
    system = "You are a Zenduit enterprise sales strategist. Generate detailed, hyper-specific HTML sales briefings. Use only HTML tags — no markdown."
    user = f"""{company_ctx}

ZENDUIT CONTEXT:
{product_context}

Generate a comprehensive Executive Briefing as HTML (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <table>, <tr>, <td>, <th> — no markdown).

Sections:
1. <h2>Company Overview</h2> — background, fleet scale, key pain points
2. <h2>Competitive Landscape</h2> — current vendors, gaps, Zenduit's angle
3. <h2>Market Opportunity</h2> — fleet trends 2026, ROI Zenduit can deliver
4. <h2>Key Talking Points</h2> — 5 numbered, actionable openers
5. <h2>Handling Objections</h2> — HTML table: Objection | Zenduit Response (4+ rows)
6. <h2>Recommended Next Steps</h2> — 3 concrete follow-up actions

Be hyper-specific. Use actual Zenduit product details and ROI figures."""

    llm = ChatGoogleGenerativeAI(model=GENERATION_MODEL, temperature=0.4, streaming=True)
    chunks: list[str] = []
    async for chunk in llm.astream(
        [SystemMessage(content=system), HumanMessage(content=user)], config=config
    ):
        text = _text(chunk.content)
        if text:
            chunks.append(text)
            await adispatch_custom_event(
                "briefing_chunk", {"chunk": text}, config=config
            )
    return "".join(chunks)


async def _generate_objections(
    intel: dict, company_ctx: str, config: RunnableConfig
) -> str:
    system = "You are a Zenduit sales expert. Return only an HTML table, no other text or markdown."
    user = f"""Generate a Zenduit objection handling HTML table for {intel.get("companyName", "this company")}.
Context: {intel.get("summary", "Enterprise fleet operator")}
Pain points: {", ".join(_clean_arr(intel.get("painPoints")))}

Include: current vendor objection, budget/cost, driver camera resistance, installation disruption, plus 2 company-specific ones.
ROI data: 12% idle reduction, 18% insurance savings, 8% fuel savings.

Format: <table><thead><tr><th>Common Objection</th><th>Zenduit Strategic Response</th></tr></thead><tbody>...</tbody></table>
Return only the HTML table."""

    llm = ChatGoogleGenerativeAI(model=GENERATION_MODEL, temperature=0.3)
    resp = await llm.ainvoke(
        [SystemMessage(content=system), HumanMessage(content=user)], config=config
    )
    return _text(resp.content)


async def _generate_sequence(
    intel: dict, company_ctx: str, linkedin_intel: dict, config: RunnableConfig
) -> list:
    contact_name = linkedin_intel.get("contactName") or ""
    contact_title = linkedin_intel.get("contactTitle") or ""
    hooks = linkedin_intel.get("personalizationHooks") or []
    posts = linkedin_intel.get("recentPosts") or []
    contact_line = f"Target contact: {contact_name} ({contact_title})" if contact_name else ""
    hooks_line = f"Personalization hooks: {' | '.join(hooks[:3])}" if hooks else ""
    post_line = f"Recent post topic: {posts[0].get('topic') or posts[0].get('text','')[:80]}" if posts else ""

    system = "You are a Zenduit outbound sales specialist. Return only valid JSON array, no markdown or explanation."
    user = f"""Generate a 14-day outbound sequence for {intel.get("companyName", "this company")}.

{company_ctx}
{contact_line}
{hooks_line}
{post_line}

Return JSON array only (no markdown fences):
[{{ "day": number, "channel": "LinkedIn"|"Email"|"Call"|"Message", "subject": string|null, "instruction": string }}]

Touchpoints: Day 1 (LinkedIn), Day 3 (Email), Day 5 (LinkedIn), Day 7 (Email), Day 10 (Call), Day 14 (Email with offer).
{f"LinkedIn steps MUST name {contact_name} and reference one of their personalization hooks." if contact_name else ""}
Every instruction must reference this company's specific pain points and recent events."""

    llm = ChatGoogleGenerativeAI(model=GENERATION_MODEL, temperature=0.3)
    resp = await llm.ainvoke(
        [SystemMessage(content=system), HumanMessage(content=user)], config=config
    )
    raw = _text(resp.content)
    try:
        match = re.search(r"\[[\s\S]*\]", raw)
        if match:
            return json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        pass
    co = intel.get("companyName", "this company")
    pain = intel.get("topPainPoint", "fleet efficiency")
    return [
        {"day": 1, "channel": "LinkedIn", "subject": None, "instruction": f"Connect with {co} decision-maker."},
        {"day": 3, "channel": "Email", "subject": "Fleet efficiency for " + co, "instruction": f"Value-led email on {pain}."},
        {"day": 7, "channel": "Call", "subject": None, "instruction": "Follow-up call offering a custom fleet audit."},
        {"day": 14, "channel": "Email", "subject": "ROI calculator for " + co, "instruction": "Final email with ROI calculator and case study."},
    ]


async def _generate_scripts(
    intel: dict, company_ctx: str, product_context: str, linkedin_intel: dict, config: RunnableConfig
) -> list:
    co = intel.get("companyName", "this company")
    competitor = (_clean_arr(intel.get("competitors")) or ["your current vendor"])[0]
    contact_name = linkedin_intel.get("contactName") or ""
    contact_title = linkedin_intel.get("contactTitle") or ""
    contact_tenure = linkedin_intel.get("contactTenure") or ""
    hooks = linkedin_intel.get("personalizationHooks") or []
    posts = linkedin_intel.get("recentPosts") or []
    person_signals = linkedin_intel.get("personSignals") or []
    linkedin_contact_block = ""
    if contact_name:
        linkedin_contact_block = f"""
LINKEDIN CONTACT (your primary target):
Name: {contact_name}
Title: {contact_title}
Tenure: {contact_tenure}
Personalization hooks: {chr(10).join(f"- {h}" for h in hooks[:4]) if hooks else "none"}
Recent posts: {chr(10).join(f"- {p.get('topic') or p.get('text','')[:100]}" for p in posts[:3]) if posts else "none"}
Person signals: {" | ".join(person_signals[:3]) if person_signals else "none"}
"""

    system = "You are a world-class B2B outbound sales copywriter specialising in fleet telematics. Return only valid JSON array — no markdown, no explanation."
    user = f"""Generate 5 outreach scripts for {co}.

PROSPECT INTELLIGENCE:
{company_ctx}
{linkedin_contact_block}
ZENDUIT PRODUCT KNOWLEDGE:
{product_context}

RULES — every script MUST:
- NEVER open with "I'd love to connect", "I hope this finds you well", or generic openers
- ALWAYS open with a specific signal from the research: a LinkedIn post topic, recent news, hiring signal, or expansion event
- Reference a named Zenduit product/feature tied directly to their top pain point
- Include at least one ROI data point (12% idle reduction, 18% insurance savings, or 8% fuel savings)
- The ask must be low-friction (15 min call, quick question, not "schedule a demo")
{f"- LinkedIn scripts MUST be addressed to {contact_name} and reference one of their personalization hooks or recent post topics above" if contact_name else ""}

Return this exact JSON array (5 items, no markdown fences):
[
  {{
    "type": "LinkedIn Connection",
    "subject": null,
    "body": "Max 300 chars. Pattern Interrupt framework. Lead with one specific insight about their recent activity or a fleet challenge they publicly face. No pitch. No ask. Just a relevant observation.",
    "framework": "Pattern Interrupt",
    "tip": "Personalisation tip: what the sender should verify or add before hitting send",
    "openingSignal": "1 sentence describing the SPECIFIC real-world signal used to open this script"
  }},
  {{
    "type": "LinkedIn Follow-up",
    "subject": null,
    "body": "Sent 1-2 days after connection accepted. Under 200 words. Reference something specific. One sentence bridge to Zenduit. Soft CTA: Would it be worth a quick 15-min chat?",
    "framework": "Trigger + Value",
    "tip": "Personalisation tip",
    "openingSignal": "The specific profile detail or post that was referenced"
  }},
  {{
    "type": "Cold Email #1",
    "subject": "Curiosity hook subject line tied to their recent event or news",
    "body": "AIDA framework. Attention: open with their specific news/LinkedIn signal (1-2 sentences proving you researched them). Interest: frame their top pain point as a cost or risk. Desire: name Zenduit product/feature + ROI stat + similar company win. Action: 15 min ask. Use \\n for paragraph breaks.",
    "framework": "AIDA",
    "tip": "Personalisation tip",
    "openingSignal": "The specific news/event/signal that opens the email"
  }},
  {{
    "type": "Cold Email #2",
    "subject": "Re: [mirror the Cold Email #1 subject]",
    "body": "Re-engage follow-up, new angle. Under 150 words. New hook — different pain point, industry trend, or brief case study. Slightly more direct CTA. Use \\n for paragraph breaks.",
    "framework": "New Angle",
    "tip": "Personalisation tip",
    "openingSignal": "The new angle or industry trend used to re-open the conversation"
  }},
  {{
    "type": "Cold Call Script",
    "subject": null,
    "body": "Full branching cold call script:\\n\\nPERMISSION OPENER: [ask if they have 30 seconds, reference a specific trigger]\\n\\nTRIGGER HOOK: [mention the specific news/LinkedIn signal/hiring]\\n\\nPAIN QUESTION: [open-ended question about their top pain point]\\n\\nVALUE BRIDGE: [name the Zenduit product + one ROI stat]\\n\\nSOCIAL PROOF: [brief mention of similar company or fleet type]\\n\\nASK: [low-friction next step]\\n\\nOBJECTION 1 — If they say We already have {competitor}:\\n[pivot: acknowledge, find the gap, re-engage]\\n\\nOBJECTION 2 — If they say Not the right time:\\n[pivot: plant a seed, get a timing commitment]",
    "framework": "Permission Opener",
    "tip": "Personalisation tip",
    "openingSignal": "The specific trigger referenced in the permission opener"
  }}
]"""

    llm = ChatGoogleGenerativeAI(model=GENERATION_MODEL, temperature=0.4)
    resp = await llm.ainvoke(
        [SystemMessage(content=system), HumanMessage(content=user)], config=config
    )
    raw = _text(resp.content)
    try:
        match = re.search(r"\[[\s\S]*\]", raw)
        if match:
            return json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        pass
    return []


async def _generate_variants(
    intel: dict, company_ctx: str, linkedin_intel: dict, config: RunnableConfig
) -> list:
    """Three A/B/C first-touch openers — the testable lever, like the SDR's
    3-opener rotation. Each varies the subject + opening hook over the same core
    value pitch, so outcomes logged per-variant compare like-for-like."""
    co = intel.get("companyName", "this company")
    contact_name = linkedin_intel.get("contactName") or ""
    hooks = linkedin_intel.get("personalizationHooks") or []
    hooks_line = f"Personalization hooks: {' | '.join(hooks[:3])}" if hooks else ""

    system = "You are a B2B fleet-telematics outbound copywriter. Return only a valid JSON array — no markdown, no explanation."
    user = f"""Generate 3 first-touch cold-email opener VARIANTS for {co}, to A/B test.

{company_ctx}
{f"Target contact: {contact_name}" if contact_name else ""}
{hooks_line}

Each variant must:
- Open with a DIFFERENT angle/hook (e.g. A = a specific recent signal/news, B = a pain-point/cost framing, C = a peer/social-proof framing)
- Have a distinct subject line tied to its angle
- Be a complete short opener (subject + 2-4 sentence body) ending in a low-friction ask (15-min chat)
- Reference at least one Zenduit ROI stat (12% idle reduction, 18% insurance savings, or 8% fuel savings)
- NEVER use "I hope this finds you well" or "I'd love to connect"

Return this exact JSON array (3 items, no markdown fences):
[
  {{ "variant": "A", "angle": "short label for the angle", "subject": "...", "body": "... use \\n for paragraph breaks" }},
  {{ "variant": "B", "angle": "...", "subject": "...", "body": "..." }},
  {{ "variant": "C", "angle": "...", "subject": "...", "body": "..." }}
]"""

    llm = ChatGoogleGenerativeAI(model=GENERATION_MODEL, temperature=0.6)
    resp = await llm.ainvoke(
        [SystemMessage(content=system), HumanMessage(content=user)], config=config
    )
    raw = _text(resp.content)
    try:
        match = re.search(r"\[[\s\S]*\]", raw)
        if match:
            variants = json.loads(match.group())
            # normalise variant labels to A/B/C in order
            for i, v in enumerate(variants[:3]):
                v["variant"] = chr(ord("A") + i)
            return variants[:3]
    except (json.JSONDecodeError, AttributeError):
        pass
    return []


def _compress_linkedin_intel(li: dict) -> str:
    if not li:
        return ""
    parts = []
    if li.get("contactName"):
        parts.append(f"Contact: {li['contactName']} ({li.get('contactTitle', '')})")
    if li.get("contactTenure"):
        parts.append(f"Tenure: {li['contactTenure']}")
    hooks = li.get("personalizationHooks") or []
    posts = li.get("recentPosts") or []
    if hooks:
        parts.append("Hooks: " + " | ".join(hooks[:3]))
    if posts:
        summaries = [p.get("topic") or p.get("text", "")[:80] for p in posts[:2] if p]
        if summaries:
            parts.append("Recent: " + " | ".join(summaries))
    signals = li.get("linkedinSignals") or []
    if signals:
        parts.append("Signals: " + " | ".join(signals[:3]))
    return "\n".join(parts)


# ── Node ─────────────────────────────────────────────────────────────────────

async def strategy_node(state: IntelState, config: RunnableConfig) -> dict:
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "Strategy Generation", "status": "start"},
        config=config,
    )

    intel = dict(state.get("website_intel") or {})
    linkedin_intel = state.get("linkedin_intel") or {}
    product_context = state.get("product_context") or ""
    company_name = state.get("company_name") or ""
    # Ensure company name is never blank in any downstream prompt
    if not intel.get("companyName") and company_name:
        intel["companyName"] = company_name
    log.info("strategy_node intel: companyName=%s, keys=%s", intel.get("companyName"), list(intel.keys()))
    company_ctx = _build_company_context(
        intel,
        linkedin_intel=linkedin_intel,
        company_name_fallback=company_name,
    )
    log.info(
        "strategy_node linkedin_intel: contact=%s hooks=%d posts=%d signals=%d",
        linkedin_intel.get("contactName", "none"),
        len(linkedin_intel.get("personalizationHooks") or []),
        len(linkedin_intel.get("recentPosts") or []),
        len(linkedin_intel.get("linkedinSignals") or []),
    )

    # Surface the exact data feeding report generation — the briefing, objections,
    # sequence and scripts are all built from this company context + product context.
    await adispatch_custom_event(
        "generation_input",
        {
            "companyContext": company_ctx,
            "intelFields": [k for k, v in intel.items() if v not in (None, "", [], {})],
            "productContextChars": len(product_context),
            "linkedinContact": linkedin_intel.get("contactName") or "",
            "linkedinHooks": len(linkedin_intel.get("personalizationHooks") or []),
        },
        config=config,
    )

    # 1. Briefing (streaming)
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "Executive Briefing", "status": "generating"},
        config=config,
    )
    briefing = await _generate_briefing(company_ctx, product_context, config)

    # 2. Objections
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "Objection Handling", "status": "generating"},
        config=config,
    )
    objections = await _generate_objections(intel, company_ctx, config)

    # 3. Sequence
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "14-Day Sequence", "status": "generating"},
        config=config,
    )
    sequence = await _generate_sequence(intel, company_ctx, linkedin_intel, config)

    # 4. Scripts
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "Outreach Scripts", "status": "generating"},
        config=config,
    )
    scripts = await _generate_scripts(intel, company_ctx, product_context, linkedin_intel, config)

    # 5. A/B opener variants
    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "A/B Opener Variants", "status": "generating"},
        config=config,
    )
    variants = await _generate_variants(intel, company_ctx, linkedin_intel, config)

    await adispatch_custom_event(
        "phase",
        {"phase": 4, "label": "Strategy Generation", "status": "complete"},
        config=config,
    )

    return {
        "briefing": briefing,
        "objections": objections,
        "sequence": sequence,
        "scripts": scripts,
        "variants": variants,
        "errors": [],
    }
