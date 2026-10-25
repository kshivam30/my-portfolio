"""Single access-key authentication and signed bearer sessions."""

import base64
import hashlib
import hmac
import os
import secrets
import time

SESSION_SECONDS = 12 * 60 * 60


def create_session() -> str:
    secret = os.getenv("APP_LOGIN_KEY", "").encode()
    if not secret:
        raise RuntimeError("APP_LOGIN_KEY is not configured")
    expires = int(time.time()) + SESSION_SECONDS
    payload = f"owner\n{expires}\n{secrets.token_urlsafe(12)}".encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(secret, encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def verify_session(token: str | None) -> str | None:
    secret = os.getenv("APP_LOGIN_KEY", "").encode()
    if not secret or not token:
        return None
    try:
        encoded, signature_text = token.split(".", 1)
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        expected = hmac.new(secret, encoded.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
        role, expires, _nonce = payload.split("\n", 2)
        if int(expires) <= int(time.time()) or role != "owner":
            return None
        return role
    except (ValueError, UnicodeDecodeError):
        return None
