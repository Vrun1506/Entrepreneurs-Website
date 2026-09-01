"""Runtime configuration.

Every required value fails loud if absent. There are no `os.environ.get(...)
or "default"` fallbacks for secrets or identifiers, matching the rule the
Next.js side follows: a signing key that silently falls back to a literal is
a signing key an attacker already has, and a storage account that falls back
to a placeholder fails one confusing request at a time instead of once, at
boot, with a name attached.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class MissingConfig(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise MissingConfig(f"{name} is not configured")
    return value


@dataclass(frozen=True)
class Settings:
    upload_ticket_secret: str
    service_token: str
    storage_account: str
    # One container per upload purpose ("post_image" / "profile_picture" /
    # "cv" — see auth.TicketPurpose for the authoritative type). Not typed
    # against that Literal here: auth.py imports settings() from this
    # module, so importing the other way round would be circular. Plain
    # str keys, looked up with the same three literals both files agree on.
    containers: dict[str, str]
    allowed_origins: tuple[str, ...]
    max_upload_bytes: int
    # CVs are stored as original bytes, never re-encoded, so they get
    # their own, separate cap from images — same 8MB ceiling today, but
    # a deliberately distinct knob rather than reusing max_upload_bytes,
    # since a future change to one must not silently change the other.
    max_document_bytes: int


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings(
        upload_ticket_secret=_required("UPLOAD_TICKET_SECRET"),
        service_token=_required("SERVICE_TOKEN"),
        storage_account=_required("AZURE_STORAGE_ACCOUNT"),
        containers={
            "post_image": _required("AZURE_BLOB_CONTAINER"),
            "profile_picture": _required("AZURE_AVATAR_CONTAINER"),
            "cv": _required("AZURE_CV_CONTAINER"),
        },
        # No wildcard default. CORS is what stops another origin driving a
        # member's browser into uploading on their behalf, so an unset value
        # must fail rather than open.
        allowed_origins=tuple(
            origin.strip() for origin in _required("ALLOWED_ORIGINS").split(",") if origin.strip()
        ),
        max_upload_bytes=int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024)),
        max_document_bytes=int(os.environ.get("MAX_DOCUMENT_BYTES", 8 * 1024 * 1024)),
    )
