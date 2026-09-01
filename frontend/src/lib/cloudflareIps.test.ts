import { describe, it, expect } from "vitest";
import { isCloudflareIp } from "./cloudflareIps";

describe("isCloudflareIp", () => {
  it("matches an IPv4 address inside a published range", () => {
    expect(isCloudflareIp("173.245.48.1")).toBe(true); // 173.245.48.0/20
    expect(isCloudflareIp("104.16.0.1")).toBe(true); // 104.16.0.0/13
    expect(isCloudflareIp("104.23.255.255")).toBe(true); // still inside 104.16.0.0/13
  });

  it("rejects an IPv4 address just outside a published range", () => {
    // 104.16.0.0/13 spans 104.16.0.0-104.23.255.255, and the separate
    // 104.24.0.0/14 block spans 104.24.0.0-104.27.255.255 — both real
    // Cloudflare ranges. 104.28.0.1 sits just past both.
    expect(isCloudflareIp("104.23.255.255")).toBe(true);
    expect(isCloudflareIp("104.28.0.1")).toBe(false);
  });

  it("rejects an ordinary public IPv4 address", () => {
    expect(isCloudflareIp("8.8.8.8")).toBe(false);
    expect(isCloudflareIp("1.2.3.4")).toBe(false);
  });

  it("matches an IPv6 address inside a published range", () => {
    expect(isCloudflareIp("2606:4700::1")).toBe(true);
    expect(isCloudflareIp("2606:4700:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
  });

  it("rejects an ordinary public IPv6 address", () => {
    expect(isCloudflareIp("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("rejects malformed input rather than throwing", () => {
    expect(isCloudflareIp("not-an-ip")).toBe(false);
    expect(isCloudflareIp("")).toBe(false);
    expect(isCloudflareIp("999.999.999.999")).toBe(false);
  });
});
