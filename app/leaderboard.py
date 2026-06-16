from datetime import datetime, timedelta
from app.sync_state import read_sync_state, write_sync_state


async def leaderboard_increment(rep_email: str):
    if not rep_email:
        return
    s = await read_sync_state()
    entry = s["leaderboard"].setdefault(rep_email, {"calls": 0, "entries": []})
    entry["calls"] += 1
    entry["entries"].append(datetime.utcnow().isoformat())
    await write_sync_state(s)


async def compute_leaderboard(period: str = "all") -> list:
    s = await read_sync_state()
    cutoff = {"weekly": timedelta(days=7), "monthly": timedelta(days=30)}.get(period)
    now = datetime.utcnow()
    rows = []
    for email, data in s.get("leaderboard", {}).items():
        entries = [datetime.fromisoformat(e) for e in data.get("entries", [])]
        count = sum(1 for e in entries if not cutoff or (now - e) <= cutoff)
        if count > 0:
            rows.append({"rep": email, "calls": count})
    rows.sort(key=lambda r: -r["calls"])
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows
