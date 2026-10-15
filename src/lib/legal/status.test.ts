import { describe, expect, it } from "vitest";
import { deviceName, legalStage, matchesFilter, matchesSearch } from "./status";
import { signatureReady, strokeBounds, tooSmall } from "./signature";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const later = "2026-11-14T12:00:00Z";
const earlier = "2026-10-01T12:00:00Z";

describe("legalStage", () => {
  it("reads the status, and an unsigned document past its link's date as expired", () => {
    expect(legalStage({ status: "sent", expires_at: later }, NOW)).toBe("waiting");
    expect(legalStage({ status: "viewed", expires_at: later }, NOW)).toBe("waiting");
    expect(legalStage({ status: "viewed", expires_at: earlier }, NOW)).toBe("expired");
    expect(legalStage({ status: "client_signed", expires_at: earlier }, NOW)).toBe("countersign");
    expect(legalStage({ status: "completed", expires_at: earlier }, NOW)).toBe("completed");
    expect(legalStage({ status: "voided", expires_at: later }, NOW)).toBe("voided");
  });

  it("groups expired and voided documents under one filter", () => {
    expect(matchesFilter("expired", "closed")).toBe(true);
    expect(matchesFilter("voided", "closed")).toBe(true);
    expect(matchesFilter("waiting", "closed")).toBe(false);
    expect(matchesFilter("countersign", "all")).toBe(true);
  });
});

describe("matchesSearch", () => {
  const doc = { title: "Photo Release", recipient_name: "José García", recipient_email: "jose@acme.com", company_name: "Acme Studio" };

  it("finds every word anywhere, accents ignored", () => {
    expect(matchesSearch(doc, "jose acme")).toBe(true);
    expect(matchesSearch(doc, "release garcia")).toBe(true);
    expect(matchesSearch(doc, "talent")).toBe(false);
    expect(matchesSearch(doc, "  ")).toBe(true);
  });
});

describe("signatures", () => {
  it("accepts a typed name of two letters or more and a drawn PNG", () => {
    expect(signatureReady({ type: "type", value: " A " })).toBe(false);
    expect(signatureReady({ type: "type", value: "Ana" })).toBe(true);
    expect(signatureReady({ type: "draw", value: "data:image/png;base64,AAAA" })).toBe(true);
    expect(signatureReady({ type: "draw", value: "data:image/jpeg;base64,AAAA" })).toBe(false);
    expect(signatureReady(null)).toBe(false);
  });

  it("measures what was drawn, and calls a dot too small", () => {
    expect(strokeBounds([[{ x: 10, y: 20 }, { x: 110, y: 50 }]], 5)).toEqual({ left: 5, top: 15, width: 110, height: 40 });
    expect(strokeBounds([], 5)).toBeNull();
    expect(tooSmall([[{ x: 10, y: 10 }]])).toBe(true);
    expect(tooSmall([[{ x: 10, y: 10 }, { x: 90, y: 30 }]])).toBe(false);
  });
});

describe("deviceName", () => {
  it("names the device and browser from a user agent", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Windows · Edge");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36")).toBe("Mac · Chrome");
    expect(deviceName(null)).toBe("");
  });
});
