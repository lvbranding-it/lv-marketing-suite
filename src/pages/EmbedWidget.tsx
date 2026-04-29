/**
 * EmbedWidget — /embed/:slug
 * Public, iframe-friendly live results widget.
 * No auth required. Auto-refreshes every 30 seconds.
 * Fully inline-styled so it works standalone inside any client iframe.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

// Lightweight standalone Supabase client (anon key — public read only)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
);

interface ContestRow {
  id: string;
  title: string;
  brand_color: string | null;
  brand_accent: string | null;
  results_public: boolean;
  status: string;
  winner_contestant_id: string | null;
}

interface ContestantRow {
  id: string;
  name: string;
  photo_url: string | null;
  display_order: number;
  vote_count: number;
}

interface VoteCountRow {
  contestant_id: string;
  vote_count: number | string;
}

export default function EmbedWidget() {
  const { slug } = useParams<{ slug: string }>();

  const [contest, setContest] = useState<ContestRow | null>(null);
  const [contestants, setContestants] = useState<ContestantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;

    // ── Fetch contest by slug ───────────────────────────────────────────────
    const { data: c, error: cErr } = await supabase
      .from("contests")
      .select("id, title, brand_color, brand_accent, results_public, status, winner_contestant_id")
      .eq("slug", slug)
      .single();

    if (cErr || !c) {
      setError("Contest not found");
      setLoading(false);
      return;
    }

    setContest(c);

    const canShowResults = c.results_public || c.status === "closed" || c.status === "winner_announced";

    if (!canShowResults) {
      setLoading(false);
      return;
    }

    // ── Fetch contestants ──────────────────────────────────────────────────
    const { data: cs } = await supabase
      .from("contestants")
      .select("id, name, photo_url, display_order")
      .eq("contest_id", c.id)
      .order("display_order");

    if (!cs) {
      setLoading(false);
      return;
    }

    // ── Fetch aggregate verified vote counts ───────────────────────────────
    const { data: votes } = await supabase
      .rpc("get_contest_vote_counts", { _contest_id: c.id });

    const counts: Record<string, number> = {};
    (votes as VoteCountRow[] | null)?.forEach((v) => {
      counts[v.contestant_id] = Number(v.vote_count ?? 0);
    });

    const withCounts: ContestantRow[] = cs
      .map((x) => ({ ...x, vote_count: counts[x.id] ?? 0 }))
      .sort((a, b) => b.vote_count - a.vote_count);

    setContestants(withCounts);
    setTotal(withCounts.reduce((s, x) => s + x.vote_count, 0));
    setLastUpdated(new Date());
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const brand   = contest?.brand_color  ?? "#CB2039";
  const accent  = contest?.brand_accent ?? "#1A1A2E";

  const timeAgo = lastUpdated
    ? `Updated ${Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s ago`
    : "";

  // ── Render states ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.root(accent)}>
        <div style={styles.loading}>Loading results…</div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div style={styles.root(accent)}>
        <div style={styles.errorMsg}>{error ?? "Contest not found."}</div>
      </div>
    );
  }

  if (!contest.results_public && contest.status !== "closed" && contest.status !== "winner_announced") {
    return (
      <div style={styles.root(accent)}>
        <div style={styles.errorMsg}>Results for this contest are not public yet.</div>
      </div>
    );
  }

  const isWinnerAnnounced = contest.status === "winner_announced";

  return (
    <div style={styles.root(accent)}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.trophy}>🏆</span>
        <h2 style={styles.title(brand)}>{contest.title}</h2>
      </div>

      {isWinnerAnnounced && contest.winner_contestant_id && (
        <div style={styles.winnerBanner(brand)}>
          👑 Winner announced!
        </div>
      )}

      {/* Leaderboard */}
      {contestants.length === 0 ? (
        <p style={styles.empty}>No contestants yet.</p>
      ) : (
        <div style={styles.list}>
          {contestants.map((c, i) => {
            const pct       = total > 0 ? Math.round((c.vote_count / total) * 100) : 0;
            const isWinner  = c.id === contest.winner_contestant_id;
            const isFirst   = i === 0;

            return (
              <div key={c.id} style={styles.row(isWinner, brand)}>
                {/* Rank + photo */}
                <div style={styles.left}>
                  <span style={styles.rank(isFirst, brand)}>
                    {isWinner ? "👑" : `#${i + 1}`}
                  </span>
                  {c.photo_url && (
                    <img
                      src={c.photo_url}
                      alt={c.name}
                      style={styles.photo}
                    />
                  )}
                  <span style={styles.name(isWinner)}>{c.name}</span>
                </div>

                {/* Bar + pct */}
                <div style={styles.barWrap}>
                  <div style={styles.barTrack}>
                    <div style={styles.barFill(pct, brand)} />
                  </div>
                  <span style={styles.pct(brand)}>{pct}%</span>
                  <span style={styles.votes}>{c.vote_count.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span>{total.toLocaleString()} vote{total !== 1 ? "s" : ""}</span>
        {timeAgo && <span style={styles.timeAgo}>{timeAgo}</span>}
        <span>
          Powered by{" "}
          <a
            href="https://www.lvbranding.com"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.footerLink(brand)}
          >
            LV Branding
          </a>
        </span>
      </div>
    </div>
  );
}

// ── Inline style helpers (keeps this self-contained for iframe use) ────────

const styles = {
  root: (accent: string) =>
    ({
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      background: "#ffffff",
      border: `1px solid ${accent}22`,
      borderRadius: "12px",
      padding: "16px",
      minWidth: "240px",
      maxWidth: "100%",
      boxSizing: "border-box",
      color: "#111827",
    } as React.CSSProperties),

  loading: {
    textAlign: "center" as const,
    color: "#6B7280",
    fontSize: "13px",
    padding: "24px 0",
  },

  errorMsg: {
    textAlign: "center" as const,
    color: "#9CA3AF",
    fontSize: "13px",
    padding: "24px 0",
  },

  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },

  trophy: {
    fontSize: "18px",
    lineHeight: 1,
  },

  title: (brand: string) =>
    ({
      margin: 0,
      fontSize: "15px",
      fontWeight: 700,
      color: brand,
      lineHeight: 1.3,
    } as React.CSSProperties),

  winnerBanner: (brand: string) =>
    ({
      background: `${brand}15`,
      color: brand,
      borderRadius: "8px",
      padding: "8px 12px",
      fontSize: "13px",
      fontWeight: 600,
      marginBottom: "12px",
      textAlign: "center" as const,
    } as React.CSSProperties),

  empty: {
    textAlign: "center" as const,
    color: "#9CA3AF",
    fontSize: "13px",
    margin: "16px 0",
  },

  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  },

  row: (isWinner: boolean, brand: string) =>
    ({
      background: isWinner ? `${brand}08` : "#F9FAFB",
      borderRadius: "8px",
      padding: "10px 12px",
      border: isWinner ? `1px solid ${brand}30` : "1px solid #E5E7EB",
    } as React.CSSProperties),

  left: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
  },

  rank: (isFirst: boolean, brand: string) =>
    ({
      fontSize: isFirst ? "14px" : "12px",
      fontWeight: 700,
      color: isFirst ? brand : "#6B7280",
      minWidth: "22px",
    } as React.CSSProperties),

  photo: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    objectFit: "cover" as const,
    border: "1px solid #E5E7EB",
    flexShrink: 0,
  } as React.CSSProperties,

  name: (isWinner: boolean) =>
    ({
      fontSize: "13px",
      fontWeight: isWinner ? 700 : 500,
      color: "#111827",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    } as React.CSSProperties),

  barWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  barTrack: {
    flex: 1,
    background: "#E5E7EB",
    borderRadius: "4px",
    height: "8px",
    overflow: "hidden",
  } as React.CSSProperties,

  barFill: (pct: number, brand: string) =>
    ({
      width: `${pct}%`,
      height: "100%",
      background: brand,
      borderRadius: "4px",
      transition: "width 0.6s ease",
    } as React.CSSProperties),

  pct: (brand: string) =>
    ({
      fontSize: "12px",
      fontWeight: 700,
      color: brand,
      minWidth: "34px",
      textAlign: "right" as const,
    } as React.CSSProperties),

  votes: {
    fontSize: "11px",
    color: "#9CA3AF",
    minWidth: "28px",
    textAlign: "right" as const,
  } as React.CSSProperties,

  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "12px",
    paddingTop: "10px",
    borderTop: "1px solid #F3F4F6",
    fontSize: "11px",
    color: "#9CA3AF",
    flexWrap: "wrap" as const,
    gap: "4px",
  },

  timeAgo: {
    color: "#D1D5DB",
  } as React.CSSProperties,

  footerLink: (brand: string) =>
    ({
      color: brand,
      textDecoration: "none",
      fontWeight: 600,
    } as React.CSSProperties),
};
