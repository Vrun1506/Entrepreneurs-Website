// ════════════════════════════════════════════════════════════════════
// Foundry · Is this connection actually from Cloudflare's edge?
//
// ratelimit.ts's clientIp() used to trust the `cf-connecting-ip` header
// unconditionally, on the assumption that Cloudflare is the only way in
// and therefore always sets (and overwrites) that header itself. That
// assumption doesn't hold: Vercel always keeps a project's default
// `<project>.vercel.app` domain live and publicly reachable alongside
// the custom domain, and it is NOT behind Cloudflare. Anyone hitting the
// app directly through that domain can set `cf-connecting-ip` to
// whatever they like — a different value on every request — and
// completely defeat the IP-keyed rate-limit buckets.
//
// The fix: only trust `cf-connecting-ip` when the request's actual,
// non-spoofable connecting peer (the last hop of x-forwarded-for, which
// Vercel's edge appends itself — see clientIp()'s own comment) is one of
// Cloudflare's own published IP ranges. Anyone connecting to Vercel
// directly, from any other IP, gets no benefit from setting the header.
//
// Source: https://www.cloudflare.com/ips/ (checked 2026-09-01). This
// list changes very rarely — Cloudflare announces changes in advance —
// so a periodic manual re-check is enough; it does not need a runtime
// fetch, which would just add an external dependency and cold-start
// latency to a security check for a handful of CIDR blocks that are
// effectively static.
// ════════════════════════════════════════════════════════════════════

const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_IPV6_CIDRS = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range!);
  if (ipInt === null || rangeInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Expands an IPv6 address (with at most one "::" run) to 8 hex groups. */
function expandIpv6Groups(ip: string): string[] | null {
  if (ip.includes(".")) return null; // no IPv4-mapped forms in Cloudflare's ranges
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }

  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return groups;
}

// BigInt() calls rather than `0n`/`128n` literals — this project's tsconfig
// targets ES2017, which allows the BigInt runtime type but not literal syntax.
function ipv6ToBigInt(ip: string): bigint | null {
  const groups = expandIpv6Groups(ip);
  if (!groups) return null;
  let result = BigInt(0);
  for (const g of groups) result = (result << BigInt(16)) | BigInt(parseInt(g, 16));
  return result;
}

function isIpv6InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = BigInt(Number(bitsStr));
  const ipBig = ipv6ToBigInt(ip);
  const rangeBig = ipv6ToBigInt(range!);
  if (ipBig === null || rangeBig === null) return false;
  const hostBits = BigInt(128) - bits;
  const fullMask = (BigInt(1) << BigInt(128)) - BigInt(1);
  const mask = hostBits === BigInt(0) ? fullMask : (fullMask << hostBits) & fullMask;
  return (ipBig & mask) === (rangeBig & mask);
}

/** True when `ip` falls inside one of Cloudflare's published ranges. */
export function isCloudflareIp(ip: string): boolean {
  if (ip.includes(":")) return CLOUDFLARE_IPV6_CIDRS.some((cidr) => isIpv6InCidr(ip, cidr));
  return CLOUDFLARE_IPV4_CIDRS.some((cidr) => isIpv4InCidr(ip, cidr));
}
