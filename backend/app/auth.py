"""
Auth: local username/password + Google OAuth (via Google Identity Services).

The frontend runs the GIS button which returns an ID token (JWT signed by
Google) to us. We verify it against Google's public keys, extract the user's
email + sub + name + picture, and either look up an existing user by sub/email
or create a fresh viewer.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import User


log = logging.getLogger("smartbin.auth")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", "12"))

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_ALLOWED_DOMAINS = [
    d.strip().lower() for d in os.getenv("GOOGLE_ALLOWED_DOMAINS", "").split(",") if d.strip()
]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ─── Passwords / JWT ────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS)
    return jwt.encode({"sub": sub, "role": role, "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {exc}")


def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    payload = _decode(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad token")
    user = db.scalar(select(User).where(User.username == username))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"role '{user.role}' cannot access this")
        return user
    return dep


# ─── Google Identity Services ────────────────────────────────

def google_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID)


def verify_google_id_token(id_token_str: str) -> dict:
    """
    Verify a Google-issued ID token and return the payload.

    Raises HTTPException on any failure.
    """
    if not google_configured():
        raise HTTPException(400, "Google sign-in is not configured on this server")

    try:
        # google-auth is imported lazily so the API can start without it in dev.
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
    except ImportError:
        raise HTTPException(500, "google-auth is not installed on the server")

    try:
        payload = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as exc:
        log.warning("Google token verification failed: %s", exc)
        raise HTTPException(401, "invalid Google credential")

    # Standard checks the library already performs: signature, expiry, audience.
    # Additional: enforce iss + optional workspace-domain allowlist.
    iss = payload.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "unexpected issuer")

    if GOOGLE_ALLOWED_DOMAINS:
        hd = (payload.get("hd") or "").lower()
        email = (payload.get("email") or "").lower()
        email_domain = email.split("@", 1)[1] if "@" in email else ""
        if hd not in GOOGLE_ALLOWED_DOMAINS and email_domain not in GOOGLE_ALLOWED_DOMAINS:
            raise HTTPException(403, "your Google domain is not permitted on this deployment")

    if not payload.get("email_verified"):
        raise HTTPException(401, "Google reports your email is not verified")

    return payload


def find_or_create_google_user(db: Session, payload: dict) -> User:
    sub = payload["sub"]
    email = payload.get("email")
    name = payload.get("name")
    picture = payload.get("picture")

    # 1) Match on google_sub first (stable across email changes)
    user = db.scalar(select(User).where(User.google_sub == sub))

    # 2) Fall back to email match — lets an existing local user link Google
    if not user and email:
        user = db.scalar(select(User).where(User.email == email))
        if user and user.auth_provider == "local":
            # Link the accounts: keep local password intact, add Google linkage
            user.google_sub = sub
            user.avatar_url = picture or user.avatar_url

    # 3) Create fresh viewer if nobody matched
    if not user:
        username = _unique_username_from_email(db, email or f"google-{sub[:8]}")
        user = User(
            username=username,
            email=email,
            full_name=name,
            avatar_url=picture,
            auth_provider="google",
            google_sub=sub,
            role="viewer",
        )
        db.add(user)

    db.commit()
    db.refresh(user)
    return user


def _unique_username_from_email(db: Session, email: str) -> str:
    base = (email.split("@", 1)[0] or "user").lower()
    base = "".join(c for c in base if c.isalnum() or c in "._-")[:48] or "user"
    candidate = base
    i = 1
    while db.scalar(select(User.id).where(User.username == candidate)):
        i += 1
        candidate = f"{base}{i}"
    return candidate


# ─── Bootstrap admin ────────────────────────────────────────

def bootstrap_admin() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(User).limit(1))
        if existing:
            return
        username = os.getenv("ADMIN_USERNAME", "smartbin")
        password = os.getenv("ADMIN_PASSWORD", "smartbin")
        email = os.getenv("ADMIN_EMAIL")
        db.add(User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role="admin",
            auth_provider="local",
            full_name="Bootstrap admin",
        ))
        db.commit()
