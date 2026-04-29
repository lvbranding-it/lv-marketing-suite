/**
 * EmbedWidget — /embed/:slug
 * Public, iframe-friendly live results widget.
 * No auth required. Auto-refreshes every 30 seconds.
 * Fully inline-styled so it works standalone inside any client iframe.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

// Lightweight standalone Supabase client (anon key — public read only)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
);
const CONTEST_PHOTOS_BUCKET = "contest-photos";

function normalizeContestPhotoUrl(url: string | null | undefined) {
  if (!url) return url ?? null;
  return url.replace(
    `/storage/v1/object/${CONTEST_PHOTOS_BUCKET}/`,
    `/storage/v1/object/public/${CONTEST_PHOTOS_BUCKET}/`
  );
}

interface ContestRow {
  id: string;
  title: string;
  description: string | null;
  voting_instructions: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
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
  const [searchParams] = useSearchParams();
  const compact = searchParams.get("layout") === "compact";
  const showEventInfo = searchParams.get("info") !== "false";
  const showPhotos = searchParams.get("photos") !== "false";
  const showBranding = searchParams.get("branding") !== "false";
  const transparent = searchParams.get("bg") === "transparent";

  const [contest, setContest] = useState<ContestRow | null>(null);
  const [contestants, setContestants] = useState<ContestantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setError(null);

    // ── Fetch contest by slug ───────────────────────────────────────────────
    const { data: c, error: cErr } = await supabase
      .from("contests")
      .select("id, title, description, voting_instructions, client_name, client_logo_url, brand_color, brand_accent, voting_opens_at, voting_closes_at, results_public, status, winner_contestant_id")
      .eq("slug", slug)
      .single();

    if (cErr || !c) {
      setError("Contest not found");
      setLoading(false);
      return;
    }

    setContest({
      ...c,
      client_logo_url: normalizeContestPhotoUrl(c.client_logo_url),
    });
    setLastUpdated(new Date());

    const canShowResults = c.results_public || c.status === "closed" || c.status === "winner_announced";

    if (!canShowResults) {
      setContestants([]);
      setTotal(0);
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
      .map((x) => ({ ...x, photo_url: normalizeContestPhotoUrl(x.photo_url), vote_count: counts[x.id] ?? 0 }))
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

  useEffect(() => {
    const sendHeight = () => {
      const cardHeight = cardRef.current?.getBoundingClientRect().height;
      window.parent?.postMessage(
        {
          type: "lv-contest-widget-height",
          slug,
          height: Math.ceil((cardHeight ?? document.body.scrollHeight) + 2),
        },
        "*"
      );
    };

    sendHeight();
    const timeout = window.setTimeout(sendHeight, 150);
    window.addEventListener("resize", sendHeight);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", sendHeight);
    };
  }, [slug, contest, contestants, total, loading, error, compact, showEventInfo, showPhotos, showBranding]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const brand   = contest?.brand_color  ?? "#CB2039";
  const accent  = contest?.brand_accent ?? "#1A1A2E";

  const timeAgo = lastUpdated
    ? `Updated ${Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s ago`
    : "";
  const statusLabel =
    contest?.status === "winner_announced" ? "Winner Announced" :
    contest?.status === "closed" ? "Voting Closed" :
    contest?.status === "active" ? "Voting Open" :
    "Draft";

  // ── Render states ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div ref={cardRef} style={styles.root(accent, transparent)}>
        <div style={styles.loading}>Loading results…</div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div ref={cardRef} style={styles.root(accent, transparent)}>
        <div style={styles.errorMsg}>{error ?? "Contest not found."}</div>
      </div>
    );
  }

  if (!contest.results_public && contest.status !== "closed" && contest.status !== "winner_announced") {
    return (
      <div ref={cardRef} style={styles.root(accent, transparent)}>
        {showEventInfo && (
          <div style={styles.eventBlock(compact)}>
            {contest.client_logo_url && <img src={contest.client_logo_url} alt={contest.client_name ?? ""} style={styles.logo(compact)} />}
            <h2 style={styles.eventTitle(brand)}>{contest.title}</h2>
            {contest.description && <p style={styles.description}>{contest.description}</p>}
          </div>
        )}
        <div style={styles.errorMsg}>Results for this contest are not public yet.</div>
      </div>
    );
  }

  const isWinnerAnnounced = contest.status === "winner_announced";

  return (
    <div ref={cardRef} style={styles.root(accent, transparent)}>
      {/* Header */}
      {showEventInfo && (
        <div style={styles.eventBlock(compact)}>
          {contest.client_logo_url && <img src={contest.client_logo_url} alt={contest.client_name ?? ""} style={styles.logo(compact)} />}
          <div style={styles.statusLine}>
            <span style={styles.statusBadge(brand)}>{statusLabel}</span>
            {contest.client_name && <span style={styles.clientName}>{contest.client_name}</span>}
          </div>
          <h2 style={styles.eventTitle(brand)}>{contest.title}</h2>
          {contest.description && <p style={styles.description}>{contest.description}</p>}
          {contest.voting_instructions && <p style={styles.instructions}>{contest.voting_instructions}</p>}
        </div>
      )}

      <div style={styles.header(compact)}>
        <span style={styles.trophy}>🏆</span>
        <h3 style={styles.title(brand)}>Leaderboard</h3>
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
              <div key={c.id} style={styles.row(isWinner, brand, compact)}>
                {/* Rank + photo */}
                <div style={styles.left}>
                  <span style={styles.rank(isFirst, brand)}>
                    {isWinner ? "👑" : `#${i + 1}`}
                  </span>
                  {showPhotos && c.photo_url && (
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
        {showBranding && (
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
        )}
      </div>
    </div>
  );
}

// ── Inline style helpers (keeps this self-contained for iframe use) ────────

const styles = {
  root: (accent: string, transparent: boolean) =>
    ({
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      background: transparent ? "transparent" : "#ffffff",
      border: `1px solid ${accent}22`,
      borderRadius: "14px",
      padding: "16px",
      width: "100%",
      minWidth: 0,
      maxWidth: "560px",
      boxSizing: "border-box",
      color: "#111827",
      overflow: "hidden",
      margin: "0 auto",
      boxShadow: transparent ? "none" : "0 14px 34px rgba(17, 24, 39, 0.10)",
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

  eventBlock: (compact: boolean) => ({
    textAlign: "center" as const,
    marginBottom: compact ? "12px" : "16px",
    paddingBottom: compact ? "10px" : "14px",
    borderBottom: "1px solid #F3F4F6",
  } as React.CSSProperties),

  logo: (compact: boolean) => ({
    display: "block",
    maxWidth: compact ? "150px" : "220px",
    maxHeight: compact ? "52px" : "76px",
    width: "auto",
    height: "auto",
    objectFit: "contain" as const,
    margin: "0 auto 10px",
  } as React.CSSProperties),

  statusLine: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap" as const,
    marginBottom: "8px",
  },

  statusBadge: (brand: string) => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    background: `${brand}12`,
    color: brand,
    fontSize: "11px",
    fontWeight: 700,
    padding: "4px 8px",
  } as React.CSSProperties),

  clientName: {
    color: "#9CA3AF",
    fontSize: "11px",
    fontWeight: 600,
  },

  eventTitle: (brand: string) => ({
    margin: 0,
    color: brand,
    fontSize: "18px",
    fontWeight: 800,
    lineHeight: 1.25,
  } as React.CSSProperties),

  description: {
    color: "#4B5563",
    fontSize: "13px",
    lineHeight: 1.55,
    margin: "8px 0 0",
    whiteSpace: "pre-line" as const,
  },

  instructions: {
    color: "#6B7280",
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: "8px",
    fontSize: "12px",
    lineHeight: 1.55,
    margin: "10px 0 0",
    padding: "9px 10px",
    textAlign: "left" as const,
    whiteSpace: "pre-line" as const,
  },

  header: (compact: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: compact ? "8px" : "12px",
  } as React.CSSProperties),

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

  row: (isWinner: boolean, brand: string, compact: boolean) =>
    ({
      background: isWinner ? `${brand}08` : "#F9FAFB",
      borderRadius: "8px",
      padding: compact ? "8px 10px" : "10px 12px",
      border: isWinner ? `1px solid ${brand}30` : "1px solid #E5E7EB",
    } as React.CSSProperties),

  left: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
    minWidth: 0,
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
    minWidth: 0,
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
