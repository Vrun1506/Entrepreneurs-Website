#!/usr/bin/env bash
#
# Foundry · deploy the upload gateway to the VM
#
#   ./deploy.sh <vm-ip>              build, push, deploy the current server/
#   ./deploy.sh <vm-ip> --bootstrap  first run: install packages, docker,
#                                    nginx, systemd, secrets — then deploy
#
# Builds server/ into a container image, pushes it to GHCR, then has the VM
# pull and restart. A failed build or push never touches the running
# service — only a successful `docker pull` on the VM triggers a restart.
#
# Run this from the repo root or from infra/. It never reads .env.local —
# that file points at PRODUCTION Supabase and has no business here.
set -euo pipefail

VM_IP="${1:-}"
BOOTSTRAP=false
[[ "${2:-}" == "--bootstrap" ]] && BOOTSTRAP=true

[[ -n "$VM_IP" ]] || { echo "usage: $0 <vm-ip> [--bootstrap]" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
SSH="ssh -o StrictHostKeyChecking=accept-new azureuser@$VM_IP"
IMAGE="ghcr.io/icf-community/foundry-gateway:latest"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[0;32m✓\033[0m %s\n' "$*"; }

[[ -d "$SERVER_DIR/app" ]] || { echo "no server/app at $SERVER_DIR" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker not found — install Docker Desktop" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh CLI not found — brew install gh && gh auth login" >&2; exit 1; }

# ─── Test before shipping ───────────────────────────────────────────
# The gateway's test suite IS its security review: SVG rejection, magic-byte
# typing, decompression bombs, EXIF stripping, polyglots, JWT algorithm
# confusion. Shipping past a red suite would mean shipping past those.
say "Running the gateway tests locally first"
if [[ -x "$SERVER_DIR/venv/bin/python" ]]; then
  (cd "$SERVER_DIR" && ./venv/bin/python -m pytest -q) || { echo "tests failed — not deploying" >&2; exit 1; }
  ok "suite green"
else
  printf '    \033[0;33m! no venv at server/venv — skipping local tests\033[0m\n'
fi

# ─── Bootstrap ──────────────────────────────────────────────────────
if [[ "$BOOTSTRAP" == true ]]; then
  say "Bootstrapping $VM_IP"
  $SSH 'sudo bash -s' < "$REPO_ROOT/infra/vm/bootstrap.sh"
  ok "packages, docker, secrets, SSH hardening"

  say "Installing the systemd unit and nginx site"
  scp -q "$REPO_ROOT/infra/vm/foundry-gateway.service" "azureuser@$VM_IP:/tmp/"
  scp -q "$REPO_ROOT/infra/vm/nginx-foundry-gateway.conf" "azureuser@$VM_IP:/tmp/"
  $SSH 'sudo install -m 644 /tmp/foundry-gateway.service /etc/systemd/system/ &&
        sudo install -m 644 /tmp/nginx-foundry-gateway.conf /etc/nginx/sites-available/foundry-gateway &&
        sudo ln -sf /etc/nginx/sites-available/foundry-gateway /etc/nginx/sites-enabled/foundry-gateway &&
        sudo rm -f /etc/nginx/sites-enabled/default &&
        sudo systemctl daemon-reload'
  ok "installed"
fi

# ─── Build and push ─────────────────────────────────────────────────
# --platform linux/amd64: the VM is x86_64 (Azure B-series); building on an
# Apple Silicon laptop without this flag would produce an arm64 image the VM
# cannot run.
say "Building image"
docker build --platform linux/amd64 -t "$IMAGE" "$SERVER_DIR"
ok "built $IMAGE"

say "Pushing to GHCR"
gh auth token | docker login ghcr.io -u "$(gh api user --jq .login)" --password-stdin
docker push "$IMAGE"
ok "pushed"

# ─── Pull and restart ────────────────────────────────────────────────
# The image is private — org package-visibility policy blocks making it
# public even for an Owner account (confirmed 2026-08-31) — so the VM
# authenticates with its own read:packages token before pulling, same
# credential systemd uses on every restart. See bootstrap.sh.
say "Pulling on the VM and restarting"
$SSH 'sudo sh -s' <<REMOTE
set -e
. /etc/foundry/ghcr-pull.env
echo "\$GHCR_TOKEN" | docker login ghcr.io -u "\$GHCR_USERNAME" --password-stdin
docker pull $IMAGE
systemctl restart foundry-gateway
REMOTE
ok "restarted"

# ─── Prove it came back ─────────────────────────────────────────────
# A deploy that does not verify is a deploy that tells you it worked when
# the service died on a missing environment variable.
#
# Poll rather than a fixed sleep: a fresh image pull plus a cold gunicorn
# worker boot can take longer than a flat 2s on a loaded VM or a slow
# registry pull, and a fixed sleep either races (false failure on a healthy
# deploy) or wastes time padding for the worst case every single run.
say "Health check"
HEALTHY=false
for _ in $(seq 1 10); do
  if $SSH 'curl -fsS --max-time 5 localhost:8000/health' 2>/dev/null | grep -q '"ok"'; then
    HEALTHY=true
    break
  fi
  sleep 1
done
if [[ "$HEALTHY" == true ]]; then
  ok "gateway healthy on the VM"
else
  echo
  echo "  Gateway is NOT healthy after 10s. Recent logs:" >&2
  $SSH 'sudo journalctl -u foundry-gateway -n 40 --no-pager' >&2
  exit 1
fi

if $SSH 'sudo nginx -t' >/dev/null 2>&1; then
  $SSH 'sudo systemctl reload nginx'
  ok "nginx reloaded"
else
  printf '    \033[0;33m! nginx config invalid — not reloading. Check TLS certs are in place.\033[0m\n'
fi

printf '\n\033[0;32mDeployed.\033[0m Public check once DNS is proxied:\n  curl -sS https://api.imperialentrepreneurs.com/health\n\n'
