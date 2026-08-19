import { describe, expect, it } from "vitest";
import { isBlockedIpv4, isBlockedIpv6 } from "../../../supabase/functions/_shared/website-audit/network.ts";

describe("website audit network destination classification", () => {
  it.each(["127.0.0.1", "10.0.0.4", "169.254.169.254", "172.16.1.2", "192.168.1.1", "203.0.113.5"])("blocks special IPv4 %s", (address) => {
    expect(isBlockedIpv4(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1"])("allows public IPv4 %s", (address) => {
    expect(isBlockedIpv4(address)).toBe(false);
  });

  it.each(["::1", "fc00::1", "fe00::1", "fe80::1", "4000::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::"])("blocks special, unallocated, or translated IPv6 %s", (address) => {
    expect(isBlockedIpv6(address)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"])("allows public IPv6 %s", (address) => {
    expect(isBlockedIpv6(address)).toBe(false);
  });
});
