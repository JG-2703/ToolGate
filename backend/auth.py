"""Auth — bcrypt password hashing, JWT session cookies, role guards."""
from __future__ import annotations

import os
import time
from typing import Optional

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException

import models

# is_prod gates production hardening (Secure cookie, required secret, docs off).
IS_PROD = os.environ.get("TOOLGATE_ENV", "dev").lower() in ("prod", "production")

# Signing secret. REQUIRED in prod. Dev fallback is generated per-process so
# tokens don't survive a restart (acceptable for local).
JWT_SECRET = os.environ.get("TOOLGATE_JWT_SECRET")
if not JWT_SECRET:
    if IS_PROD:
        raise RuntimeError(
            "TOOLGATE_JWT_SECRET is required when TOOLGATE_ENV=prod. Refusing to start."
        )
    JWT_SECRET = os.urandom(32).hex()

JWT_ALG = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("TOOLGATE_JWT_TTL", str(60 * 60 * 12)))  # 12h
COOKIE_NAME = "toolgate_session"

# bcrypt silently truncates past 72 bytes — cap input length explicitly.
MAX_PASSWORD_BYTES = 72


# ── password hashing ─────────────────────────────────────────────────────────

def _pw_bytes(plain: str) -> bytes:
    """Encode + hard-cap to bcrypt's 72-byte limit (no silent truncation surprise)."""
    return plain.encode("utf-8")[:MAX_PASSWORD_BYTES]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_pw_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(plain), password_hash.encode("utf-8"))
    except Exception:
        return False


# ── JWT ──────────────────────────────────────────────────────────────────────

def issue_token(user: dict) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# ── FastAPI dependencies ─────────────────────────────────────────────────────

async def current_user(
    toolgate_session: Optional[str] = Cookie(default=None),
) -> dict:
    """Resolve the logged-in user from the session cookie, or 401."""
    if not toolgate_session:
        raise HTTPException(401, "Not authenticated")
    claims = decode_token(toolgate_session)
    if not claims:
        raise HTTPException(401, "Invalid or expired session")
    user = await models.get_user_by_id(int(claims["sub"]))
    if not user:
        raise HTTPException(401, "User no longer exists")
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


def require_role(*roles: str):
    """Dependency factory — allow only the given roles."""
    async def _guard(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return _guard


# ── SSRF guard ────────────────────────────────────────────────────────────────

# Comma-separated host suffixes admins may target. Default: Volopay only.
ALLOWED_TARGET_HOSTS = [
    h.strip().lower()
    for h in os.environ.get("TOOLGATE_ALLOWED_HOSTS", "volopay.site,volopay.co").split(",")
    if h.strip()
]

# Never allow these — cloud metadata, loopback, link-local, private ranges.
_BLOCKED_HOST_SUBSTR = (
    "169.254.", "localhost", "127.", "0.0.0.0", "::1", "metadata",
    "10.", "192.168.",
)


def is_allowed_target_url(url: str) -> bool:
    """True if url's host is on the allowlist and not an internal/metadata address."""
    from urllib.parse import urlparse
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").lower()
    if not host:
        return False
    if any(b in host for b in _BLOCKED_HOST_SUBSTR):
        return False
    if host.startswith("172."):  # 172.16.0.0–172.31.255.255 private range
        try:
            second = int(host.split(".")[1])
            if 16 <= second <= 31:
                return False
        except (IndexError, ValueError):
            pass
    return any(host == h or host.endswith("." + h) for h in ALLOWED_TARGET_HOSTS)


# ── login rate limiting (in-memory, per key) ─────────────────────────────────

_LOGIN_MAX_ATTEMPTS = int(os.environ.get("TOOLGATE_LOGIN_MAX_ATTEMPTS", "10"))
_LOGIN_WINDOW_SEC = int(os.environ.get("TOOLGATE_LOGIN_WINDOW_SEC", "300"))  # 5 min
_login_attempts: dict[str, list[float]] = {}


def login_rate_limited(*keys: str) -> bool:
    """Record an attempt against each key; return True if any key is over limit."""
    now = time.time()
    limited = False
    for key in keys:
        window = [t for t in _login_attempts.get(key, []) if now - t < _LOGIN_WINDOW_SEC]
        window.append(now)
        _login_attempts[key] = window
        if len(window) > _LOGIN_MAX_ATTEMPTS:
            limited = True
    return limited


def login_reset(*keys: str):
    """Clear counters on successful login."""
    for key in keys:
        _login_attempts.pop(key, None)


_WEAK_ADMIN_PASSWORDS = {"admin", "password", "123456", "admin123", "changeme", ""}


async def seed_admin():
    """Create the initial admin from env if no users exist yet."""
    if await models.count_users() > 0:
        return
    admin_user = os.environ.get("TOOLGATE_ADMIN_USER", "admin")
    admin_pass = os.environ.get("TOOLGATE_ADMIN_PASSWORD", "admin")
    if IS_PROD and (admin_pass.lower() in _WEAK_ADMIN_PASSWORDS or len(admin_pass) < 12):
        raise RuntimeError(
            "TOOLGATE_ADMIN_PASSWORD must be set to a strong password (>=12 chars, "
            "not a common default) when TOOLGATE_ENV=prod. Refusing to seed admin."
        )
    if admin_pass.lower() in _WEAK_ADMIN_PASSWORDS:
        print("[auth] WARNING: seeding admin with a WEAK default password. "
              "Set TOOLGATE_ADMIN_PASSWORD before exposing this server.", flush=True)
    await models.create_user(admin_user, hash_password(admin_pass), role="admin")
