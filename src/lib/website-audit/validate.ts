import { isBlockedIpv4, isBlockedIpv6, parseIpv4 } from "../../../supabase/functions/_shared/website-audit/network.ts";

const LOCAL_HOSTS = /(^|\.)(localhost|local|internal|home|lan)$/i;

export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: "required" | "invalid" | "publicOnly" };

export function normalizePublicUrl(value: string): UrlValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "required" };
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    return { ok: false, reason: "publicOnly" };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const blockedIp = parseIpv4(hostname) ? isBlockedIpv4(hostname) : hostname.includes(":") && isBlockedIpv6(hostname);
  if (LOCAL_HOSTS.test(hostname) || blockedIp) {
    return { ok: false, reason: "publicOnly" };
  }
  if (!hostname.includes(".") && !hostname.includes(":")) return { ok: false, reason: "invalid" };
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}
