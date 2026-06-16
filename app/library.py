import asyncio
import json
import os
import aiofiles

LIBRARY_FILE = os.path.join(os.environ.get("DATA_DIR", os.getcwd()), "library.json")
_library_lock = asyncio.Lock()


async def read_library() -> list:
    try:
        async with aiofiles.open(LIBRARY_FILE, "r", encoding="utf-8") as f:
            return json.loads(await f.read())
    except Exception:
        return []


async def write_library(data: list) -> None:
    async with aiofiles.open(LIBRARY_FILE, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, indent=2))


async def append_library_entry(entry: dict) -> dict:
    async with _library_lock:
        data = await read_library()
        data.insert(0, entry)
        await write_library(data)
    return entry


async def get_library_entry(lead_id: str):
    for e in await read_library():
        if str(e.get("id")) == str(lead_id):
            return e
    return None
