import "server-only";
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  generateBlobSASQueryParameters,
  type UserDelegationKey,
} from "@azure/storage-blob";
import { ClientSecretCredential } from "@azure/identity";

// ════════════════════════════════════════════════════════════════════
// Foundry · Reading post images out of Azure Blob
//
// The container is PRIVATE, and that is a compliance decision rather than
// a preference. If it were public-read, every image URL would be a
// permanent unauthenticated link: the members-only, noindex feed would
// leak to anyone who ever saw a URL, and a deleted post's image would
// stay fetchable forever — so "we deleted it" would not be true in the
// way an erasure request requires.
//
// So reads go through short-expiry user-delegation SAS, minted here at
// render time and never stored. A stored SAS URL would be stale within
// the hour anyway, which is why post_images holds the container-relative
// key and nothing else.
//
// CREDENTIAL SEPARATION. This process holds a service principal scoped to
// `Storage Blob Data Reader` on one container. It cannot write and it
// cannot delete — only the gateway can, using the VM's managed identity.
// Neither holds the storage account key, which Azure cannot scope to a
// container at all. Shared-key access is disabled on the account, so a
// leaked connection string is not a thing that can exist here.
//
// Minting is local: one cached network call for the delegation key, then
// pure HMAC per URL. A feed page with 40 images costs 40 signatures and
// zero requests to Azure.
// ════════════════════════════════════════════════════════════════════

const SAS_TTL_MINUTES = 60;

// The delegation key is valid for up to 7 days. Holding one for a day and
// refreshing at the 12-hour mark means the fetch essentially never lands
// on a user request, and a clock skew or a slow refresh cannot produce a
// key that is already expired.
const KEY_TTL_HOURS = 24;
const KEY_REFRESH_AFTER_HOURS = 12;

type Config = {
  account: string;
  container: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

function config(): Config | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const container = process.env.AZURE_BLOB_CONTAINER;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!account || !container || !tenantId || !clientId || !clientSecret) return null;
  return { account, container, tenantId, clientId, clientSecret };
}

/** True when image reads are configured. Unset in local dev and CI, where
 *  the feed still works and image slots render a placeholder. */
export function blobReadEnabled(): boolean {
  return config() !== null;
}

let clientCache: BlobServiceClient | null = null;

function serviceClient(cfg: Config): BlobServiceClient {
  if (!clientCache) {
    const credential = new ClientSecretCredential(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    clientCache = new BlobServiceClient(`https://${cfg.account}.blob.core.windows.net`, credential);
  }
  return clientCache;
}

let keyCache: { key: UserDelegationKey; refreshAfter: number } | null = null;

async function delegationKey(cfg: Config): Promise<UserDelegationKey> {
  const now = Date.now();
  if (keyCache && now < keyCache.refreshAfter) return keyCache.key;

  const startsOn = new Date(now - 5 * 60 * 1000); // clock-skew allowance
  const expiresOn = new Date(now + KEY_TTL_HOURS * 3600 * 1000);
  const key = await serviceClient(cfg).getUserDelegationKey(startsOn, expiresOn);

  keyCache = { key, refreshAfter: now + KEY_REFRESH_AFTER_HOURS * 3600 * 1000 };
  return key;
}

/**
 * Read URLs for a batch of blob keys, in the same order.
 *
 * Batched rather than per-key so one page render fetches the delegation
 * key at most once. Returns null in a slot the URL could not be minted
 * for — a broken image is a bad card, not a broken page, and the feed
 * must render even when storage is unreachable.
 */
export async function signedImageUrls(keys: string[]): Promise<(string | null)[]> {
  if (keys.length === 0) return [];

  const cfg = config();
  if (!cfg) return keys.map(() => null);

  let key: UserDelegationKey;
  try {
    key = await delegationKey(cfg);
  } catch (e) {
    // Logged, not thrown. Storage being unreachable degrades the feed to
    // text; it does not take the page down.
    console.error("Failed to obtain an Azure user delegation key:", e);
    return keys.map(() => null);
  }

  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + SAS_TTL_MINUTES * 60 * 1000);

  return keys.map((blobKey) => {
    try {
      const sas = generateBlobSASQueryParameters(
        {
          containerName: cfg.container,
          blobName: blobKey,
          permissions: BlobSASPermissions.parse("r"), // read, and only read
          protocol: SASProtocol.Https,
          startsOn,
          expiresOn,
        },
        key,
        cfg.account,
      ).toString();

      return `https://${cfg.account}.blob.core.windows.net/${cfg.container}/${blobKey}?${sas}`;
    } catch (e) {
      console.error(`Failed to sign a read URL for ${blobKey}:`, e);
      return null;
    }
  });
}

/**
 * Confirm blobs actually exist before a post is allowed to reference them.
 *
 * The database knows a ticket was ISSUED; it cannot know whether bytes
 * were ever written. Without this check a client could submit a key it
 * never uploaded to and create a post with a permanently broken image.
 * This process already holds read access, so the check is cheap and needs
 * no new credential — and it deliberately does not give the gateway a
 * database connection to solve the same problem.
 */
export async function blobsExist(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;

  const cfg = config();
  // Unconfigured means local dev or CI, where uploads cannot have happened
  // at all. Refusing here would block the composer in exactly the
  // environments used to test it.
  if (!cfg) return true;

  try {
    const container = serviceClient(cfg).getContainerClient(cfg.container);
    const results = await Promise.all(
      keys.map((k) => container.getBlockBlobClient(k).exists()),
    );
    return results.every(Boolean);
  } catch (e) {
    console.error("Failed to verify uploaded blobs:", e);
    return false;
  }
}

/** The origin the CSP must allow in `img-src`. Null when unconfigured. */
export function blobOrigin(): string | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  return account ? `https://${account}.blob.core.windows.net` : null;
}
