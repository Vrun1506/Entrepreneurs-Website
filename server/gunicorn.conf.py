"""Gunicorn configuration for the upload gateway.

Two workers on a B2s (2 vCPU). Image re-encoding is CPU-bound and briefly
blocking, so the count tracks cores rather than the usual "2 x cores + 1"
rule of thumb for I/O-bound apps — an extra worker here just contends for
the same CPU while holding another decoded bitmap in memory.
"""

bind = "127.0.0.1:8000"
workers = 2
worker_class = "uvicorn.workers.UvicornWorker"

# Uploads are user-paced and small; anything past this is a stuck request.
timeout = 60
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically. Pillow decodes attacker-supplied images all
# day; bounding a worker's lifetime bounds the blast radius of any leak or
# fragmentation in a decoder, without needing to detect one.
max_requests = 1000
max_requests_jitter = 100

accesslog = "-"
errorlog = "-"
loglevel = "info"
# nginx terminates TLS and sets X-Forwarded-For; without this the access log
# records the proxy's address for every request.
forwarded_allow_ips = "127.0.0.1"
