import logging
from app.graph import build_graph

log = logging.getLogger(__name__)

_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_pipeline(
    company_name: str = "",
    website_url: str = "",
    linkedin_url: str = "",
    seed_intel: dict = None,
) -> dict:
    state = {
        "company_name": company_name,
        "website_url": website_url or "",
        "linkedin_url": linkedin_url or "",
        "seed_intel": seed_intel,
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
    try:
        final = await _get_graph().ainvoke(state)
    except Exception as e:
        log.error("Headless pipeline failed: %s", e)
        final = state

    intel = final.get("website_intel") or {}
    li = final.get("linkedin_intel") or {}
    return {
        "intel": intel,
        "linkedinIntel": li,
        "linkedInContactUrl": li.get("contactLinkedIn") or linkedin_url or "",
        "briefing": final.get("briefing") or "",
        "objections": final.get("objections") or "",
        "sequence": final.get("sequence") or [],
        "scripts": final.get("scripts") or [],
        "variants": final.get("variants") or [],
        "companyName": intel.get("companyName") or company_name or "",
        "websiteUrl": website_url,
    }
