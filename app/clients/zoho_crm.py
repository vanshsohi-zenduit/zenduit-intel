import json
import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from app.credentials import get_config

log = logging.getLogger(__name__)


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    return str(content)


async def extract_lead_fields_ai(payload: dict) -> dict:
    llm = ChatGoogleGenerativeAI(
        model=get_config("GEMINI_RESEARCH_MODEL", "gemini-2.0-flash"),
        google_api_key=get_config("GOOGLE_API_KEY"),
    )
    prompt = f"""You are a data extraction assistant.
Extract lead information from this Zoho CRM webhook payload.
Field names may be camelCase, snake_case, Title Case, PascalCase, or any variation.
Look carefully at every key-value pair.

Payload:
{json.dumps(payload, indent=2)[:6000]}

Return ONLY valid JSON with no markdown fences or explanation:
{{
  "companyName": "company/account/organization name",
  "websiteUrl": "website URL if present, else empty string",
  "contactName": "primary contact full name",
  "contactTitle": "contact job title",
  "contactEmail": "contact email address",
  "contactPhone": "contact phone number",
  "hq": "City, State, Country if city-level data available — else empty string. NEVER just a country or region.",
  "industry": "industry/vertical",
  "fleetSize": "number of vehicles/assets if available",
  "ownerName": "assigned sales rep full name",
  "ownerEmail": "assigned sales rep email address if present",
  "leadId": "Zoho CRM record ID (id field)"
}}"""
    try:
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        text = _content_text(resp.content).strip()
        if text.startswith("```"):
            text = text.split("```")[-2] if "```" in text else text
            text = text.lstrip("json").strip()
        return json.loads(text)
    except Exception as e:
        log.warning("Zoho AI field extraction failed: %s", e)
        return {}
