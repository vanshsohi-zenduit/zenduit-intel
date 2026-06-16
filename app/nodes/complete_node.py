"""Final node — emits the complete SSE event with all pipeline results."""
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.runnables import RunnableConfig

from app.state import IntelState


async def complete_node(state: IntelState, config: RunnableConfig) -> dict:
    intel = state.get("website_intel") or {}
    linkedin_intel = state.get("linkedin_intel") or {}
    await adispatch_custom_event(
        "complete",
        {
            "intel": intel,
            "linkedinIntel": linkedin_intel,
            "linkedInContactUrl": linkedin_intel.get("contactLinkedIn") or state.get("linkedin_url") or "",
            "briefing": state.get("briefing") or "",
            "objections": state.get("objections") or "",
            "sequence": state.get("sequence") or [],
            "scripts": state.get("scripts") or [],
            "variants": state.get("variants") or [],
            "companyName": intel.get("companyName") or state.get("company_name") or "Target Company",
        },
        config=config,
    )
    return {}
