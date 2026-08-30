"""Tests for ticket verification.

The gateway trusts exactly one thing — a signed ticket — so these tests
cover the ways someone might try to forge, replay, or widen one.
"""

from __future__ import annotations

import time

import jwt
import pytest

# 32+ bytes: below that PyJWT warns about HMAC key length, and the real
# secret is generated with `openssl rand -base64 48`.
SECRET = "test-secret-not-a-real-key-padded-to-length"
KEY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp"


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPLOAD_TICKET_SECRET", SECRET)
    monkeypatch.setenv("SERVICE_TOKEN", "service-token-value")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT", "teststorage")
    monkeypatch.setenv("AZURE_BLOB_CONTAINER", "post-images")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.test")
    from app.config import settings

    settings.cache_clear()


def make_ticket(secret: str = SECRET, **overrides: object) -> str:
    claims: dict[str, object] = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "purpose": "post_image",
        "key": KEY,
        "max_bytes": 8 * 1024 * 1024,
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }
    claims.update(overrides)
    return jwt.encode(claims, secret, algorithm="HS256")


def test_accepts_a_well_formed_ticket() -> None:
    from app.auth import verify_ticket

    ticket = verify_ticket(f"Bearer {make_ticket()}")
    assert ticket.key == KEY
    assert ticket.purpose == "post_image"


@pytest.mark.parametrize(
    "header",
    [None, "", "Basic abc", "Bearer", "Bearer not-a-jwt", "nonsense"],
)
def test_rejects_malformed_authorization_headers(header: str | None) -> None:
    from app.auth import InvalidTicket, verify_ticket

    with pytest.raises(InvalidTicket):
        verify_ticket(header)


def test_rejects_a_ticket_signed_with_another_secret() -> None:
    from app.auth import InvalidTicket, verify_ticket

    with pytest.raises(InvalidTicket):
        verify_ticket(f"Bearer {make_ticket(secret='wrong-secret-also-padded-to-length-here')}")


def test_rejects_an_expired_ticket() -> None:
    from app.auth import InvalidTicket, verify_ticket

    expired = make_ticket(exp=int(time.time()) - 10)
    with pytest.raises(InvalidTicket):
        verify_ticket(f"Bearer {expired}")


def test_rejects_the_none_algorithm() -> None:
    """Algorithm confusion: a token declaring it needs no signature.

    Pinning algorithms=["HS256"] in verify_ticket is what stops this. It is
    the classic JWT vulnerability and the reason that argument is never
    left to default.
    """
    from app.auth import InvalidTicket, verify_ticket

    forged = jwt.encode(
        {
            "sub": "attacker",
            "purpose": "post_image",
            "key": KEY,
            "max_bytes": 8 * 1024 * 1024,
            "exp": int(time.time()) + 300,
        },
        key="",
        algorithm="none",
    )
    with pytest.raises(InvalidTicket):
        verify_ticket(f"Bearer {forged}")


@pytest.mark.parametrize(
    "bad_key",
    [
        "../../../etc/passwd",
        "not-a-uuid.webp",
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png",
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp/../other.webp",
        "",
    ],
)
def test_rejects_a_ticket_naming_an_unacceptable_key(bad_key: str) -> None:
    """A key out of a token becomes a path component.

    Validated here as well as at issue time, so a compromised signing key
    still cannot direct a write outside the expected shape.
    """
    from app.auth import InvalidTicket, verify_ticket

    with pytest.raises(InvalidTicket):
        verify_ticket(f"Bearer {make_ticket(key=bad_key)}")


def test_rejects_a_ticket_for_another_purpose() -> None:
    from app.auth import InvalidTicket, verify_ticket

    with pytest.raises(InvalidTicket):
        verify_ticket(f"Bearer {make_ticket(purpose='cv')}")


def test_a_ticket_cannot_raise_the_server_size_ceiling() -> None:
    """max_bytes is a claim, and claims are clamped, not obeyed."""
    from app.auth import verify_ticket

    greedy = make_ticket(max_bytes=10 * 1024 * 1024 * 1024)
    assert verify_ticket(f"Bearer {greedy}").max_bytes == 8 * 1024 * 1024


def test_service_token_comparison_accepts_only_the_real_token() -> None:
    from app.auth import InvalidTicket, verify_service_token

    verify_service_token("Bearer service-token-value")
    with pytest.raises(InvalidTicket):
        verify_service_token("Bearer service-token-valu")
    with pytest.raises(InvalidTicket):
        verify_service_token("Bearer ")
