#!/usr/bin/env bash
#
# Foundry · Azure provisioning for the upload gateway
#
# Creates: resource group, storage account, private container, the VM, its
# network rules, the managed identity's RBAC, and the read-only service
# principal Vercel uses to sign image URLs.
#
# SAFE TO RE-RUN. Every step checks for what it is about to create, so a
# half-finished run can be resumed by running it again. Nothing here deletes
# anything.
#
#   ./provision.sh                 provision, then print the Vercel values
#   ./provision.sh --print-only    just re-print the values (creates nothing)
#
# Requires: az CLI, logged in to the RIGHT subscription. Check with
# `az account show` before you start — this spends money on whatever
# subscription is active, not the one you meant.
set -euo pipefail

# ─── Settings ───────────────────────────────────────────────────────
# Override any of these from the environment, e.g. LOC=ukwest ./provision.sh
RG="${RG:-foundry-rg}"
LOC="${LOC:-uksouth}"
CONTAINER="${CONTAINER:-post-images}"
VM="${VM:-foundry-gateway}"
# Every B-series option is blocked on this subscription in uksouth: the
# original generation (B1s, B2s, ...) is capacity-restricted
# (NotAvailableForSubscription, confirmed via `az vm list-skus`), and the v2
# generation has an approved vCPU quota of 0 (confirmed via `az vm
# list-usage` and a failed self-service increase — QuotaNotAvailableForResource,
# meaning this family needs a support ticket, not just a form). D2s_v3 (2
# vCPU / 8GB, amd64) has 10 vCPUs already approved and zero restrictions —
# confirmed the same two ways. It costs more than the burstable B-series
# would have ($0.116/hr vs B2als_v2's would-be $0.0425/hr) for RAM this
# stateless service won't use, but it provisions today instead of filing an
# Azure support ticket and waiting on a human, of unknown duration. Revisit
# once Basv2 quota is approved — retry `az quota update` periodically, or
# file a ticket if it's still QuotaNotAvailableForResource.
VM_SIZE="${VM_SIZE:-Standard_D2s_v3}"
SP_NAME="${SP_NAME:-foundry-vercel-blob-reader}"
# The storage account name must be globally unique, lowercase, 3-24 chars.
# Derived from the resource group so a re-run finds the same one rather than
# creating a second; override SA to adopt an account you already made.
SA="${SA:-}"
# Monthly spend alert. No default email — the budget/action-group step is
# skipped entirely until you set one, so a bare run never silently emails
# no one and never silently skips something you expected to happen.
BUDGET_ALERT_EMAIL="${BUDGET_ALERT_EMAIL:-}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-60}"

PRINT_ONLY=false
[[ "${1:-}" == "--print-only" ]] && PRINT_ONLY=true

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[0;32m✓\033[0m %s\n' "$*"; }
skip() { printf '    \033[0;90m·\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ─── Preflight ──────────────────────────────────────────────────────
command -v az >/dev/null || die "az CLI not found. brew install azure-cli"

ACCOUNT_JSON=$(az account show -o json 2>/dev/null) || die "Not logged in. Run: az login"
SUB_ID=$(jq -r .id   <<<"$ACCOUNT_JSON")
SUB_NAME=$(jq -r .name <<<"$ACCOUNT_JSON")
TENANT=$(jq -r .tenantId <<<"$ACCOUNT_JSON")

say "Subscription"
printf '    %s\n    %s\n' "$SUB_NAME" "$SUB_ID"
if [[ "$PRINT_ONLY" == false ]]; then
  read -rp $'\n    Provision into THIS subscription? [y/N] ' reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "Aborted. Switch with: az account set --subscription <id>"
fi

# ─── Resource providers ─────────────────────────────────────────────
# A brand-new subscription has every provider unregistered, and the failure
# mode is a "MissingSubscriptionRegistration" error on the first create that
# names no obvious cause. Registration is free, creates nothing, and takes a
# couple of minutes to propagate — so kick it off early and wait once.
say "Resource providers"
NEEDED=(Microsoft.Compute Microsoft.Network Microsoft.Storage Microsoft.ManagedIdentity Microsoft.Authorization)
PENDING=()
for ns in "${NEEDED[@]}"; do
  state=$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo Unknown)
  if [[ "$state" == "Registered" ]]; then
    skip "$ns"
  else
    az provider register --namespace "$ns" -o none
    PENDING+=("$ns")
  fi
done
if (( ${#PENDING[@]} )); then
  printf '    waiting for %s ' "${PENDING[*]}"
  for _ in $(seq 1 60); do
    remaining=0
    for ns in "${PENDING[@]}"; do
      [[ "$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null)" == "Registered" ]] || remaining=1
    done
    (( remaining == 0 )) && break
    printf '.'; sleep 10
  done
  echo
  for ns in "${PENDING[@]}"; do
    state=$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null)
    [[ "$state" == "Registered" ]] || die "$ns is still $state. Wait a minute and re-run."
  done
fi
ok "all providers registered"

# Resolve the storage account: adopt an existing one in the RG before
# inventing a new name, so a re-run is idempotent.
if [[ -z "$SA" ]]; then
  SA=$(az storage account list -g "$RG" --query "[0].name" -o tsv 2>/dev/null || true)
fi
if [[ -z "$SA" || "$SA" == "None" ]]; then
  # `|| true` on the pipeline itself, not after the substitution: `head -c 12`
  # closing the pipe early sends `tr` a SIGPIPE, and under pipefail that's a
  # 141 exit that `set -e` treats as this line failing — the script died
  # right here with no message, since -e doesn't print anything on its way
  # out. The 12 bytes `head` already wrote are unaffected by tr's exit code,
  # so this is safe to swallow.
  SA="foundry$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 12 || true)"
fi

SCOPE="/subscriptions/$SUB_ID/resourceGroups/$RG/providers/Microsoft.Storage/storageAccounts/$SA/blobServices/default/containers/$CONTAINER"

if [[ "$PRINT_ONLY" == true ]]; then
  say "Values (nothing created)"
  printf '    AZURE_STORAGE_ACCOUNT = %s\n    AZURE_BLOB_CONTAINER  = %s\n    AZURE_TENANT_ID       = %s\n' \
    "$SA" "$CONTAINER" "$TENANT"
  VM_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv 2>/dev/null || echo "not created")
  printf '    VM public IP          = %s\n' "$VM_IP"
  exit 0
fi

# ─── 1. Resource group ──────────────────────────────────────────────
say "Resource group"
az group create -n "$RG" -l "$LOC" -o none
ok "$RG in $LOC"

# A fat-fingered or scripted `az group delete` would take out the VM,
# storage account, and every member image at once with no confirmation
# beyond the CLI's own. Free, and can't be bypassed by accident — removing
# it takes a deliberate `az lock delete`.
if az lock show -g "$RG" -n foundry-no-delete -o none 2>/dev/null; then
  skip "delete lock already present"
else
  az lock create -g "$RG" -n foundry-no-delete --lock-type CanNotDelete -o none
  ok "$RG protected from deletion"
fi

# ─── 2. Storage account ─────────────────────────────────────────────
say "Storage account"
if az storage account show -n "$SA" -g "$RG" -o none 2>/dev/null; then
  skip "$SA already exists"
else
  # --allow-blob-public-access false  makes a public container impossible.
  # --allow-shared-key-access false   disables the account key outright. It
  #   cannot be scoped to one container, so the only safe thing to do with
  #   it is turn it off; everything then authenticates through Entra, which
  #   is what user-delegation SAS needs anyway.
  az storage account create \
    -n "$SA" -g "$RG" -l "$LOC" \
    --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --https-only true \
    --allow-blob-public-access false \
    --allow-shared-key-access false \
    -o none
  ok "created $SA"
fi

say "Container"
if az storage container show --name "$CONTAINER" --account-name "$SA" --auth-mode login -o none 2>/dev/null; then
  skip "$CONTAINER already exists"
else
  az storage container create --name "$CONTAINER" --account-name "$SA" \
    --auth-mode login --public-access off -o none
  ok "created $CONTAINER"
fi

# ─── 3. Soft-delete and versioning OFF ──────────────────────────────
# COMPLIANCE-CRITICAL. Azure turns both on by default and both RETAIN
# "deleted" blobs. Left on, a member exercising erasure is told their image
# is destroyed while Azure quietly keeps a copy — the privacy policy would
# be false and the deletion queue would be doing nothing that matters.
say "Disabling soft-delete and versioning (compliance-critical)"
az storage account blob-service-properties update \
  --account-name "$SA" -g "$RG" \
  --enable-delete-retention false \
  --enable-container-delete-retention false \
  --enable-versioning false \
  -o none

RETENTION=$(az storage account blob-service-properties show \
  --account-name "$SA" -g "$RG" \
  --query "[deleteRetentionPolicy.enabled, containerDeleteRetentionPolicy.enabled, isVersioningEnabled]" -o tsv | tr '\n' ' ')
if [[ "$RETENTION" == *"True"* ]]; then
  die "Retention is still enabled somewhere ($RETENTION). Do not go live until all three read False."
fi
ok "delete-retention, container-retention and versioning all off"

# ─── 4. Lifecycle backstop ──────────────────────────────────────────
# Posts die at 7 days, so anything older than 30 is definitionally orphaned.
# A net beneath the deletion queue, not the mechanism.
say "Lifecycle rule (30-day orphan sweep)"
POLICY=$(mktemp)
cat > "$POLICY" <<'JSON'
{"rules":[{"enabled":true,"name":"purge-orphans","type":"Lifecycle",
"definition":{"actions":{"baseBlob":{"delete":{"daysAfterModificationGreaterThan":30}}},
"filters":{"blobTypes":["blockBlob"],"prefixMatch":["post-images/"]}}}]}
JSON
az storage account management-policy create --account-name "$SA" -g "$RG" --policy @"$POLICY" -o none 2>/dev/null \
  || az storage account management-policy update --account-name "$SA" -g "$RG" --set "policy=@$POLICY" -o none
rm -f "$POLICY"
ok "orphans deleted after 30 days"

# ─── 5. VM ──────────────────────────────────────────────────────────
say "Virtual machine"
if az vm show -g "$RG" -n "$VM" -o none 2>/dev/null; then
  skip "$VM already exists"
else
  # --assign-identity gives it the system-assigned identity that carries
  # Blob permissions, so no storage credential ever lands on the disk.
  # --nsg-rule NONE opens nothing; rules are added explicitly below.
  # --storage-sku os=StandardSSD_LRS: the gateway is stateless and writes
  # nothing to disk (images go straight to Blob, no database — see
  # infra/vm/foundry-gateway.service), so Premium SSD's IOPS advantage here
  # is entirely wasted. Standard SSD saves a few dollars a month for zero
  # functional loss.
  az vm create \
    -g "$RG" -n "$VM" -l "$LOC" \
    --image Ubuntu2404 \
    --size "$VM_SIZE" \
    --storage-sku os=StandardSSD_LRS \
    --admin-username azureuser \
    --generate-ssh-keys \
    --public-ip-sku Standard \
    --assign-identity \
    --nsg-rule NONE \
    -o none
  ok "created $VM ($VM_SIZE)"
fi

VM_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
ok "public IP $VM_IP"

# ─── 6. Network rules ───────────────────────────────────────────────
say "Network security"
NSG=$(az network nsg list -g "$RG" --query "[0].name" -o tsv)
[[ -n "$NSG" && "$NSG" != "None" ]] || die "No NSG found in $RG. Create and attach one before adding rules."
ok "NSG $NSG"

MYIP=$(curl -fsS https://api.ipify.org)
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-ssh \
  --priority 100 --access Allow --protocol Tcp --direction Inbound \
  --source-address-prefixes "$MYIP/32" --destination-port-ranges 22 -o none
ok "SSH from $MYIP only"

# Only Cloudflare reaches 443, so the origin cannot be hit directly and
# Cloudflare's DDoS protection cannot be bypassed by anyone who finds the IP.
# Re-run this script when Cloudflare publishes new ranges.
# shellcheck disable=SC2046
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-https-cloudflare \
  --priority 110 --access Allow --protocol Tcp --direction Inbound \
  --source-address-prefixes $(curl -fsS https://www.cloudflare.com/ips-v4 | tr '\n' ' ') \
  --destination-port-ranges 443 -o none
ok "HTTPS from Cloudflare ranges only"

# ─── 7. Managed identity → Blob ─────────────────────────────────────
say "Managed identity RBAC"
PRINCIPAL=$(az vm identity show -g "$RG" -n "$VM" --query principalId -o tsv)
[[ -n "$PRINCIPAL" ]] || die "VM has no system-assigned identity."

if az role assignment list --assignee "$PRINCIPAL" --scope "$SCOPE" \
     --query "[?roleDefinitionName=='Storage Blob Data Contributor']" -o tsv | grep -q .; then
  skip "already has Storage Blob Data Contributor"
else
  az role assignment create --assignee "$PRINCIPAL" \
    --role "Storage Blob Data Contributor" --scope "$SCOPE" -o none
  ok "VM can write and delete inside $CONTAINER, and nowhere else"
fi

# ─── 8. Service principal for Vercel ────────────────────────────────
say "Vercel service principal (read-only)"
EXISTING_SP=$(az ad sp list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)
if [[ -n "$EXISTING_SP" && "$EXISTING_SP" != "None" ]]; then
  skip "$SP_NAME already exists (appId $EXISTING_SP)"
  printf '    \033[0;33mIts password was shown only at creation. If you do not have it,\n'
  printf '    reset with: az ad sp credential reset --id %s\033[0m\n' "$EXISTING_SP"
  SP_APP_ID="$EXISTING_SP"; SP_PASSWORD="<unchanged — you already have it>"
else
  SP_JSON=$(az ad sp create-for-rbac --name "$SP_NAME" \
    --role "Storage Blob Data Reader" --scopes "$SCOPE" -o json)
  SP_APP_ID=$(jq -r .appId    <<<"$SP_JSON")
  SP_PASSWORD=$(jq -r .password <<<"$SP_JSON")
  ok "created $SP_NAME"
fi

# ─── 9. Spend alert ─────────────────────────────────────────────────
# Catches a misconfiguration (e.g. an NSG rule opened wide, driving egress
# costs) or a forgotten resource before it becomes a surprise bill, rather
# than after. Free to configure — this only sets up alerting, not spend.
say "Spend alert"
if [[ -z "$BUDGET_ALERT_EMAIL" ]]; then
  skip "BUDGET_ALERT_EMAIL not set — skipping (set it and re-run to enable)"
else
  AG_NAME="foundry-budget-alert"
  if az monitor action-group show -g "$RG" -n "$AG_NAME" -o none 2>/dev/null; then
    skip "action group $AG_NAME already exists"
  else
    az monitor action-group create -g "$RG" -n "$AG_NAME" --short-name foundrybud \
      --action email president "$BUDGET_ALERT_EMAIL" -o none
    ok "action group → $BUDGET_ALERT_EMAIL"
  fi
  AG_ID=$(az monitor action-group show -g "$RG" -n "$AG_NAME" --query id -o tsv)

  BUDGET_NAME="foundry-monthly-budget"
  if az consumption budget show-with-rg -g "$RG" -n "$BUDGET_NAME" -o none 2>/dev/null; then
    skip "budget $BUDGET_NAME already exists"
  else
    TIME_PERIOD=$(mktemp)
    cat > "$TIME_PERIOD" <<JSON
{"startDate":"$(date -u +%Y-%m-01)","endDate":"2099-12-31"}
JSON
    NOTIFICATIONS=$(mktemp)
    cat > "$NOTIFICATIONS" <<JSON
{"Actual_GreaterThan_80":{"enabled":true,"operator":"GreaterThan","threshold":80,"contactGroups":["$AG_ID"],"thresholdType":"Actual"},
"Actual_GreaterThan_100":{"enabled":true,"operator":"GreaterThan","threshold":100,"contactGroups":["$AG_ID"],"thresholdType":"Actual"}}
JSON
    az consumption budget create-with-rg \
      -g "$RG" -n "$BUDGET_NAME" \
      --amount "$BUDGET_AMOUNT" --category Cost --time-grain Monthly \
      --time-period @"$TIME_PERIOD" \
      --notifications @"$NOTIFICATIONS" \
      -o none
    rm -f "$TIME_PERIOD" "$NOTIFICATIONS"
    ok "budget \$$BUDGET_AMOUNT/mo, alerts at 80% and 100% → $BUDGET_ALERT_EMAIL"
  fi
fi

# ─── Done ───────────────────────────────────────────────────────────
cat <<EOF

╭──────────────────────────────────────────────────────────────────────╮
│  Provisioned. Next: bootstrap the VM, then set these in Vercel.       │
╰──────────────────────────────────────────────────────────────────────╯

  VM public IP           $VM_IP
  ssh                    ssh azureuser@$VM_IP

Vercel environment variables (Production, Preview, Development):

  AZURE_STORAGE_ACCOUNT  $SA
  AZURE_BLOB_CONTAINER   $CONTAINER
  AZURE_TENANT_ID        $TENANT
  AZURE_CLIENT_ID        $SP_APP_ID
  AZURE_CLIENT_SECRET    $SP_PASSWORD
  UPLOAD_GATEWAY_URL     https://api.imperialentrepreneurs.com

  UPLOAD_TICKET_SECRET   (generated on the VM by bootstrap.sh)
  GATEWAY_SERVICE_TOKEN  (generated on the VM by bootstrap.sh)

Next:
  1.  infra/deploy.sh $VM_IP --bootstrap     set up and deploy the gateway
  2.  Cloudflare → DNS → A record 'api' → $VM_IP, PROXIED (orange cloud)
  3.  Cloudflare → SSL/TLS → Full (strict)

EOF
