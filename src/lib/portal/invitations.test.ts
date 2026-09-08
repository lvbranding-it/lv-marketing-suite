import { describe, it, expect } from "vitest";
import {
  portalInvitationUrl,
  safePortalReturn,
  validInviteToken,
} from "./invitations";
describe("invitation links and sign-in destinations", () => {
  it("keeps bearer invitation tokens in a fragment, not query or path", () => {
    const token = "a".repeat(64);
    const url = new URL(portalInvitationUrl("https://example.test", token));
    expect(url.pathname).toBe("/portal-invite");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#invite=${token}`);
  });
  it.each(["", null, "a".repeat(63), "a".repeat(65), "x".repeat(64)])(
    "rejects malformed tokens",
    (token) => expect(validInviteToken(token)).toBe(false),
  );
  it.each([
    "https://evil.test/portal",
    "//evil.test/portal",
    "/\\evil.test/portal",
    "/portal#token=secret",
    "/portal?redirect=evil",
    "/settings",
    "/portal-invite?invite=secret",
  ])("rejects unsafe or unrelated sign-in destinations", (target) =>
    expect(safePortalReturn(target)).toBeNull(),
  );
  it("allows only intended local portal destinations", () => {
    expect(safePortalReturn("/portal-invite")).toBe("/portal-invite");
    expect(safePortalReturn("/portal")).toBe("/portal");
    expect(
      safePortalReturn("/portal?org=00000000-0000-4000-8000-000000000001"),
    ).toContain("/portal?org=");
  });
});
