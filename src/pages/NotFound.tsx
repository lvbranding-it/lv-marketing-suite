import { useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * Shown for any unmatched route.
 *
 * This replaced a redirect to /dashboard, which bounced every mistyped or stale
 * public URL into the login screen: a visitor who fat-fingered a service page
 * was asked to sign in to an application they have no account for, and a
 * crawler followed the same path.
 *
 * A static host cannot return a real 404 status for a client-routed path, so
 * the page states its own status and sets `noindex` instead. That is what keeps
 * unknown URLs out of search results; the status code alone was never the part
 * that mattered here.
 */
export default function NotFound() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found | LV Branding";

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);

    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Error 404
        </p>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          We could not find that page.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The link may be out of date, or the address may have a typo. Nothing is
          wrong with your account.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            href="https://www.lvbranding.com"
          >
            Go to lvbranding.com
          </a>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-bold text-foreground transition-colors hover:bg-black/[0.04]"
            to="/campaign-investment-calculator"
          >
            Try a free tool
          </Link>
        </div>

        {/* Signed-in staff land here from a stale internal link, so the way back
            into the app stays available without leading with it. */}
        <p className="mt-8 text-xs text-muted-foreground">
          Looking for the dashboard?{" "}
          <Link className="font-semibold text-primary hover:underline" to="/dashboard">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
