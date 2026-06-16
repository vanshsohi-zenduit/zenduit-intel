"""
Phase 2 — LinkedIn Intelligence.

Agentic Gemini loop using LinkedIn MCP tools (up to 5 rounds).
Finds key decision-maker contacts and their recent activity for personalization.
Falls back gracefully if LINKEDIN_MCP_URL is not configured.
"""
import json
import logging
import os
import re

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from app.state import IntelState

log = logging.getLogger(__name__)

LINKEDIN_MODEL = os.getenv(
    "GEMINI_LINKEDIN_MODEL",
    os.getenv("GEMINI_RESEARCH_MODEL", "gemini-3.5-flash"),
)
MAX_ROUNDS = 5


async def linkedin_node(state: IntelState, config: RunnableConfig) -> dict:
    await adispatch_custom_event(
        "phase",
        {"phase": 2, "label": "LinkedIn Intelligence", "status": "start"},
        config=config,
    )

    if not os.getenv("LINKEDIN_MCP_URL"):
        await adispatch_custom_event(
            "phase",
            {"phase": 2, "label": "LinkedIn Intelligence", "status": "skip"},
            config=config,
        )
        return {"linkedin_intel": {}, "errors": []}

    from app.clients.linkedin_mcp import (
        search_linkedin_people,
        get_linkedin_profile,
        get_linkedin_posts,
        search_linkedin_company,
    )

    # ── Tools (defined inside node to close over `config`) ────────────────────

    @tool
    async def find_linkedin_contacts(job_titles: str, company: str) -> str:
        """Search LinkedIn for people at the company matching decision-maker titles.
        Recommended titles: VP Operations, Fleet Manager, Director of Safety,
        Director of Logistics, VP Supply Chain, Head of Transportation, CFO."""
        await adispatch_custom_event(
            "tool",
            {"name": "find_linkedin_contacts", "input": {"titles": job_titles[:80], "company": company}},
            config=config,
        )
        results = await search_linkedin_people(job_titles, company)
        return json.dumps(results[:5])

    @tool
    async def get_contact_profile(profile_url: str) -> str:
        """Get full profile details for a specific LinkedIn contact URL.
        Returns name, title, tenure, about, location, and experience."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_contact_profile", "input": {"url": profile_url}},
            config=config,
        )
        data = await get_linkedin_profile(profile_url)
        return json.dumps(data)

    @tool
    async def get_contact_activity(profile_url: str) -> str:
        """Get recent posts and activity for a LinkedIn contact.
        Use this to find personalization hooks — what topics they care about,
        recent wins, frustrations, or industry commentary."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_contact_activity", "input": {"url": profile_url}},
            config=config,
        )
        posts = await get_linkedin_posts(profile_url, limit=5)
        return json.dumps(posts)

    @tool
    async def get_company_page(company_name: str) -> str:
        """Look up a company's LinkedIn page for follower count, recent posts, and specialties.
        Useful for confirming the company's LinkedIn presence and recent announcements."""
        await adispatch_custom_event(
            "tool",
            {"name": "get_company_page", "input": {"company": company_name}},
            config=config,
        )
        data = await search_linkedin_company(company_name)
        return json.dumps(data)

    tools = [find_linkedin_contacts, get_contact_profile, get_contact_activity, get_company_page]
    tool_map = {t.name: t for t in tools}
    llm = ChatGoogleGenerativeAI(model=LINKEDIN_MODEL, temperature=0.1).bind_tools(tools)

    company_name = state.get("company_name") or "the prospect"
    linkedin_url = state.get("linkedin_url") or ""
    website_intel = state.get("website_intel") or {}

    system_prompt = """You are a LinkedIn intelligence agent for Zenduit B2B outbound sales.
Find the best decision-maker contact at the prospect company and gather personalization hooks.

Priority titles: VP Operations, Fleet Manager, Director of Safety, Director of Logistics,
VP Supply Chain, Head of Transportation, CFO.

After research, return ONLY a valid JSON object — no markdown, no explanation:
{
  "contactName": string,
  "contactTitle": string,
  "contactLinkedIn": string,
  "contactTenure": string,
  "recentPosts": [{"text": string, "date": string, "topic": string}],
  "personalizationHooks": [string],
  "companyLinkedIn": string,
  "linkedinSignals": [string],
  "personSignals": [string]
}"""

    pain_pts = ", ".join((website_intel.get("painPoints") or [])[:3]) or "unknown"
    user_prompt = f"""Company: {company_name}
{f"Known LinkedIn URL: {linkedin_url}" if linkedin_url else ""}
Industry: {website_intel.get("industry", "unknown")}
Fleet Size: {website_intel.get("fleetSize", "unknown")}
Pain Points: {pain_pts}

Recommended sequence:
1. get_company_page("{company_name}") — confirm LinkedIn presence
2. find_linkedin_contacts("VP Operations OR Fleet Manager OR Director of Safety OR Director of Logistics", "{company_name}")
3. get_contact_profile on the top result URL
4. get_contact_activity to extract personalization hooks from recent posts

Return the JSON object described above."""

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    linkedin_intel: dict = {}

    try:
        for _ in range(MAX_ROUNDS):
            response = await llm.ainvoke(messages, config=config)
            messages.append(response)

            tool_calls = getattr(response, "tool_calls", []) or []
            if not tool_calls:
                content = response.content
                raw = (
                    " ".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in content)
                    if isinstance(content, list)
                    else (content or "")
                )
                match = re.search(r"\{[\s\S]*\}", raw)
                if match:
                    try:
                        linkedin_intel = json.loads(match.group())
                    except json.JSONDecodeError:
                        pass
                break

            for tc in tool_calls:
                fn = tool_map.get(tc["name"])
                if fn:
                    try:
                        result = await fn.ainvoke(tc["args"])
                    except Exception as exc:
                        result = f"Tool error: {exc}"
                        log.warning("LinkedIn tool %s failed: %s", tc["name"], exc)
                else:
                    result = f"Unknown tool: {tc['name']}"
                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

        log.info(
            "linkedin_intel: contact=%s title=%s hooks=%d posts=%d signals=%d person_signals=%d",
            linkedin_intel.get("contactName", "none"),
            linkedin_intel.get("contactTitle", "none"),
            len(linkedin_intel.get("personalizationHooks") or []),
            len(linkedin_intel.get("recentPosts") or []),
            len(linkedin_intel.get("linkedinSignals") or []),
            len(linkedin_intel.get("personSignals") or []),
        )
        await adispatch_custom_event(
            "phase",
            {"phase": 2, "label": "LinkedIn Intelligence", "status": "complete"},
            config=config,
        )

    except Exception as exc:
        log.warning("LinkedIn intelligence failed, skipping: %s", exc)
        await adispatch_custom_event(
            "phase",
            {"phase": 2, "label": "LinkedIn Intelligence", "status": "skip"},
            config=config,
        )

    return {"linkedin_intel": linkedin_intel, "errors": []}
