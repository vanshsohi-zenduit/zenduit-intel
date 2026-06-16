import asyncio
import logging
import time

from app.credentials import get_config
from app.sync_state import read_sync_state, mark_task_counted, mark_task_alerted, save_task

log = logging.getLogger(__name__)


async def clickup_poll_loop():
    from app.clients.clickup import fetch_tasks
    from app.leaderboard import leaderboard_increment
    from app.email_sender import send_overdue

    log.info("ClickUp poll loop started")
    while True:
        interval = int(get_config("CLICKUP_POLL_INTERVAL_SEC", "600"))
        try:
            list_id = get_config("CLICKUP_LIST_ID", "")
            if not list_id:
                await asyncio.sleep(interval)
                continue

            overdue_h = int(get_config("CLICKUP_OVERDUE_HOURS", "48"))
            state = await read_sync_state()
            tracked = state.get("clickup_tasks", {})
            tasks = await fetch_tasks(list_id)

            for task in tasks:
                tid = task.get("id")
                if not tid:
                    continue
                meta = tracked.get(tid, {})
                created_ms = int(task.get("date_created", 0) or 0)
                age_h = (time.time() - created_ms / 1000) / 3600 if created_ms else 0
                is_done = task.get("status", {}).get("type") == "closed"

                if is_done and tid not in state.get("clickup_counted_ids", []):
                    rep_email = meta.get("rep_email", "")
                    if rep_email:
                        await leaderboard_increment(rep_email)
                    await mark_task_counted(tid)
                    log.info("Counted ClickUp task %s as completed for %s", tid, rep_email)

                if (
                    not is_done
                    and age_h > overdue_h
                    and tid not in state.get("clickup_alerted_ids", [])
                    and meta
                ):
                    mgr = get_config("MANAGER_EMAIL")
                    if mgr:
                        task_url = f"https://app.clickup.com/t/{tid}"
                        await send_overdue(
                            mgr,
                            meta.get("rep_email", "Unknown rep"),
                            meta.get("company", "Unknown company"),
                            task_url,
                        )
                        await mark_task_alerted(tid)
                        log.info("Sent overdue alert for task %s to %s", tid, mgr)

        except asyncio.CancelledError:
            log.info("ClickUp poll loop cancelled")
            return
        except Exception as e:
            log.error("ClickUp poll loop error: %s", e)

        await asyncio.sleep(interval)
