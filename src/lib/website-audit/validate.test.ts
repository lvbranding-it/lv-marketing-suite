import { describe, expect, it } from "vitest";
import { normalizePublicUrl } from "./validate";

describe("website audit URL validation", () => {
  it("normalizes a public hostname to https", () => {
    expect(normalizePublicUrl("example.com/path")).toEqual({ ok: true, url: "https://example.com/path" });
  });

  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://10.0.0.4",
    "http://172.20.0.1",
    "http://192.168.1.20",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "https://example.com:8443",
  ])("rejects non-public or unsupported destinations: %s", (value) => {
    const result = normalizePublicUrl(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("publicOnly");
  });

  it("rejects credentials and unsupported protocols", () => {
    expect(normalizePublicUrl("ftp://example.com").ok).toBe(false);
    expect(normalizePublicUrl("https://user:pass@example.com").ok).toBe(false);
  });
});
