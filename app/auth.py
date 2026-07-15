"""
Password hashing (bcrypt) + JWT issuance/verification (PyJWT).

Auth model: multi-user email + password. On login we verify against the users
table and issue a signed JWT bearer token. Every protected endpoint verifies the
JWT statelessly (no DB hit) via `verify_api_key` in main.py.

Dev bypass is gated EXPLICITLY on AUTH_DISABLED=1 — never on "secret is empty",
which would silently open the whole API behind a public tunnel.
"""
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from app.credentials import get_config

log = logging.getLogger(__name__)

_JWT_ALG = "HS256"
# bcrypt hash of a random string — compared against for unknown emails so login
# takes the same time whether or not the account exists (anti-enumeration).
_DUMMY_HASH = bcrypt.hashpw(b"nonexistent-user-placeholder", bcrypt.gensalt()).decode()


def auth_disabled() -> bool:
    return get_config("AUTH_DISABLED", "").strip().lower() in ("1", "true", "on", "yes")


def _jwt_secret() -> str:
    return get_config("JWT_SECRET", "")


def _token_ttl_hours() -> int:
    try:
        return int(get_config("JWT_TTL_HOURS", "12"))
    except ValueError:
        return 12


# ── Passwords ──────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; encode explicitly.
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def dummy_verify(password: str) -> None:
    """Run a throwaway bcrypt check to equalise timing for unknown accounts."""
    verify_password(password, _DUMMY_HASH)


# ── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(user_id: int, email: str, is_admin: bool) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "is_admin": is_admin,
        "iat": now,
        "exp": now + timedelta(hours=_token_ttl_hours()),
    }
    # NOTE: no `aud` — the public tunnel hostname rotates, and JWT_SECRET is
    # URL-independent, so tokens survive tunnel restarts.
    return jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[_JWT_ALG])


# ── FastAPI dependencies ───────────────────────────────────────────────────────

def _claims_from_request(request: Request) -> dict | None:
    """Return validated JWT claims, or None in AUTH_DISABLED dev mode.
    Raises 401 on any missing/invalid token when auth is enabled."""
    if auth_disabled():
        return None
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth[len("Bearer "):].strip()
    try:
        return decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def verify_api_key(request: Request):
    """Drop-in replacement for the old shared-secret check. Same name/signature
    so every existing Depends(verify_api_key) site keeps working unchanged."""
    _claims_from_request(request)


async def require_admin(request: Request):
    claims = _claims_from_request(request)
    if claims is None:
        return  # dev mode
    if not claims.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
