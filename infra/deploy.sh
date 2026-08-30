#!/usr/bin/env bash
#
# Foundry · deploy the upload gateway to the VM
#
#   ./deploy.sh <vm-ip>              deploy the current server/ and restart
#   ./deploy.sh <vm-ip> --bootstrap  first run: install packages, user, nginx,
#                                    systemd, secrets — then deploy
#
# Deploys are atomic-ish: code lands in a staging directory, the venv is
# updated, and only then does systemd restart. A failed pip install leaves
# the running service untouched.
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

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[0;32m✓\033[0m %s\n' "$*"; }

[[ -d "$SERVER_DIR/app" ]] || { echo "no server/app at $SERVER_DIR" >&2; exit 1; }

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
  ok "packages, service user, directories, SSH hardening"

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

# ─── Ship the code ──────────────────────────────────────────────────
say "Copying server/ to the VM"
rsync -az --delete \
  --exclude venv --exclude __pycache__ --exclude .pytest_cache --exclude '*.egg-info' \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$SERVER_DIR/" "azureuser@$VM_IP:/tmp/foundry-app/"
ok "copied"

say "Installing and restarting"
$SSH 'set -e
  sudo rsync -a --delete /tmp/foundry-app/ /opt/foundry/app/
  sudo chown -R foundry:foundry /opt/foundry/app
  # Build the venv into a fresh directory when it does not exist yet;
  # otherwise update in place. pip failing here leaves the running service
  # alone, because the restart below never happens.
  if [ ! -x /opt/foundry/venv/bin/python ]; then
    sudo -u foundry python3.12 -m venv /opt/foundry/venv
  fi
  sudo -u foundry /opt/foundry/venv/bin/pip install -q --upgrade pip
  sudo -u foundry /opt/foundry/venv/bin/pip install -q -e /opt/foundry/app
  sudo systemctl restart foundry-gateway
'
ok "restarted"

# ─── Prove it came back ─────────────────────────────────────────────
# A deploy that does not verify is a deploy that tells you it worked when
# the service died on a missing environment variable.
say "Health check"
sleep 2
if $SSH 'curl -fsS --max-time 5 localhost:8000/health' | grep -q '"ok"'; then
  ok "gateway healthy on the VM"
else
  echo
  echo "  Gateway is NOT healthy. Recent logs:" >&2
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
