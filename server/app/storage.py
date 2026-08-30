"""Azure Blob Storage access.

This process is the ONLY thing in the system that can write or delete an
image. Next.js holds a read-only principal used solely to sign SAS URLs; the
storage account key is not held anywhere, and shared-key access is disabled
on the account, so there is no connection string that could leak.

Credentials here come from the VM's system-assigned managed identity via
DefaultAzureCredential, which means there are no storage secrets on disk at
all — the strongest single argument for running this on an Azure VM rather
than anywhere that would need a secret to be handed to it.
"""

from __future__ import annotations

from functools import lru_cache

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

from .config import settings


class BlobAlreadyExists(Exception):
    """Something already occupies that key."""


@lru_cache(maxsize=1)
def _service() -> BlobServiceClient:
    cfg = settings()
    return BlobServiceClient(
        f"https://{cfg.storage_account}.blob.core.windows.net",
        credential=DefaultAzureCredential(),
    )


def put_image(key: str, data: bytes) -> None:
    """Write a sanitised image. Create-only — never an overwrite.

    `overwrite=False` is the control that contains a leaked ticket secret.
    Without it, anyone holding the signing key could mint a ticket naming an
    existing key and replace another member's image in place, while the post
    row and the moderation log both still described the original. With it, a
    forged or replayed ticket can only ever fail.

    Content-Type is fixed rather than echoed from the request: the storage
    host must never serve a type the client had a hand in choosing.
    """
    blob = _service().get_blob_client(settings().blob_container, key)
    try:
        blob.upload_blob(
            data,
            overwrite=False,
            content_settings=ContentSettings(
                content_type="image/webp",
                content_disposition="inline",
                cache_control="private, max-age=3600",
            ),
        )
    except ResourceExistsError as exc:
        raise BlobAlreadyExists(key) from exc


def delete_image(key: str) -> bool:
    """Delete one blob. Returns False when it was already gone.

    "Already gone" is not an error. A retried batch, a key the account
    lifecycle rule collected first, or an upload that never completed all
    reach here legitimately, and treating them as failures would retry the
    row to its dead-letter state while the bytes are in fact destroyed.
    """
    blob = _service().get_blob_client(settings().blob_container, key)
    try:
        blob.delete_blob()
        return True
    except ResourceNotFoundError:
        return False
