const storageKey = "lv-portal-invitation";
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
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ token: incoming, expires: Date.now() + 7 * 86400000 }),
      );
    } catch {
      /* This tab can still accept without persistence. */
    }
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    return incoming;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (saved?.expires > Date.now() && validInviteToken(saved.token))
      return saved.token;
  } catch {
    /* Invalid or unavailable tab storage. */
  }
  return "";
}
export function clearPortalInvitation() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Tab storage may be disabled. */
  }
}
