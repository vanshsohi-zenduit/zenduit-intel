import json
import os
import asyncio
from pathlib import Path

CREDENTIALS_FILE = Path(os.environ.get("DATA_DIR", os.getcwd())) / "credentials.json"
_lock = asyncio.Lock()

PLAINTEXT_FIELDS = {
    "GEMINI_RESEARCH_MODEL", "GEMINI_GENERATION_MODEL",
    "N8N_BASE_URL", "N8N_RESEARCH_WEBHOOK_PATH",
    "PUBLIC_APP_URL", "CLICKUP_LIST_ID", "CLICKUP_OVERDUE_HOURS",
    "CLICKUP_POLL_INTERVAL_SEC", "GMAIL_USER", "MANAGER_EMAIL", "ALLOWED_ORIGIN",
    "PORT",
}

# Keys that must come from the process environment / docker compose ONLY. Even if a
# stale or hand-edited credentials.json contains them, they are NEVER merged into
# os.environ — so the compose/.env value always wins and the Settings UI can't set
# them. The MCP servers are pinned here so the app always uses the self-hosted
# services (compose sets BRAIN_MCP_URL=http://brain-mcp:3100, and LINKEDIN_MCP_URL
# likewise when that service is enabled). The auth/DB vars are env-only by design
# (see CLAUDE.md).
ENV_ONLY_FIELDS = {
    "BRAIN_MCP_URL", "BRAIN_MCP_API_KEY", "LINKEDIN_MCP_URL",
    "JWT_SECRET", "JWT_TTL_HOURS", "AUTH_DISABLED", "DATABASE_URL",
    "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB",
    "ADMIN_EMAIL", "ADMIN_PASSWORD", "DATA_DIR",
}

SETTINGS_SCHEMA = {
    "Gemini": [
        "GOOGLE_API_KEY",
        "GEMINI_RESEARCH_MODEL",
        "GEMINI_GENERATION_MODEL",
    ],
    # Brain MCP and LinkedIn MCP are intentionally NOT here — they are pinned to the
    # internal self-hosted compose services (see ENV_ONLY_FIELDS), not user-editable.
    "ClickUp": [
        "CLICKUP_API_TOKEN",
        "CLICKUP_LIST_ID",
        "CLICKUP_OVERDUE_HOURS",
        "CLICKUP_POLL_INTERVAL_SEC",
    ],
    "Email (Gmail)": ["GMAIL_USER", "GMAIL_APP_PASSWORD", "MANAGER_EMAIL"],
    "Zoho Webhook": ["ZOHO_WEBHOOK_SECRET"],
    "Slack": ["SLACK_WEBHOOK_URL"],
    "App": ["PUBLIC_APP_URL"],
}


def load_credentials():
    """Load credentials.json at startup and merge into os.environ.
    Called once before any os.getenv() calls so existing code picks up saved values."""
    try:
        data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        for k, v in data.items():
            if v and k not in ENV_ONLY_FIELDS:
                os.environ[k] = str(v)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def get_config(key: str, default: str = "") -> str:
    return os.getenv(key, default)


async def read_credentials_file() -> dict:
    async with _lock:
        try:
            return json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        except Exception:
            return {}


async def write_credentials_file(data: dict):
    async with _lock:
        CREDENTIALS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        for k, v in data.items():
            if v and k not in ENV_ONLY_FIELDS:
                os.environ[k] = str(v)
