import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
import os

log = logging.getLogger(__name__)

SYNC_FILE = Path(os.environ.get("DATA_DIR", os.getcwd())) / "sync_state.json"
_lock = asyncio.Lock()

_DEFAULT: dict = {
    "zoho_processed_lead_ids": [],
    "clickup_tasks": {},
    "clickup_counted_ids": [],
    "clickup_alerted_ids": [],
    "leaderboard": {},
}


async def read_sync_state() -> dict:
    async with _lock:
        try:
            data = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
            return {**_DEFAULT, **data}
        except FileNotFoundError:
            return dict(_DEFAULT)
        except Exception as e:
            log.warning("sync_state read error: %s", e)
            return dict(_DEFAULT)


async def write_sync_state(data: dict):
    async with _lock:
        try:
            SYNC_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            log.warning("sync_state write error: %s", e)


async def mark_lead_processed(lead_id: str):
    s = await read_sync_state()
    if lead_id and lead_id not in s["zoho_processed_lead_ids"]:
        s["zoho_processed_lead_ids"].append(lead_id)
        await write_sync_state(s)


async def save_task(lead_id: str, task_id: str, rep_email: str, company: str):
    s = await read_sync_state()
    s["clickup_tasks"][task_id] = {
        "lead_id": lead_id,
        "rep_email": rep_email,
        "company": company,
        "created_at": datetime.utcnow().isoformat(),
    }
    await write_sync_state(s)


async def mark_task_counted(task_id: str):
    s = await read_sync_state()
    if task_id not in s["clickup_counted_ids"]:
        s["clickup_counted_ids"].append(task_id)
        await write_sync_state(s)


async def mark_task_alerted(task_id: str):
    s = await read_sync_state()
    if task_id not in s["clickup_alerted_ids"]:
        s["clickup_alerted_ids"].append(task_id)
        await write_sync_state(s)
