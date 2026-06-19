"""
LinkedIn MCP HTTP client.
Calls stickerdaniel/linkedin-mcp-server via FastMCP streamable-http transport.

Server response format: {"url": "...", "sections": {"section_name": "raw text"}, "references": {...}}
The Gemini agent in linkedin_node.py receives and parses this raw text.
"""
import json
import logging
import os
import re
from typing import Optional

log = logging.getLogger(__name__)


def _get_url() -> Optional[str]:
    url = os.getenv("LINKEDIN_MCP_URL", "").rstrip("/")
    return f"{url}/mcp" if url else None


def _get_headers() -> dict:
    return {"Content-Type": "application/json"}


def _extract_username(profile_url: str) -> str:
    """Extract LinkedIn username from a profile URL or return as-is if already a username."""
    url = profile_url.strip().rstrip("/")
    if "/in/" in url:
        return url.split("/in/")[-1].split("/")[0].split("?")[0]
    return url


def _slugify_company(name: str) -> str:
    """Best-guess LinkedIn company slug from a display name."""
    if "/company/" in name:
        return name.rstrip("/").split("/company/")[-1].split("/")[0].split("?")[0]
    return re.sub(r"\s+", "-", name.lower().strip())


def _sections_text(data: dict) -> str:
    """Concatenate all section values from a server response into one text block."""
    sections = data.get("sections", {}) if isinstance(data, dict) else {}
    return "\n\n".join(str(v) for v in sections.values() if v)


async def call_linkedin_tool(tool_name: str, arguments: dict) -> str:
    """Call a tool on the LinkedIn MCP server. Returns text content or raises."""
    url = _get_url()
    if not url:
        raise ValueError("LINKEDIN_MCP_URL is not configured")

    from mcp.client.streamable_http import streamablehttp_client
    from mcp import ClientSession

    async with streamablehttp_client(url, headers=_get_headers()) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            texts = [c.text for c in result.content if hasattr(c, "text") and c.text]
            return "\n".join(texts) if texts else ""


async def search_linkedin_people(query: str, company: str = "") -> list:
    """Search LinkedIn for people. Returns list with raw text for the AI agent to parse."""
    keywords = f"{query} {company}".strip() if company else query
    try:
        raw = await call_linkedin_tool("search_people", {"keywords": keywords})
        data = json.loads(raw)
        text = _sections_text(data)
        return [{"text": text, "url": data.get("url", "")}] if text else []
    except Exception as exc:
        log.debug("search_linkedin_people skipped: %s", exc)
        return []


async def get_linkedin_profile(profile_url: str) -> dict:
    """Get profile details. Returns sections dict with raw text for the AI to parse."""
    username = _extract_username(profile_url)
    try:
        raw = await call_linkedin_tool("get_person_profile", {
            "linkedin_username": username,
            "sections": "experience,education,contact_info",
        })
        data = json.loads(raw)
        if isinstance(data, dict):
            return data.get("sections") or data
        return {}
    except json.JSONDecodeError:
        return {"raw": raw}
    except Exception as exc:
        log.debug("get_linkedin_profile skipped: %s", exc)
        return {}


async def get_linkedin_posts(profile_url: str, limit: int = 5) -> list:
    """Get recent posts for a profile. Returns list with raw posts text."""
    username = _extract_username(profile_url)
    try:
        raw = await call_linkedin_tool("get_person_profile", {
            "linkedin_username": username,
            "sections": "posts",
        })
        data = json.loads(raw)
        if isinstance(data, dict):
            sections = data.get("sections", {})
            posts_text = sections.get("posts", "")
            if posts_text:
                return [{"text": posts_text}]
        return []
    except Exception as exc:
        log.debug("get_linkedin_posts skipped: %s", exc)
        return []


async def search_linkedin_company(name: str) -> dict:
    """Look up a company. Returns sections dict with raw text for the AI to parse."""
    slug = _slugify_company(name)
    try:
        raw = await call_linkedin_tool("get_company_profile", {
            "company_name": slug,
            "sections": "posts",
        })
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("sections"):
            return data.get("sections")
    except Exception:
        pass

    try:
        raw = await call_linkedin_tool("search_companies", {"keywords": name})
        data = json.loads(raw)
        if isinstance(data, dict):
            return data.get("sections") or data
        return {}
    except Exception as exc:
        log.debug("search_linkedin_company skipped: %s", exc)
        return {}


async def send_linkedin_message(profile_url: str, message: str) -> dict:
    """Send a LinkedIn message. Raises on failure (unlike read-only calls)."""
    if not profile_url:
        raise ValueError("profile_url is required to send a LinkedIn message")
    username = _extract_username(profile_url)
    raw = await call_linkedin_tool("send_message", {
        "linkedin_username": username,
        "message": message,
        "confirm_send": True,
    })
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return {"success": True, "raw": raw}
