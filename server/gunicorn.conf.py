"""Gunicorn configuration for the upload gateway.

WHAT BELONGS IN THIS FILE, AND WHAT DOES NOT.

Nothing here is a secret, and nothing here should ever become one. The
gateway's secrets — UPLOAD_TICKET_SECRET, SERVICE_TOKEN — live in
/etc/foundry/gateway.env at mode 600 and are read by app/config.py, which
fails loudly if any is missing. This file holds process tuning: how many
workers, how long to wait, when to recycle. Publishing all of it tells an
attacker nothing they could not learn by sending two requests.

The values that vary by machine are read from the environment with the
current box's values as defaults, so moving to a bigger VM is a change to
gateway.env rather than a commit. The values that are properties of the
design — binding to loopback so nginx is the only way in — stay fixed here,
because making them configurable would turn a security control into an
option somebody can get wrong at 2am.
"""

import os


def _int(name: str, default: int) -> int:
    """Read a positive int from the environment, ignoring nonsense.

    A malformed value here would otherwise crash the gateway at boot on a
    typo in gateway.env, which is a bad trade for a tuning parameter — the
    documented default is a better answer than no service.
    """
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


# Loopback only, and deliberately not configurable. nginx terminates TLS,
# enforces the body limit and is the only thing the NSG lets reach this
# host; a gateway bound to 0.0.0.0 would be reachable directly on port 8000
# by anything inside the VNet, bypassing all three.
bind = "127.0.0.1:8000"

# Two workers on a B2als_v2 (2 vCPU). Image re-encoding is CPU-bound and briefly
# blocking, so the count tracks cores rather than the usual "2 x cores + 1"
# rule of thumb for I/O-bound apps — an extra worker here just contends for
# the same CPU while holding another decoded bitmap in memory. Override
# GATEWAY_WORKERS when the VM size changes.
workers = _int("GATEWAY_WORKERS", 2)
worker_class = "uvicorn.workers.UvicornWorker"

# Uploads are user-paced and small; anything past this is a stuck request.
timeout = _int("GATEWAY_TIMEOUT", 60)
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically. Pillow decodes attacker-supplied images all
# day; bounding a worker's lifetime bounds the blast radius of any leak or
# fragmentation in a decoder, without needing to detect one.
max_requests = _int("GATEWAY_MAX_REQUESTS", 1000)
max_requests_jitter = 100

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GATEWAY_LOG_LEVEL", "info")
# nginx terminates TLS and sets X-Forwarded-For; without this the access log
# records the proxy's address for every request. Loopback only — trusting a
# wider range would let a client forge its own source address in our logs.
forwarded_allow_ips = "127.0.0.1"
