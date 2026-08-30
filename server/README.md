# Foundry upload gateway

Sanitises member-uploaded images and writes them to Azure Blob Storage. Runs on an Azure VM behind
nginx; the Next.js app never sees image bytes.

```
POST /v1/images        one image, authorised by a short-lived signed ticket
POST /v1/blobs/delete  service-to-service, drives the deletion queue
GET  /health           liveness
```

**It holds no database connection and no Supabase client.** Everything it knows about identity
arrives in a 5-minute HS256 ticket minted by Next.js, which has already decided the member is
approved and within their rate limit. That split keeps authorisation in one place while keeping
image bytes off Vercel — and because the ticket format is ours rather than Supabase's, moving the
app to a different identity provider does not touch this service.

## Why each rule in `app/images.py` exists

Everything reaching `sanitise()` is attacker-controlled and everything leaving it is served to the
whole membership. Do not relax these without reading the tests that pin them:

- **Type comes from magic bytes.** The filename and `Content-Type` are supplied by the client and
  are never consulted.
- **SVG is rejected, not sanitised.** It is XML that can carry `<script>`; serving one from our own
  origin is a stored-XSS primitive.
- **Every upload is re-encoded to WebP.** This is what strips EXIF — including the GPS coordinates
  a phone writes into every photo — and what neutralises polyglot files. Original bytes are never
  stored.
- **`Image.MAX_IMAGE_PIXELS` is pinned.** A 50KB PNG can decode to tens of gigabytes.
- **Writes are create-only** (`overwrite=False`). This is what contains a leaked ticket secret: a
  forged ticket naming an existing key can only fail, never replace another member's image.

## Local development

```bash
# 3.12 deliberately: it is what CI runs and what Ubuntu 24.04 gives the VM.
# Testing on a newer interpreter than production is how a Pillow or PyJWT
# behaviour difference reaches the box unnoticed.
python3.12 -m venv venv && source venv/bin/activate
pip install -e '.[dev]'
pytest                       # 51 tests; no Azure needed
uvicorn app.main:app --reload
```

`tests/` covers the sanitisation boundary and the auth surface directly. Storage is stubbed, so the
suite runs anywhere.

## Deploying to the VM

The full provisioning runbook — storage account, NSG rules, managed identity, nginx, TLS — is in
the implementation plan. The parts that live here:

**Systemd unit** (`/etc/systemd/system/foundry-gateway.service`):

```ini
[Unit]
Description=Foundry upload gateway
After=network.target

[Service]
User=foundry
Group=foundry
WorkingDirectory=/opt/foundry/app
EnvironmentFile=/etc/foundry/gateway.env
ExecStart=/opt/foundry/venv/bin/gunicorn -c gunicorn.conf.py app.main:app
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

**Environment** (`/etc/foundry/gateway.env`, mode 600):

| Variable | Notes |
|---|---|
| `UPLOAD_TICKET_SECRET` | Must match the Vercel env of the same name |
| `SERVICE_TOKEN` | Must match Vercel's `GATEWAY_SERVICE_TOKEN` |
| `AZURE_STORAGE_ACCOUNT` | Account name, not a URL |
| `AZURE_BLOB_CONTAINER` | `post-images` |
| `ALLOWED_ORIGINS` | Comma-separated. No wildcard default — CORS is what stops another origin driving a member's browser into uploading |
| `MAX_UPLOAD_BYTES` | Optional, defaults to 8MB |
| `GATEWAY_WORKERS` | Optional, defaults to 2 — raise with the VM's core count |
| `GATEWAY_TIMEOUT` | Optional, defaults to 60s |
| `GATEWAY_MAX_REQUESTS` | Optional, defaults to 1000 before a worker recycles |
| `GATEWAY_LOG_LEVEL` | Optional, defaults to `info` |

The first six are required and fail loudly if absent. The `GATEWAY_*` four are
process tuning read by `gunicorn.conf.py`; a malformed value there falls back
to the documented default rather than refusing to boot, because losing the
service to a typo in a tuning parameter is the worse outcome.

**No Azure credentials go in this file.** The VM's system-assigned managed identity carries
`Storage Blob Data Contributor` on the container, and `DefaultAzureCredential` reads it from the
instance metadata endpoint — so there are no storage secrets on disk at all. Every value above
fails loud if missing; there are no fallbacks.

**nginx** needs `client_max_body_size 10m;`. The default is 1MB, which would reject uploads at a
size the gateway is configured to accept.

## Not in scope here

`server/server.py` holds unimplemented CV stubs (`/cv-store`, `/cv-retrieve`) belonging to the CV
matchmaker, and `server/ai-agent/` is empty. Neither is part of this service; see
`cv-matchmaker-spec.md`. When they are built, they reuse this gateway by adding a `purpose` to the
ticket rather than opening a second upload path.
