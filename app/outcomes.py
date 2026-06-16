"""
Outcome store — the closed-loop layer.

Outbound-intel generates strategy; this records what actually happened to each
prospect so campaign performance can be measured (mirrors the AI SDR's daily
campaign-stats tracking + per-opener outcome classification).

Storage is a flat JSON file, same convention as library.py — fine at this scale.

Status enum (kept identical to the reply classifier so a classified reply can be
logged directly as an outcome):
  SENT         — outreach sent, no response yet (tracker-only; classifier never emits)
  NO_RESPONSE  — went cold (tracker-only)
  BOOKED       — booked a meeting / call
  FUTURE       — interested, wants contact later
  UNKNOWN      — replied but intent unclear
  REJECTED     — declined / not interested
"""
import json
import os
import uuid
from datetime import datetime, timezone

import aiofiles

OUTCOMES_FILE = os.path.join(os.environ.get("DATA_DIR", os.getcwd()), "outcomes.json")

# Shared with the reply classifier (app/main.py) and the frontend.
OUTCOME_STATUSES = ["SENT", "NO_RESPONSE", "BOOKED", "FUTURE", "UNKNOWN", "REJECTED"]
# A reply, by definition, got a response — these are the "replied" states.
REPLIED_STATUSES = ["BOOKED", "FUTURE", "UNKNOWN", "REJECTED"]
CHANNELS = ["Email", "LinkedIn", "Call", "Message"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def read_outcomes() -> list:
    try:
        async with aiofiles.open(OUTCOMES_FILE, "r", encoding="utf-8") as f:
            data = json.loads(await f.read())
            return data if isinstance(data, list) else []
    except Exception:
        return []


async def write_outcomes(data: list) -> None:
    async with aiofiles.open(OUTCOMES_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, indent=2))


def _normalize_status(status: str) -> str:
    s = (status or "").strip().upper()
    return s if s in OUTCOME_STATUSES else "SENT"


async def record_outcome(payload: dict) -> dict:
    """Create a new outcome, or update an existing one when `id` is supplied.

    A value of None means "not supplied": on update those fields are left
    untouched, so a status-only edit never wipes the variant/channel/etc.

    The returned dict carries a transient `_prevStatus` key (None on create, the
    pre-update status on update) so the caller can fire alerts on a *transition*
    into BOOKED rather than only on create. It is not persisted to the store.
    """
    outcomes = await read_outcomes()
    existing_id = payload.get("id")

    if existing_id:
        for item in outcomes:
            if item.get("id") == existing_id:
                prev_status = item.get("status")
                if payload.get("company") is not None:
                    item["company"] = payload["company"].strip() or "Unknown"
                if payload.get("channel") is not None:
                    item["channel"] = payload["channel"].strip() or "Email"
                if payload.get("variant") is not None:
                    item["variant"] = payload["variant"].strip() or None
                if payload.get("status") is not None:
                    item["status"] = _normalize_status(payload["status"])
                if payload.get("reason") is not None:
                    item["reason"] = payload["reason"].strip()
                if payload.get("notes") is not None:
                    item["notes"] = payload["notes"].strip()
                item["updatedAt"] = _now_iso()
                await write_outcomes(outcomes)
                return {**item, "_prevStatus": prev_status}
        # id supplied but not found — fall through to create

    record = {
        "id": uuid.uuid4().hex,
        "company": (payload.get("company") or "").strip() or "Unknown",
        "channel": (payload.get("channel") or "").strip() or "Email",
        "variant": (payload.get("variant") or "").strip() or None,
        "status": _normalize_status(payload.get("status")),
        "reason": (payload.get("reason") or "").strip(),
        "notes": (payload.get("notes") or "").strip(),
    }
    record["createdAt"] = _now_iso()
    record["updatedAt"] = record["createdAt"]
    outcomes.insert(0, record)
    await write_outcomes(outcomes)
    return {**record, "_prevStatus": None}


async def delete_outcome(outcome_id: str) -> bool:
    outcomes = await read_outcomes()
    remaining = [o for o in outcomes if o.get("id") != outcome_id]
    if len(remaining) == len(outcomes):
        return False
    await write_outcomes(remaining)
    return True


def compute_stats(outcomes: list) -> dict:
    """Aggregate campaign performance — totals, rates, per-variant, per-day."""
    total = len(outcomes)
    by_status = {s: 0 for s in OUTCOME_STATUSES}
    by_day: dict[str, dict] = {}
    by_variant: dict[str, dict] = {}

    for o in outcomes:
        status = o.get("status") if o.get("status") in by_status else "SENT"
        by_status[status] += 1

        day = (o.get("createdAt") or "")[:10] or "unknown"
        d = by_day.setdefault(day, {"date": day, "total": 0, "replied": 0, "booked": 0})
        d["total"] += 1
        if status in REPLIED_STATUSES:
            d["replied"] += 1
        if status == "BOOKED":
            d["booked"] += 1

        variant = o.get("variant") or "—"
        v = by_variant.setdefault(
            variant, {"variant": variant, "total": 0, "replied": 0, "booked": 0}
        )
        v["total"] += 1
        if status in REPLIED_STATUSES:
            v["replied"] += 1
        if status == "BOOKED":
            v["booked"] += 1

    replied = sum(by_status[s] for s in REPLIED_STATUSES)
    booked = by_status["BOOKED"]
    rejected = by_status["REJECTED"]

    def rate(n: int, d: int) -> float:
        return round(100 * n / d, 1) if d else 0.0

    # finalise per-variant rates, best variant by book rate (min 1 sent)
    variants = []
    for v in by_variant.values():
        v["replyRate"] = rate(v["replied"], v["total"])
        v["bookRate"] = rate(v["booked"], v["total"])
        variants.append(v)
    variants.sort(key=lambda x: (x["bookRate"], x["replyRate"]), reverse=True)

    days = sorted(by_day.values(), key=lambda x: x["date"])

    return {
        "total": total,
        "replied": replied,
        "booked": booked,
        "rejected": rejected,
        "replyRate": rate(replied, total),
        "bookRate": rate(booked, total),
        "byStatus": by_status,
        "byVariant": variants,
        "byDay": days,
    }
