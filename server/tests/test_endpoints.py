"""End-to-end tests for the HTTP surface.

Storage is stubbed — these cover the request path, not Azure. The point is
that the wiring holds: an unauthorised request never reaches the decoder, an
oversized body is cut off before it is buffered, and a rejected image never
reaches storage.
"""

from __future__ import annotations

import io
import time

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image

SECRET = "test-secret-not-a-real-key-padded-to-length"
SERVICE_TOKEN = "service-token-value-padded-to-length-here"
KEY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("UPLOAD_TICKET_SECRET", SECRET)
    monkeypatch.setenv("SERVICE_TOKEN", SERVICE_TOKEN)
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT", "teststorage")
    monkeypatch.setenv("AZURE_BLOB_CONTAINER", "post-images")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.test")
    monkeypatch.setenv("MAX_UPLOAD_BYTES", str(1024 * 1024))

    from app import config

    config.settings.cache_clear()

    from app import main

    # Azure is never contacted in tests. The writes are recorded so the
    # assertions can check what would have been stored.
    written: dict[str, bytes] = {}
    deleted: list[str] = []
    monkeypatch.setattr(main, "put_image", lambda key, data: written.__setitem__(key, data))
    monkeypatch.setattr(main, "delete_image", lambda key: deleted.append(key) or True)

    c = TestClient(main.app)
    c.written = written  # type: ignore[attr-defined]
    c.deleted = deleted  # type: ignore[attr-defined]
    return c


def ticket(**overrides: object) -> str:
    claims: dict[str, object] = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "purpose": "post_image",
        "key": KEY,
        "max_bytes": 1024 * 1024,
        "exp": int(time.time()) + 300,
    }
    claims.update(overrides)
    return jwt.encode(claims, SECRET, algorithm="HS256")


def jpeg(size: tuple[int, int] = (400, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def test_health_needs_no_auth(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_uploads_and_stores_a_sanitised_image(client: TestClient) -> None:
    res = client.post(
        "/v1/images",
        headers={"Authorization": f"Bearer {ticket()}"},
        files={"file": ("photo.jpg", jpeg(), "image/jpeg")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["key"] == KEY
    assert (body["width"], body["height"]) == (400, 300)

    # What reached storage is re-encoded WebP, not the bytes that arrived.
    assert client.written[KEY][:4] == b"RIFF"  # type: ignore[attr-defined]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer nonsense"}, {"Authorization": "Basic abc"}],
)
def test_rejects_unauthorised_uploads_before_decoding(
    client: TestClient, headers: dict[str, str]
) -> None:
    res = client.post("/v1/images", headers=headers, files={"file": ("p.jpg", jpeg(), "image/jpeg")})
    assert res.status_code == 401
    assert client.written == {}  # type: ignore[attr-defined]


def test_rejects_an_oversized_body(client: TestClient) -> None:
    """The cap is enforced while reading, not after.

    Checking len() on a fully-buffered body would mean the cost is paid
    before the check runs, which lets the client choose how much memory we
    spend. Content-Length is no help either — it is a claim.
    """
    big = jpeg((3000, 3000)) + b"\x00" * (1024 * 1024)
    res = client.post(
        "/v1/images",
        headers={"Authorization": f"Bearer {ticket()}"},
        files={"file": ("big.jpg", big, "image/jpeg")},
    )
    assert res.status_code == 413
    assert client.written == {}  # type: ignore[attr-defined]


def test_rejects_an_svg_upload(client: TestClient) -> None:
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    res = client.post(
        "/v1/images",
        headers={"Authorization": f"Bearer {ticket()}"},
        # Content-Type deliberately lies. It is never consulted.
        files={"file": ("logo.png", svg, "image/png")},
    )
    assert res.status_code == 415
    assert client.written == {}  # type: ignore[attr-defined]


def test_rejects_an_empty_upload(client: TestClient) -> None:
    res = client.post(
        "/v1/images",
        headers={"Authorization": f"Bearer {ticket()}"},
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400


def test_delete_requires_the_service_token(client: TestClient) -> None:
    res = client.post("/v1/blobs/delete", json={"keys": [KEY]})
    assert res.status_code == 401

    res = client.post(
        "/v1/blobs/delete",
        headers={"Authorization": "Bearer wrong-token"},
        json={"keys": [KEY]},
    )
    assert res.status_code == 401
    assert client.deleted == []  # type: ignore[attr-defined]


def test_delete_removes_the_named_keys(client: TestClient) -> None:
    res = client.post(
        "/v1/blobs/delete",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
        json={"keys": [KEY]},
    )
    assert res.status_code == 200
    assert res.json()["deleted"] == 1
    assert client.deleted == [KEY]  # type: ignore[attr-defined]


def test_delete_rejects_a_malformed_or_oversized_payload(client: TestClient) -> None:
    auth = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    assert client.post("/v1/blobs/delete", headers=auth, json={"keys": "nope"}).status_code == 400
    assert client.post("/v1/blobs/delete", headers=auth, json={}).status_code == 400
    assert (
        client.post("/v1/blobs/delete", headers=auth, json={"keys": [KEY] * 101}).status_code == 400
    )
