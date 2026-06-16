"""
Brain MCP HTTP client.
Calls the company-brain MCP server (Railway) using the MCP 2025-03-26
streamable HTTP transport. Falls back gracefully if the server is unavailable.
"""
import os
import logging
from typing import Optional

log = logging.getLogger(__name__)


def _get_url() -> Optional[str]:
    url = os.getenv("BRAIN_MCP_URL", "").rstrip("/")
    return f"{url}/mcp" if url else None


def _get_headers() -> dict:
    headers: dict = {"Content-Type": "application/json"}
    key = os.getenv("BRAIN_MCP_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def call_brain_tool(tool_name: str, arguments: dict) -> str:
    """
    Call a tool on the Brain MCP server.
    Returns text content or raises on failure.
    Uses the MCP streamable-HTTP transport (POST /mcp).
    """
    url = _get_url()
    if not url:
        raise ValueError("BRAIN_MCP_URL is not configured")

    try:
        from mcp.client.streamable_http import streamablehttp_client
        from mcp import ClientSession

        async with streamablehttp_client(url, headers=_get_headers()) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)
                texts = [
                    c.text for c in result.content if hasattr(c, "text") and c.text
                ]
                return "\n".join(texts) if texts else ""
    except Exception as exc:
        log.warning("Brain MCP call failed (%s): %s", tool_name, exc)
        raise


async def find_similar_accounts_by_description(
    description: str,
    industry: Optional[str] = None,
    limit: int = 5,
) -> dict:
    """
    Find existing customer accounts most similar to a prospect description.
    Returns {"total": int, "industry_matches": [...], "semantic_matches": [...]}.
    Each account has: account_name, zoho_crm_id, industry, profile, similarity_score.
    """
    try:
        args: dict = {"description": description, "limit": limit}
        if industry:
            args["industry"] = industry
        raw = await call_brain_tool("find_similar_accounts_by_description", args)
        import json
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"total": 0, "industry_matches": [], "semantic_matches": []}
    except Exception as exc:
        log.debug("find_similar_accounts_by_description skipped: %s", exc)
        return {"total": 0, "industry_matches": [], "semantic_matches": []}


async def search_product_docs(
    query: str,
    product_family: Optional[str] = None,
    knowledge_type: Optional[str] = None,
    competitor: Optional[str] = None,
    limit: int = 5,
) -> str:
    """
    Semantic search across the product knowledge base.
    knowledge_type: Feature_Spec | Competitor_Comparison | Objection_Handling |
                    ICP_and_Personas | Value_Prop_and_Stories
    product_family: ZenCAM | ZenduONE | ZenTRACK | ZenBEACON | ZenduWORK |
                    ZenBus | ZenduELD | ZenScore
    competitor: Samsara | Motive | Lytx | Surfsight | Onfleet
    """
    try:
        args: dict = {"query": query, "limit": limit}
        if product_family:
            args["product_family"] = product_family
        if knowledge_type:
            args["knowledge_type"] = knowledge_type
        if competitor:
            args["competitor"] = competitor
        return await call_brain_tool("search_product_docs", args)
    except Exception as exc:
        log.debug("search_product_docs skipped: %s", exc)
        return ""


async def search_meeting_chunks(
    query: str,
    zoho_crm_id: Optional[str] = None,
    tag_filter: Optional[list] = None,
    limit: int = 10,
) -> list:
    """
    Semantic search across meeting transcript chunks.
    Scope to a specific account with zoho_crm_id for targeted success-story retrieval.
    tag_filter slugs: customer_testimonial, case_study_candidate, expansion_signal,
                      competitive_intel, feature_request, churn_signal, etc.
    """
    try:
        args: dict = {"query": query, "limit": limit}
        if zoho_crm_id:
            args["zoho_crm_id"] = zoho_crm_id
        if tag_filter:
            args["tag_filter"] = tag_filter
        import json
        raw = await call_brain_tool("search_meeting_chunks", args)
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "chunks" in data:
                return data["chunks"]
        except json.JSONDecodeError:
            pass
        return [{"text": raw}] if raw else []
    except Exception as exc:
        log.debug("search_meeting_chunks skipped: %s", exc)
        return []


async def find_accounts_by_tag(tag_slugs: list, limit: int = 10) -> list:
    """
    Find accounts where specific signal tags appear.
    Returns accounts ranked by aggregate tag weight.
    """
    try:
        import json
        raw = await call_brain_tool("find_accounts_by_tag", {
            "tag_slugs": tag_slugs,
            "limit": limit,
        })
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "accounts" in data:
                return data["accounts"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("find_accounts_by_tag skipped: %s", exc)
        return []


async def get_account_summary(zoho_crm_id: str, recent_n: int = 5) -> dict:
    """
    Get a summary of a customer account: top signal tags, recent meetings,
    context chunks, and health metadata.
    """
    try:
        import json
        raw = await call_brain_tool("get_account_summary", {
            "zoho_crm_id": zoho_crm_id,
            "recent_n": recent_n,
        })
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"summary": raw}
    except Exception as exc:
        log.debug("get_account_summary skipped: %s", exc)
        return {}


async def get_account_facts(zoho_crm_id: str) -> dict:
    """
    Aggregate facts about an account: total meeting count, date range,
    top tags by weight, and meeting type distribution.
    """
    try:
        import json
        raw = await call_brain_tool("get_account_facts", {"zoho_crm_id": zoho_crm_id})
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"summary": raw}
    except Exception as exc:
        log.debug("get_account_facts skipped: %s", exc)
        return {}


async def list_account_meetings(
    zoho_crm_id: Optional[str] = None,
    order_by: str = "desc",
    limit: int = 10,
    meeting_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list:
    """
    List meetings for an account or globally. Returns meeting metadata including
    type, date, duration, and tag slugs.
    meeting_type: account_review | sales_demo | sales_discovery | onboarding |
                  qbr | partner_sync | training | other
    """
    try:
        import json
        args: dict = {"order_by": order_by, "limit": limit}
        if zoho_crm_id:
            args["zoho_crm_id"] = zoho_crm_id
        if meeting_type:
            args["meeting_type"] = meeting_type
        if date_from:
            args["date_from"] = date_from
        if date_to:
            args["date_to"] = date_to
        raw = await call_brain_tool("list_account_meetings", args)
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "meetings" in data:
                return data["meetings"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("list_account_meetings skipped: %s", exc)
        return []


async def get_meeting_transcript(meeting_id: str) -> str:
    """Retrieve the full transcript of a specific meeting assembled from chunks."""
    try:
        return await call_brain_tool("get_meeting_transcript", {"meeting_id": meeting_id})
    except Exception as exc:
        log.debug("get_meeting_transcript skipped: %s", exc)
        return ""


async def query_tag_trends(
    tag_slug: Optional[str] = None,
    zoho_crm_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    top_n: int = 10,
) -> list:
    """
    Aggregate signal tag trends across meetings. Shows which tags appear most,
    across how many accounts and meetings.
    """
    try:
        import json
        args: dict = {"top_n": top_n}
        if tag_slug:
            args["tag_slug"] = tag_slug
        if zoho_crm_id:
            args["zoho_crm_id"] = zoho_crm_id
        if date_from:
            args["date_from"] = date_from
        if date_to:
            args["date_to"] = date_to
        raw = await call_brain_tool("query_tag_trends", args)
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "trends" in data:
                return data["trends"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("query_tag_trends skipped: %s", exc)
        return []


async def search_people(query: str, limit: int = 20) -> list:
    """
    Search for people (employees or external contacts) by name or email.
    Returns org affiliation, internal/external status, and meeting count.
    """
    try:
        import json
        raw = await call_brain_tool("search_people", {"query": query, "limit": limit})
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "people" in data:
                return data["people"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("search_people skipped: %s", exc)
        return []


async def get_person_meetings(query: str, limit: int = 30) -> list:
    """
    Get all meetings a specific person (by name or email) has participated in,
    newest first. Useful for relationship mapping and contact history.
    """
    try:
        import json
        raw = await call_brain_tool("get_person_meetings", {"query": query, "limit": limit})
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "meetings" in data:
                return data["meetings"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("get_person_meetings skipped: %s", exc)
        return []


async def find_similar_accounts_by_id(zoho_crm_id: str, top_n: int = 10) -> list:
    """
    Find accounts with similar signal profiles to a reference account,
    using shared tag weight overlap. Different from description-based matching —
    this operates on an existing account's tag fingerprint.
    """
    try:
        import json
        raw = await call_brain_tool("find_similar_accounts", {
            "zoho_crm_id": zoho_crm_id,
            "top_n": top_n,
        })
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "accounts" in data:
                return data["accounts"]
        except json.JSONDecodeError:
            pass
        return []
    except Exception as exc:
        log.debug("find_similar_accounts_by_id skipped: %s", exc)
        return []


async def get_account_context_graph(zoho_crm_id: str) -> dict:
    """
    Fetch the full account context graph: Org → Meetings → Persons + Tags.
    Returns a rich JSONB skeleton with all relationships.
    """
    try:
        import json
        raw = await call_brain_tool("get_account_context_graph", {"zoho_crm_id": zoho_crm_id})
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"raw": raw}
    except Exception as exc:
        log.debug("get_account_context_graph skipped: %s", exc)
        return {}
