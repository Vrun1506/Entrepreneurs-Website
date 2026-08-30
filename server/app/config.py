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
    blob_container: str
    allowed_origins: tuple[str, ...]
    max_upload_bytes: int


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings(
        upload_ticket_secret=_required("UPLOAD_TICKET_SECRET"),
        service_token=_required("SERVICE_TOKEN"),
        storage_account=_required("AZURE_STORAGE_ACCOUNT"),
        blob_container=_required("AZURE_BLOB_CONTAINER"),
        # No wildcard default. CORS is what stops another origin driving a
        # member's browser into uploading on their behalf, so an unset value
        # must fail rather than open.
        allowed_origins=tuple(
            origin.strip() for origin in _required("ALLOWED_ORIGINS").split(",") if origin.strip()
        ),
        max_upload_bytes=int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024)),
    )
