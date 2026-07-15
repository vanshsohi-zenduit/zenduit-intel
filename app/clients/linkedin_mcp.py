"""
LinkedIn MCP HTTP client.
Calls stickerdaniel/linkedin-mcp-server via FastMCP streamable-http transport.

Discovers tools dynamically from the MCP server at runtime via list_tools().
The Gemini agent in linkedin_node.py decides which tools to call — no hardcoded
wrapper functions needed.

Server response format: {"url": "...", "sections": {"section_name": "raw text"}, "references": {...}}
"""
import json
import logging
import os
from typing import Optional

log = logging.getLogger(__name__)


def _get_url() -> Optional[str]:
    url = os.getenv("LINKEDIN_MCP_URL", "").rstrip("/")
    return f"{url}/mcp" if url else None


def _get_headers() -> dict:
    return {"Content-Type": "application/json"}


def _extract_username(profile_url: str) -> str:
    """Extract a LinkedIn username from a profile URL, or return as-is if already a username."""
    url = profile_url.strip().rstrip("/")
    if "/in/" in url:
        return url.split("/in/")[-1].split("/")[0].split("?")[0]
    return url


# Tools that write/mutate on LinkedIn. Skipped when readonly_only is set, even if
# the server omits the destructiveHint annotation (many servers do).
_WRITE_TOOL_HINTS = ("send", "connect", "message", "invite", "post", "comment", "endorse", "follow")


def _json_type_to_python(json_type):
    """Convert a JSON Schema type string (or list) to a Python type."""
    if isinstance(json_type, list):
        json_type = next((t for t in json_type if t != "null"), "string")
    return {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
        "array": list,
        "object": dict,
    }.get(json_type, str)


async def call_linkedin_tool(tool_name: str, arguments: dict) -> str:
    """Call a single tool on the LinkedIn MCP server. Returns raw text content."""
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


async def send_linkedin_message(profile_url: str, message: str) -> dict:
    """Send a LinkedIn message. Raises on failure (unlike read-only calls).

    Routed through call_linkedin_tool so it stays in sync with the server's
    transport even though the research agent no longer wraps write tools.
    """
    if not profile_url:
        raise ValueError("profile_url is required to send a LinkedIn message")
    raw = await call_linkedin_tool("send_message", {
        "linkedin_username": _extract_username(profile_url),
        "message": message,
        "confirm_send": True,
    })
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return {"success": True, "raw": raw}


async def get_linkedin_mcp_tools(config=None, readonly_only: bool = True) -> list:
    """
    Connect to the LinkedIn MCP server, discover all available tools via
    list_tools(), and return them as LangChain StructuredTools.

    The Gemini agent receives these tools via bind_tools() and decides
    which to call — no hardcoded wrapper functions needed.

    readonly_only: skip tools annotated as destructive (send_message,
    connect_with_person). Defaults to True for the research use case.
    """
    url = _get_url()
    if not url:
        return []

    try:
        from mcp.client.streamable_http import streamablehttp_client
        from mcp import ClientSession
        from pydantic import create_model, Field
        from langchain_core.tools import StructuredTool
        from langchain_core.callbacks.manager import adispatch_custom_event

        lc_tools = []

        async with streamablehttp_client(url, headers=_get_headers()) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                mcp_result = await session.list_tools()

                for mcp_tool in mcp_result.tools:
                    tool_name = mcp_tool.name

                    if readonly_only:
                        annotations = getattr(mcp_tool, "annotations", None)
                        is_destructive = bool(annotations) and getattr(annotations, "destructiveHint", False)
                        # Many servers omit annotations, so also match on name — the
                        # research agent must never be handed a write tool.
                        looks_like_write = any(h in tool_name.lower() for h in _WRITE_TOOL_HINTS)
                        if is_destructive or looks_like_write:
                            log.debug("Skipping write/destructive LinkedIn tool: %s", tool_name)
                            continue

                    # Build each tool independently — a single malformed schema must
                    # not abort discovery of every other (working) tool.
                    try:
                        tool_desc = (mcp_tool.description or tool_name).strip()
                        input_schema = getattr(mcp_tool, "inputSchema", None) or {}

                        properties = input_schema.get("properties", {})
                        required_fields = set(input_schema.get("required", []))

                        field_defs: dict = {}
                        for prop_name, prop_schema in properties.items():
                            # Skip properties whose names aren't valid Python identifiers —
                            # create_model can't accept them as keyword field names.
                            if not prop_name.isidentifier():
                                log.debug("Skipping non-identifier field %r on tool %s", prop_name, tool_name)
                                continue
                            py_type = _json_type_to_python(prop_schema.get("type", "string"))
                            desc = prop_schema.get("description", "")
                            if prop_name in required_fields:
                                field_defs[prop_name] = (py_type, Field(..., description=desc))
                            else:
                                field_defs[prop_name] = (Optional[py_type], Field(None, description=desc))

                        ArgsModel = create_model(f"Args_{tool_name}", **field_defs)
                    except Exception as exc:
                        log.warning("Skipping LinkedIn tool %s (schema build failed): %s", tool_name, exc)
                        continue

                    def _make_coroutine(tn: str):
                        async def _fn(**kwargs):
                            if config:
                                await adispatch_custom_event(
                                    "tool",
                                    {"name": tn, "input": {k: str(v)[:120] for k, v in kwargs.items() if v is not None}},
                                    config=config,
                                )
                            clean_args = {k: v for k, v in kwargs.items() if v is not None}
                            try:
                                return await call_linkedin_tool(tn, clean_args)
                            except Exception as exc:
                                log.warning("LinkedIn tool %s failed: %s", tn, exc)
                                return f"Tool error: {exc}"
                        return _fn

                    lc_tools.append(StructuredTool(
                        name=tool_name,
                        description=tool_desc,
                        args_schema=ArgsModel,
                        coroutine=_make_coroutine(tool_name),
                    ))

        log.info("Discovered %d LinkedIn MCP tools from server", len(lc_tools))
        return lc_tools

    except Exception as exc:
        log.warning("Failed to discover LinkedIn MCP tools: %s", exc)
        return []
