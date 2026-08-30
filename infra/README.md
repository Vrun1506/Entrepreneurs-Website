# Infrastructure

Everything needed to stand up and run the upload gateway. Three scripts, two
config files, and no step that lives only in someone's head.

```
azure/provision.sh              creates the Azure side. Idempotent.
deploy.sh <ip> [--bootstrap]    sets up and ships to the VM. Run from anywhere.
vm/bootstrap.sh                 one-time VM setup. Called by deploy.sh, not by you.
vm/foundry-gateway.service      systemd unit
vm/nginx-foundry-gateway.conf   nginx origin server block
```

## First run

```bash
az account show                 # confirm you are in the RIGHT subscription
./infra/azure/provision.sh      # prints the VM IP and the Vercel variables
./infra/deploy.sh <vm-ip> --bootstrap
```

Then, in order: paste the Cloudflare origin certificate onto the VM (bootstrap
tells you where), set `AZURE_STORAGE_ACCOUNT` in `/etc/foundry/gateway.env`,
add the DNS record **proxied**, set the Vercel variables, and redeploy Vercel.

## Every deploy after that

```bash
./infra/deploy.sh <vm-ip>
```

Runs the gateway's test suite locally first and refuses to ship past a red
one — that suite *is* the security review for this service, so a deploy that
skipped it would be shipping past SVG rejection, EXIF stripping and JWT
algorithm confusion. Then it builds `server/` into a container image, pushes
it to `ghcr.io/icf-community/foundry-gateway`, has the VM pull and restart,
and curls `/health`. A failed build or push never touches the running
service — only a successful `docker pull` on the VM triggers the restart.
Needs `docker` and `gh` (authenticated) locally. First push only: the GHCR
package needs its visibility set to Public once, in GitHub's package
settings, before the VM's unauthenticated pull will work.

## What holds this together

**No storage credentials exist on the VM.** The system-assigned managed
identity carries `Storage Blob Data Contributor` scoped to the container, and
`DefaultAzureCredential` reads it from the instance metadata endpoint.
`/etc/foundry/gateway.env` contains two shared secrets and three plain
identifiers, and nothing that would let an attacker reach Azure from a
backup of that file.

**Vercel gets a different principal**, `Storage Blob Data Reader`, which can
fetch a user-delegation key and sign read URLs but cannot write or delete.
Full compromise of the Vercel environment cannot destroy or replace a member's
image.

**Neither holds the account key**, because it was disabled at the account
level. It cannot be scoped to one container, so the only safe thing to do with
it is turn it off.

**The origin is unreachable except through Cloudflare.** The NSG admits SSH
from one address and 443 from Cloudflare's published ranges only, so the DDoS
protection cannot be bypassed by anyone who discovers the IP. Cloudflare adds
ranges occasionally — re-run `provision.sh` when uploads start failing for
everyone at once with no deploy behind it.

**The resource group cannot be deleted by accident.** A `CanNotDelete` lock
sits on it from the moment it's created; removing it takes a deliberate
`az lock delete`, not a fat-fingered `az group delete`.

**Spend is watched, not just capped.** Set `BUDGET_ALERT_EMAIL` before
running `provision.sh` and it wires up a monthly budget that emails that
address at 80% and 100% of `BUDGET_AMOUNT` (default $60) — so a
misconfiguration shows up as an email, not a surprise on the bill.

**The gateway runs containerized, hardened at the Docker level.** systemd
runs `docker run` as root (Docker is the privilege boundary now, not a
systemd `User=`), but the container itself runs as a non-root user
(`server/Dockerfile`), read-only, with every capability dropped and a
memory/PID ceiling — replacing the process-level systemd sandboxing the
bare-metal gunicorn process used to carry directly. It uses `--network
host` rather than a published port, specifically so gunicorn's existing
`127.0.0.1`-only bind (and its trust of `X-Forwarded-For` from `127.0.0.1`)
keeps meaning exactly what it always did, with nginx as the only path in.
CI (`gateway-docker` in `ci.yml`) builds the image and runs a Trivy scan on
every push, so a vulnerable dependency or base-image CVE with an available
fix fails the build before it ever reaches `deploy.sh`.

## The compliance step you cannot skip

`provision.sh` disables blob soft-delete, container soft-delete and
versioning, then **re-reads them and aborts if any came back True**. Azure
turns all three on by default and all three retain "deleted" blobs. Left on, a
member exercising erasure would be told their image was destroyed while Azure
quietly kept it — the privacy policy would be false, and the deletion queue
would be doing nothing that matters.

## Ongoing

`unattended-upgrades` applies security patches by itself. Kernel updates need
a reboot: once a month, during a quiet window, `sudo reboot`. systemd brings
the gateway back. That is the standing cost of a VM over a managed host.

Re-running `deploy.sh --bootstrap` is the supported way to re-apply hardening
after an Ubuntu upgrade. It never regenerates the secrets in
`/etc/foundry/gateway.env` — doing so would invalidate every in-flight upload
ticket and desynchronise the gateway from Vercel until somebody noticed.

## Not here yet

Auto-deploy from `main`. Today a deploy is a person running `deploy.sh`. The
shape it would take is a GitHub Actions job on `push` to `main`, gated on the
`gateway` job passing, authenticating to Azure with the OIDC federation the
project already emits `VERCEL_OIDC_TOKEN` for — so no long-lived SSH key or
service-principal secret would need to live in Actions.
