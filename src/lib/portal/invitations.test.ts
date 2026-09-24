import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearPortalInvitation,
  portalInvitationUrl,
  readPortalInvitation,
  safePortalReturn,
  validInviteToken,
} from "./invitations";

/** A storage that behaves like the real one, or refuses like a blocked one. */
function fakeStorage(blocked = false): Storage {
  const items = new Map<string, string>();
  const refuse = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => (blocked ? refuse() : items.get(key) ?? null),
    setItem: (key: string, value: string) => {
      if (blocked) refuse();
      items.set(key, value);
    },
    removeItem: (key: string) => {
      if (blocked) refuse();
      items.delete(key);
    },
    clear: () => items.clear(),
  } as Storage;
}

/** Puts a browser on the invitation URL with the two stores it would have. */
function browserAt(hash: string, local: Storage, session: Storage) {
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", {
    location: { hash, pathname: "/portal-invite", search: "" },
    history: { state: null, replaceState: () => {} },
  });
}
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

describe("carrying an invitation through the sign-in round trip", () => {
  const token = "a".repeat(64);
  afterEach(() => vi.unstubAllGlobals());

  /**
   * The failure a new ambassador hit: the sign-in link arrives by email and the
   * mail client opens it in a new tab, so a token kept only in that first tab is
   * gone by the time there is a session to accept with.
   */
  it("survives into the new tab the sign-in link opens", () => {
    const shared = fakeStorage();
    browserAt(`#invite=${token}`, shared, fakeStorage());
    expect(readPortalInvitation()).toBe(token);

    // The mail client's tab: same browser, its own sessionStorage.
    browserAt("", shared, fakeStorage());
    expect(readPortalInvitation()).toBe(token);
  });

  it("still works in one tab when the browser refuses shared storage", () => {
    const tab = fakeStorage();
    browserAt(`#invite=${token}`, fakeStorage(true), tab);
    expect(readPortalInvitation()).toBe(token);
    browserAt("", fakeStorage(true), tab);
    expect(readPortalInvitation()).toBe(token);
  });

  it("forgets the token everywhere once it is redeemed", () => {
    const shared = fakeStorage();
    const tab = fakeStorage();
    browserAt(`#invite=${token}`, shared, tab);
    readPortalInvitation();
    clearPortalInvitation();
    browserAt("", shared, fakeStorage());
    expect(readPortalInvitation()).toBe("");
  });

  it("ignores a stored token that has outlived the invitation", () => {
    const shared = fakeStorage();
    shared.setItem(
      "lv-portal-invitation",
      JSON.stringify({ token, expires: Date.now() - 1000 }),
    );
    browserAt("", shared, fakeStorage());
    expect(readPortalInvitation()).toBe("");
  });
});
