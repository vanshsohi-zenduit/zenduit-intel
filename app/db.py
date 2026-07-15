"""
Async SQLAlchemy engine + session for the users/auth database (Postgres).

This is the ONLY relational store — the prospect library, outcomes, sync_state
and credentials remain flat JSON files. `init_db()` is called once at startup
with a retry loop so the app tolerates Postgres not being ready yet (compose
`depends_on: service_healthy` can still flap during first-init).
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.credentials import get_config

log = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    # e.g. postgresql+asyncpg://intel:pw@postgres:5432/intel
    return get_config("DATABASE_URL", "")


# Engine/session are created lazily so importing this module never requires a
# live database (matters for tooling, tests, and AUTH_DISABLED dev mode).
_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        url = _database_url()
        if not url:
            raise RuntimeError("DATABASE_URL is not configured")
        _engine = create_async_engine(url, pool_pre_ping=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def get_session() -> AsyncSession:
    """FastAPI dependency — used by login + user-admin endpoints only, never by
    the hot-path auth check (which is stateless JWT verification)."""
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


async def init_db(retries: int = 5, delay: float = 2.0):
    """Create tables, retrying while Postgres finishes booting."""
    # Import models so their tables register on Base.metadata before create_all.
    from app import models  # noqa: F401

    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            log.info("Database ready (tables ensured)")
            return
        except Exception as exc:  # noqa: BLE001 — connection errors vary by driver
            last_exc = exc
            log.warning("init_db attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                await asyncio.sleep(delay)
    raise RuntimeError(f"Could not initialise database after {retries} attempts: {last_exc}")
