"""
Slack conversion alerts — mirrors the AI SDR's Slack node that fires on a booking.

Fire-and-forget: no-ops cleanly when SLACK_WEBHOOK_URL is unset, and never raises
into the caller, so a Slack hiccup can't break outcome recording.
"""
import logging
import os

import httpx

log = logging.getLogger(__name__)


async def notify_booking(outcome: dict) -> None:
    url = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not url:
        return

    company = outcome.get("company") or "Unknown prospect"
    channel = outcome.get("channel") or "—"
    variant = outcome.get("variant")
    reason = outcome.get("reason") or ""
    notes = outcome.get("notes") or ""

    lines = [f":tada: *Meeting booked — {company}*", f"Channel: {channel}"]
    if variant:
        lines.append(f"Variant: {variant}")
    if reason:
        lines.append(f"Detail: {reason}")
    if notes:
        lines.append(f"Notes: {notes}")

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            await client.post(url, json={"text": "\n".join(lines)})
    except Exception as exc:  # never propagate — alerting is best-effort
        log.warning("Slack booking alert failed: %s", exc)
