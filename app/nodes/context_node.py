"""
Phase 1 — Agentic Product Intelligence.

A Gemini agent decides which Brain MCP tools to call to build rich prospect context:
  1. find_similar_customers — matches the prospect to existing CRM accounts
  2. get_customer_profile — drills into a matched account's signals and history
  3. search_customer_meetings — scoped to a matched account to surface success stories
  4. find_customers_with_signal — finds accounts with matching pain-point tags globally
  5. search_product_knowledge — fetches features, battlecards, objection scripts

similar_accounts is captured Python-side (not LLM-re-serialized) for safety.
product_context is the LLM's synthesized prose, prepended with ZENDUIT_CONTEXT.
Falls back to hardcoded ZENDUIT_CONTEXT if Brain MCP is unavailable.
"""
import json
import logging
import os
from typing import List, Optional

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from app.state import IntelState
from app.clients.brain_mcp import (
    find_similar_accounts_by_description,
    find_similar_accounts_by_id,
    get_account_summary,
    get_account_facts,
    get_account_context_graph,
    list_account_meetings,
    get_meeting_transcript,
    search_meeting_chunks,
    find_accounts_by_tag,
    query_tag_trends,
    search_people,
    get_person_meetings,
    search_product_docs as _search_product_docs,
)

log = logging.getLogger(__name__)

CONTEXT_MODEL = os.getenv(
    "GEMINI_CONTEXT_MODEL",
    os.getenv("GEMINI_RESEARCH_MODEL", "gemini-3.5-flash"),
)
MAX_ROUNDS = 6

ZENDUIT_CONTEXT = """
Zenduit (zenduit.com) is a fleet management and telematics platform serving mid-to-large enterprise fleets.

Core products:
- ZenduONE: Unified fleet intelligence platform — GPS tracking, driver behavior, maintenance, compliance.
- ZenduCAM: AI-powered in-cab video safety — event-triggered recording, live streaming, driver coaching.
- ZenduFuel: Fuel monitoring and theft detection with real-time alerts.
- ZenduMaintenance: Predictive maintenance scheduling based on engine data.
- ZenduIQ: Analytics and reporting dashboard.
- ZenduCONNECT: Integration hub connecting fleet systems.

Key value pillars:
1. DOT Safety & Compliance — ELD/HOS compliance, DVIR, violation alerts.
2. Operational Efficiency — Idle reduction (avg 12%), route optimization, utilization reporting.
3. Driver Coaching — Real-time alerts, scorecards, insurance savings (avg 18%).
4. Data Centralization — Single pane of glass for hybrid/mixed fleets.

Target personas: VP of Operations, Fleet Manager, Director of Safety & Compliance, CFO.
Target industries: Trucking/LTL, Construction, Oil & Gas, Public Works, Distribution/Logistics.
""".strip()


async def context_node(state: IntelState, config: RunnableConfig) -> dict:
    await adispatch_custom_event(
        "phase",
        {"phase": 3, "label": "Product Intelligence", "status": "start"},
        config=config,
    )

    product_context = ZENDUIT_CONTEXT
    similar_accounts: list = []  # populated Python-side when find_similar_customers fires

    if not os.getenv("BRAIN_MCP_URL"):
        await adispatch_custom_event(
            "phase",
            {"phase": 3, "label": "Product Intelligence", "status": "skip"},
            config=config,
        )
        return {"product_context": product_context, "similar_accounts": similar_accounts, "errors": []}

    # ── Tool definitions ──────────────────────────────────────────────────────
    # Defined inside the node to close over `config` and `similar_accounts`.

    @tool
    async def find_similar_customers(description: str, industry: str = "") -> str:
        """Find existing Zenduit customers most similar to a prospect. Include industry,
        fleet size, geography, vehicle types, and known operational challenges in description.
        industry should be an exact Zoho CRM value: 'Transportation', 'Construction',
        'Oil & Gas', 'Utilities', 'Government'."""
        nonlocal similar_accounts
        await adispatch_custom_event(
            "tool",
            {"name": "find_similar_customers", "input": {"description": description[:120]}},
            config=config,
        )
        result = await find_similar_accounts_by_description(
            description, industry=industry or None, limit=5
        )
        # Capture Python-side before returning to LLM — prevents LLM from re-serializing
        accounts = result.get("industry_matches", []) + result.get("semantic_matches", [])
        similar_accounts = accounts
        return json.dumps(result)

    @tool
    async def get_customer_profile(zoho_crm_id: str) -> str:
        """Get the full signal profile of a matched Zenduit customer: their top tags,
        recent meeting metadata, and account health. Use the zoho_crm_id returned by
        find_similar_customers to drill into the best-matching account."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_customer_profile", "input": {"id": zoho_crm_id}},
            config=config,
        )
        result = await get_account_summary(zoho_crm_id)
        return json.dumps(result)

    @tool
    async def search_customer_meetings(
        query: str, zoho_crm_id: str = "", tag_filter: Optional[List[str]] = None
    ) -> str:
        """Semantic search across Zenduit customer meeting transcripts for success stories,
        ROI evidence, testimonials, and competitive wins. Pass zoho_crm_id (from
        find_similar_customers) to scope results to one account's meetings.
        tag_filter slugs: customer_testimonial, case_study_candidate, expansion_signal,
        competitive_intel, feature_request."""
        await adispatch_custom_event(
            "tool",
            {
                "name": "search_customer_meetings",
                "input": {
                    "query": query[:120],
                    "account": zoho_crm_id or "global",
                },
            },
            config=config,
        )
        result = await search_meeting_chunks(
            query,
            zoho_crm_id=zoho_crm_id or None,
            tag_filter=tag_filter,
            limit=8,
        )
        return json.dumps(result)

    @tool
    async def find_customers_with_signal(tag_slugs: List[str]) -> str:
        """Find Zenduit customers whose meetings have specific signal tags — useful for
        surfacing accounts with matching pain points to use as social proof.
        tag_slugs options: churn_signal, expansion_signal, feature_request,
        competitive_intel, case_study_candidate, customer_testimonial, product_gap,
        risk_signal, pricing_concern."""
        await adispatch_custom_event(
            "tool",
            {"name": "find_customers_with_signal", "input": {"tags": tag_slugs}},
            config=config,
        )
        result = await find_accounts_by_tag(tag_slugs, limit=10)
        return json.dumps(result)

    @tool
    async def search_product_knowledge(
        query: str,
        product_family: str = "",
        knowledge_type: str = "",
        competitor: str = "",
    ) -> str:
        """Search the Zenduit product knowledge base for features, competitive battlecards,
        objection-handling scripts, ICP profiles, and value propositions.
        knowledge_type: Feature_Spec | Competitor_Comparison | Objection_Handling |
                        ICP_and_Personas | Value_Prop_and_Stories
        product_family: ZenCAM | ZenduONE | ZenTRACK | ZenBEACON | ZenduWORK |
                        ZenBus | ZenduELD | ZenScore
        competitor: Samsara | Motive | Lytx | Surfsight | Onfleet"""
        await adispatch_custom_event(
            "tool",
            {"name": "search_product_docs", "input": {"query": query[:120]}},
            config=config,
        )
        result = await _search_product_docs(
            query,
            product_family=product_family or None,
            knowledge_type=knowledge_type or None,
            competitor=competitor or None,
        )
        return result or "No matching product knowledge found."

    @tool
    async def get_account_statistics(zoho_crm_id: str) -> str:
        """Get aggregate facts about an account: total meeting count, date range,
        top tags by weight, and meeting type distribution. Useful for quickly gauging
        the depth of a customer relationship before drilling in."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_account_facts", "input": {"id": zoho_crm_id}},
            config=config,
        )
        result = await get_account_facts(zoho_crm_id)
        return json.dumps(result)

    @tool
    async def list_meetings_for_account(
        zoho_crm_id: str = "",
        meeting_type: str = "",
        limit: int = 10,
    ) -> str:
        """List meetings for a specific account or globally. Returns meeting metadata
        (id, type, date, duration, tags) — use meeting_id with get_full_transcript to
        read a specific meeting's content.
        meeting_type: sales_demo | sales_discovery | account_review | onboarding |
                      qbr | partner_sync | training | other"""
        await adispatch_custom_event(
            "tool",
            {"name": "list_account_meetings", "input": {"account": zoho_crm_id or "global"}},
            config=config,
        )
        result = await list_account_meetings(
            zoho_crm_id=zoho_crm_id or None,
            meeting_type=meeting_type or None,
            limit=limit,
        )
        return json.dumps(result)

    @tool
    async def get_full_transcript(meeting_id: str) -> str:
        """Retrieve the full transcript of a specific meeting. Call list_meetings_for_account
        first to get the meeting_id. Use to read exact quotes, ROI numbers, or objections
        raised in a real customer call."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_meeting_transcript", "input": {"meeting_id": meeting_id}},
            config=config,
        )
        result = await get_meeting_transcript(meeting_id)
        return result or "Transcript not available."

    @tool
    async def get_tag_trends(tag_slug: str = "", top_n: int = 10) -> str:
        """Aggregate signal tag trends across all customer meetings — shows which pain
        points appear most often and across how many accounts. Leave tag_slug empty for
        a full cross-account summary. Useful for understanding the most common customer
        pain points to frame social proof.
        tag_slug options: product_gap | churn_signal | competitive_intel |
                          expansion_signal | customer_testimonial | feature_request |
                          risk_signal | case_study_candidate"""
        await adispatch_custom_event(
            "tool",
            {"name": "query_tag_trends", "input": {"tag": tag_slug or "all"}},
            config=config,
        )
        result = await query_tag_trends(tag_slug=tag_slug or None, top_n=top_n)
        return json.dumps(result)

    @tool
    async def find_people(query: str) -> str:
        """Search for people (employees or external contacts) by name or email.
        Returns org affiliation, internal/external status, and meeting count.
        Useful for finding contacts at matched customer accounts."""
        await adispatch_custom_event(
            "tool",
            {"name": "search_people", "input": {"query": query[:80]}},
            config=config,
        )
        result = await search_people(query, limit=20)
        return json.dumps(result)

    @tool
    async def get_contact_meeting_history(person_query: str) -> str:
        """Get all meetings a specific person (name or email) has participated in.
        Use to understand a contact's relationship depth with Zenduit or to map
        who attended key meetings at a customer account."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_person_meetings", "input": {"query": person_query[:80]}},
            config=config,
        )
        result = await get_person_meetings(person_query, limit=20)
        return json.dumps(result)

    @tool
    async def find_accounts_similar_to(zoho_crm_id: str) -> str:
        """Find other Zenduit customer accounts with a similar signal profile to a given
        account, using shared tag weight overlap. Use after get_customer_profile to
        expand the social proof pool beyond the initial description match."""
        await adispatch_custom_event(
            "tool",
            {"name": "find_similar_accounts", "input": {"id": zoho_crm_id}},
            config=config,
        )
        result = await find_similar_accounts_by_id(zoho_crm_id, top_n=5)
        return json.dumps(result)

    @tool
    async def get_account_relationship_graph(zoho_crm_id: str) -> str:
        """Fetch the full context graph for an account: org → meetings → persons + tags.
        Returns the richest possible view of a customer relationship in one call.
        Use when you need a complete picture of who attended what and which signals emerged."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_account_context_graph", "input": {"id": zoho_crm_id}},
            config=config,
        )
        result = await get_account_context_graph(zoho_crm_id)
        return json.dumps(result)

    tools = [
        find_similar_customers,
        get_customer_profile,
        get_account_statistics,
        get_account_relationship_graph,
        list_meetings_for_account,
        get_full_transcript,
        search_customer_meetings,
        find_customers_with_signal,
        find_accounts_similar_to,
        get_tag_trends,
        find_people,
        get_contact_meeting_history,
        search_product_knowledge,
    ]
    tool_map = {t.name: t for t in tools}
    llm = ChatGoogleGenerativeAI(model=CONTEXT_MODEL, temperature=0.1).bind_tools(tools)

    company = state.get("company_name", "the prospect")
    website = state.get("website_url", "")
    linkedin = state.get("linkedin_url", "")
    website_intel = state.get("website_intel") or {}
    linkedin_intel = state.get("linkedin_intel") or {}

    system_prompt = """You are a Zenduit sales intelligence agent. Your job is to gather internal \
context before an outbound call so the salesperson has the best possible preparation.

You have access to the full Zenduit Brain MCP — use whichever tools make sense for this prospect:

**Prospect matching:**
- find_similar_customers — match prospect to existing CRM accounts by description
- find_accounts_similar_to — expand matches using a known account's tag fingerprint
- find_customers_with_signal — find accounts with specific pain-point signal tags

**Account deep-dives:**
- get_customer_profile — signal tags, meetings, and health for a specific account
- get_account_statistics — aggregate facts (meeting count, tag distribution)
- get_account_relationship_graph — full org → meetings → persons + tags graph

**Meeting intelligence:**
- list_meetings_for_account — browse meeting history (get meeting_id for transcripts)
- get_full_transcript — read an entire meeting transcript for exact quotes and ROI data
- search_customer_meetings — semantic search across transcripts, optionally scoped to an account

**Trend analysis:**
- get_tag_trends — see which pain-point signals are most common across all customers

**Contact intelligence:**
- find_people — search contacts by name or email
- get_contact_meeting_history — meeting history for a specific person

**Product knowledge:**
- search_product_knowledge — features, battlecards, objection scripts, ICP profiles

Recommended flow (adapt as needed):
1. find_similar_customers → get_customer_profile on top matches
2. search_customer_meetings scoped to matched accounts for success stories / ROI quotes
3. search_product_knowledge for relevant features, battlecards, objection scripts

After gathering enough evidence, write a final synthesis — a plain-text passage (no JSON, no \
markdown headers) covering:
- Which Zenduit products are most relevant to this prospect and why
- 2–3 specific customer success examples with named accounts and ROI data where available
- Competitive positioning if a competitor is inferable
- Top objection-handling angles for this prospect's profile

Return only the synthesis prose. Do not include tool call syntax or JSON in your final response."""

    pain_pts = ", ".join((website_intel.get("painPoints") or [])[:3]) or "unknown"
    contact_line = (
        f"{linkedin_intel.get('contactName', '')} ({linkedin_intel.get('contactTitle', '')})"
        if linkedin_intel.get("contactName")
        else "unknown"
    )
    user_prompt = f"""Prospect: {company}
Website: {website or "unknown"}
LinkedIn: {linkedin or "unknown"}

CONFIRMED RESEARCH FINDINGS — use these for precise Brain MCP queries:
- Industry: {website_intel.get("industry", "unknown")}
- Fleet Size: {website_intel.get("fleetSize", "unknown")}
- Pain Points: {pain_pts}
- Current Platform: {website_intel.get("currentFleetPlatform", "unknown")}
- Contact: {contact_line}
- Recent Trigger: {website_intel.get("recentEvent", "") or website_intel.get("fundingOrExpansion", "")}

Use this confirmed research to craft precise Brain MCP queries. \
Prioritise matching their exact industry and fleet profile to existing Zenduit customer wins."""

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]

    try:
        for _ in range(MAX_ROUNDS):
            response = await llm.ainvoke(messages, config=config)
            messages.append(response)

            tool_calls = getattr(response, "tool_calls", []) or []
            if not tool_calls:
                # LLM produced final synthesis — use as enriched product_context
                text = (
                    response.content
                    if isinstance(response.content, str)
                    else ""
                )
                if text.strip():
                    product_context = (
                        f"{ZENDUIT_CONTEXT}\n\n"
                        f"BRAIN INTELLIGENCE (tailored to this prospect):\n{text.strip()}"
                    )
                break

            # Execute each tool call and append ToolMessages
            for tc in tool_calls:
                fn = tool_map.get(tc["name"])
                if fn:
                    try:
                        result = await fn.ainvoke(tc["args"])
                    except Exception as e:
                        result = f"Tool error: {e}"
                        log.warning("Context tool %s failed: %s", tc["name"], e)
                else:
                    result = f"Unknown tool: {tc['name']}"
                messages.append(
                    ToolMessage(content=str(result), tool_call_id=tc["id"])
                )

        # If all MAX_ROUNDS were consumed by tool calls, force one final synthesis pass
        if product_context == ZENDUIT_CONTEXT:
            try:
                forced = await ChatGoogleGenerativeAI(model=CONTEXT_MODEL, temperature=0.1).ainvoke(
                    messages + [HumanMessage(content="Write your final synthesis prose now.")],
                    config=config,
                )
                text = forced.content if isinstance(forced.content, str) else ""
                if text.strip():
                    product_context = (
                        f"{ZENDUIT_CONTEXT}\n\n"
                        f"BRAIN INTELLIGENCE (tailored to this prospect):\n{text.strip()}"
                    )
                    log.info("Forced Brain MCP synthesis: %d chars", len(text))
            except Exception as e:
                log.warning("Forced synthesis failed: %s", e)

        log.info(
            "context_node done: product_context=%d chars, has_brain_intel=%s, similar_accounts=%d",
            len(product_context),
            "BRAIN INTELLIGENCE" in product_context,
            len(similar_accounts),
        )

        await adispatch_custom_event(
            "phase",
            {"phase": 3, "label": "Product Intelligence", "status": "complete"},
            config=config,
        )

    except Exception as exc:
        log.warning("Agentic context gathering failed, using fallback: %s", exc)
        await adispatch_custom_event(
            "phase",
            {"phase": 3, "label": "Product Intelligence", "status": "skip"},
            config=config,
        )

    return {
        "product_context": product_context,
        "similar_accounts": similar_accounts,
        "errors": [],
    }
