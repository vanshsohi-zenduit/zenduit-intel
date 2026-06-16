import json
import os
import asyncio
from pathlib import Path

CREDENTIALS_FILE = Path(os.environ.get("DATA_DIR", os.getcwd())) / "credentials.json"
_lock = asyncio.Lock()

PLAINTEXT_FIELDS = {
    "GEMINI_RESEARCH_MODEL", "GEMINI_GENERATION_MODEL", "GEMINI_DEEP_RESEARCH_MODEL",
    "BRAIN_MCP_URL", "LINKEDIN_MCP_URL", "N8N_BASE_URL", "N8N_RESEARCH_WEBHOOK_PATH",
    "PUBLIC_APP_URL", "CLICKUP_LIST_ID", "CLICKUP_OVERDUE_HOURS",
    "CLICKUP_POLL_INTERVAL_SEC", "GMAIL_USER", "MANAGER_EMAIL", "ALLOWED_ORIGIN",
    "PORT",
}

SETTINGS_SCHEMA = {
    "Gemini": [
        "GOOGLE_API_KEY",
        "GEMINI_RESEARCH_MODEL",
        "GEMINI_GENERATION_MODEL",
        "GEMINI_DEEP_RESEARCH_MODEL",
    ],
    "Brain MCP": ["BRAIN_MCP_URL", "BRAIN_MCP_API_KEY"],
    "LinkedIn MCP": ["LINKEDIN_MCP_URL"],
    "ClickUp": [
        "CLICKUP_API_TOKEN",
        "CLICKUP_LIST_ID",
        "CLICKUP_OVERDUE_HOURS",
        "CLICKUP_POLL_INTERVAL_SEC",
    ],
    "Email (Gmail)": ["GMAIL_USER", "GMAIL_APP_PASSWORD", "MANAGER_EMAIL"],
    "Zoho Webhook": ["ZOHO_WEBHOOK_SECRET"],
    "Slack": ["SLACK_WEBHOOK_URL"],
    "App": ["PUBLIC_APP_URL", "API_SECRET"],
}


def load_credentials():
    """Load credentials.json at startup and merge into os.environ.
    Called once before any os.getenv() calls so existing code picks up saved values."""
    try:
        data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        for k, v in data.items():
            if v:
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
            if v:
                os.environ[k] = str(v)
