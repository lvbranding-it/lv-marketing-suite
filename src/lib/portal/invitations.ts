const storageKey = "lv-portal-invitation";

/**
 * Where a pending invitation waits while the invited person signs in.
 *
 * It used to wait in sessionStorage, which is scoped to a single tab. But the
 * sign-in link arrives by email, and a mail client opens it in a *new* tab — so
 * the tab that ended up holding a signed-in session was never the tab holding
 * the token. A genuinely new ambassador was therefore told to "return to the tab
 * with your invitation" instead of being let in, and the only people who ever
 * got through were the ones already signed in when they clicked, who never made
 * the round trip at all.
 *
 * localStorage is shared across the tabs of one browser, which is exactly the
 * span that round trip needs. Keeping the token there is sound because it is not
 * a credential on its own: accepting also requires being signed in as the
 * invited address with a confirmed email, so possession of the token without the
 * mailbox gets nobody in. It is single-use, expires with the invitation, and is
 * cleared the moment it is redeemed.
 *
 * sessionStorage stays alongside it for a browser that refuses localStorage —
 * Safari with website data blocked throws on the write — where a single-tab
 * accept is still better than none.
 */
function invitationStores(): Storage[] {
  const found: Storage[] = [];
  for (const open of [() => localStorage, () => sessionStorage]) {
    try {
      const store = open();
      store.getItem(storageKey);
      found.push(store);
    } catch {
      /* This browser refuses that store; try the other one. */
    }
  }
  return found;
}
export function validInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
export function portalInvitationUrl(origin: string, token: string) {
  if (!validInviteToken(token)) throw new Error("Invalid invitation");
  return `${origin}/portal-invite#invite=${token}`;
}
export function safePortalReturn(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://portal.invalid");
    if (url.origin !== "https://portal.invalid" || url.hash) return null;
    if (url.pathname === "/portal-invite" && !url.search)
      return "/portal-invite";
    if (url.pathname === "/portal") {
      const org = url.searchParams.get("org");
      if ([...url.searchParams.keys()].some((k) => k !== "org")) return null;
      if (org && !/^[a-f0-9-]{36}$/i.test(org)) return null;
      return org ? `/portal?org=${org}` : "/portal";
    }
  } catch {
    /* Ignore unsafe destinations. */
  }
  return null;
}
export function readPortalInvitation(): string {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const incoming = fragment.get("invite");
  if (validInviteToken(incoming)) {
    const record = JSON.stringify({
      token: incoming,
      expires: Date.now() + 7 * 86400000,
    });
    for (const store of invitationStores()) {
      try {
        store.setItem(storageKey, record);
      } catch {
        /* This tab can still accept without persistence. */
      }
    }
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    return incoming;
  }
  for (const store of invitationStores()) {
    try {
      const saved = JSON.parse(store.getItem(storageKey) ?? "null");
      if (saved?.expires > Date.now() && validInviteToken(saved.token))
        return saved.token;
    } catch {
      /* Invalid or unavailable storage; try the other one. */
    }
  }
  return "";
}
export function clearPortalInvitation() {
  for (const store of invitationStores()) {
    try {
      store.removeItem(storageKey);
    } catch {
      /* Storage may be disabled. */
    }
  }
}
