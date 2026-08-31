"""Foundry upload gateway.

Two endpoints and a health check:

    POST /v1/images        member uploads one image, authorised by a ticket
    POST /v1/blobs/delete  the deletion drain removes keys, service-to-service
    GET  /health           liveness

Everything the gateway knows about identity arrives in a signed ticket. It
holds no database connection and no Supabase client, on purpose: the only
thing it can do is turn bytes into a sanitised WebP at a key it was told to
use, which keeps the blast radius of a compromise to this container.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import InvalidTicket, is_valid_key, verify_service_token, verify_ticket
from .config import settings
from .images import RejectedImage, sanitise
from .storage import BlobAlreadyExists, delete_image, put_image

log = logging.getLogger("foundry.gateway")

# docs_url/redoc_url only hide the Swagger/ReDoc UI — openapi_url is a
# separate FastAPI setting and defaults to serving the raw schema
# regardless, which would hand an unauthenticated caller every route,
# parameter, and response shape this gateway has. Three endpoints are
# already documented in the module docstring above; nothing needs a
# machine-readable version of the same thing exposed at runtime.
app = FastAPI(title="Foundry upload gateway", docs_url=None, redoc_url=None, openapi_url=None)

# Locked to the app's own origins. This is what stops another site driving a
# signed-in member's browser into uploading on their behalf.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings().allowed_origins),
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# Read size. Small enough that a hostile client cannot make us buffer much
# per iteration, large enough not to make a real upload chatty.
CHUNK = 64 * 1024


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/images")
async def upload_image(
    file: UploadFile,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    try:
        ticket = verify_ticket(authorization)
    except InvalidTicket as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    # Read with a running total and abort the moment the cap is passed.
    #
    # Reading the whole body first and checking len() afterwards is the
    # obvious version and it is a memory-exhaustion target: the cost is paid
    # before the check runs, so an attacker sets the size. Content-Length is
    # no help either — it is a claim by the client. Only counting what has
    # actually arrived is a real limit.
    body = bytearray()
    while chunk := await file.read(CHUNK):
        body.extend(chunk)
        if len(body) > ticket.max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Image must be {ticket.max_bytes // (1024 * 1024)}MB or smaller.",
            )

    if not body:
        raise HTTPException(status_code=400, detail="No image was uploaded.")

    try:
        image = sanitise(bytes(body))
    except RejectedImage as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    try:
        put_image(ticket.key, image.data)
    except BlobAlreadyExists as exc:
        # The ticket named a key that is already occupied. A member cannot
        # cause this — keys are fresh uuids — so it means a replayed or
        # forged ticket, and refusing is the whole point of create-only
        # writes. Logged at warning because it is worth someone seeing.
        log.warning("Rejected upload to an existing key (sub=%s)", ticket.sub)
        raise HTTPException(status_code=409, detail="That upload has already been used.") from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("Blob write failed")
        raise HTTPException(status_code=502, detail="Storage is unavailable.") from exc

    return JSONResponse(
        {
            "key": ticket.key,
            "width": image.width,
            "height": image.height,
            "bytes": len(image.data),
        }
    )


@app.post("/v1/blobs/delete")
async def delete_blobs(
    request: Request,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """Destroy blobs on behalf of the deletion drain.

    This is a compliance path, not housekeeping: the keys arriving here
    belong to posts a member has been told are deleted. If it stops working,
    image bytes for removed content stay in the container.
    """
    try:
        verify_service_token(authorization)
    except InvalidTicket as exc:
        raise HTTPException(status_code=401, detail="Forbidden") from exc

    payload = await request.json()
    keys = payload.get("keys")
    if not isinstance(keys, list) or not all(isinstance(k, str) for k in keys):
        raise HTTPException(status_code=400, detail="keys must be a list of strings.")
    if len(keys) > 100:
        raise HTTPException(status_code=400, detail="At most 100 keys per request.")
    # Same rule as the upload path: a key becomes a path component, so it is
    # validated on arrival rather than trusted because the caller held the
    # service token. Holding that token means "you may delete post images",
    # not "you may name any object in the container".
    if not all(is_valid_key(k) for k in keys):
        raise HTTPException(status_code=400, detail="keys must be post-image blob keys.")

    deleted, missing = 0, 0
    for key in keys:
        try:
            if delete_image(key):
                deleted += 1
            else:
                missing += 1
        except Exception:  # noqa: BLE001
            log.exception("Blob delete failed")
            raise HTTPException(status_code=502, detail="Storage is unavailable.") from None

    # `missing` is reported but is not a failure — see storage.delete_image.
    return JSONResponse({"deleted": deleted, "missing": missing})
