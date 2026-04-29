import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Clock, Trophy, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LVLogo from "@/components/LVLogo";
import { useContestBySlug, useContestants, useVoteCounts } from "@/hooks/useContests";
import { cn } from "@/lib/utils";

// ── Verify page (email link landing) ─────────────────────────────────────────

function VerifyPage({ slug }: { slug: string }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [contestantName, setContestantName] = useState("");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); setErrMsg("Missing verification token."); return; }
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contest-verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ token }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Verification failed");
        setContestantName(data.contestant_name);
        setState("success");
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : "Verification failed");
        setState("error");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        {state === "loading" && (
          <>
            <Loader2 size={36} className="animate-spin text-rose-500 mx-auto mb-4" />
            <p className="text-gray-500">Confirming your vote…</p>
          </>
        )}
        {state === "success" && (
          <>
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={44} className="text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Vote confirmed! 🎉</h1>
            <p className="text-gray-500 text-base">
              Your vote for <strong className="text-gray-800">{contestantName}</strong> has been counted.
            </p>
            <p className="text-gray-400 text-sm mt-3">Thank you for participating!</p>
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-300">Powered by LV Branding</p>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={44} className="text-rose-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
            <p className="text-gray-500 text-sm">{errMsg || "This link is invalid or has already been used."}</p>
            <Button className="mt-6" variant="outline" onClick={() => window.location.href = `/vote/${slug}`}>
              Back to voting
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function formatCountdown(target: Date, now: Date) {
  const remaining = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

// ── Main voting page ──────────────────────────────────────────────────────────

export default function VotingPage() {
  const { slug } = useParams<{ slug: string }>();
  const isVerify = window.location.pathname.includes("/verify");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const { data: contest, isLoading: contestLoading } = useContestBySlug(slug);
  const { data: contestants = [], isLoading: cLoading } = useContestants(contest?.id);
  const opensAt = contest?.voting_opens_at ? new Date(contest.voting_opens_at) : null;
  const closesAt = contest?.voting_closes_at ? new Date(contest.voting_closes_at) : null;
  const hasStarted = !opensAt || opensAt <= currentTime;
  const hasNotClosed = !closesAt || closesAt >= currentTime;
  const isOpen = contest?.status === "active" && hasStarted && hasNotClosed;
  const isUpcoming = contest?.status === "active" && !hasStarted;
  const isClosed = contest?.status === "closed" || contest?.status === "winner_announced" || (contest?.status === "active" && !hasNotClosed);
  const { data: counts = {} } = useVoteCounts(
    contest?.id,
    isOpen && contest?.results_public
  );

  const [selected, setSelected]   = useState<string | null>(null);
  const [email, setEmail]         = useState("");
  const [phase, setPhase]         = useState<"pick" | "email" | "pending" | "error">("pick");
  const [errMsg, setErrMsg]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isVerify && slug) return <VerifyPage slug={slug} />;

  const isLoading = contestLoading || cLoading;
  const brandColor  = contest?.brand_color  ?? "#CB2039";
  const brandAccent = contest?.brand_accent ?? "#1A1A2E";
  const totalVotes  = Object.values(counts).reduce((s, n) => s + n, 0);
  const countdownTarget = isUpcoming ? opensAt : isOpen ? closesAt : null;
  const countdownLabel = isUpcoming ? "Voting opens in" : "Voting closes in";

  const winner = contest?.winner_contestant_id
    ? contestants.find((c) => c.id === contest.winner_contestant_id)
    : null;

  const handleVote = async () => {
    if (!selected || !email.trim() || !contest) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrMsg("Please enter a valid email address."); return;
    }
    setSubmitting(true);
    setErrMsg("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contest-vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            contest_id:    contest.id,
            contestant_id: selected,
            voter_email:   trimmedEmail,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong");
      setPhase("pending");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to submit vote");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-rose-500" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Trophy size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500">Contest not found.</p>
        </div>
      </div>
    );
  }

  // ── Check email-pending state ──────────────────────────────────────────────
  if (phase === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${brandAccent}15 0%, white 50%, ${brandColor}10 100%)` }}>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-5">📬</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your inbox!</h1>
          <p className="text-gray-500 mb-2">We sent a confirmation link to <strong className="text-gray-700">{email}</strong></p>
          <p className="text-gray-400 text-sm">Click the link in the email to confirm your vote. It expires in 24 hours.</p>
          <button
            className="mt-6 text-xs text-gray-400 underline"
            onClick={() => { setPhase("pick"); setSelected(null); setEmail(""); }}
          >
            Didn't receive it? Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(160deg, ${brandAccent}12 0%, white 45%, ${brandColor}08 100%)` }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {contest.client_logo_url
            ? <img src={contest.client_logo_url} alt={contest.client_name ?? ""} className="h-9 w-auto object-contain" />
            : (
              <div className="flex items-center gap-2">
                <LVLogo size={28} />
                <span className="text-sm font-bold text-gray-800">{contest.client_name ?? "LV Branding"}</span>
              </div>
            )
          }
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Voting Open
            </span>
          )}
          {isUpcoming && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
              <Clock size={10} /> Opens Soon
            </span>
          )}
          {isClosed && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <Clock size={10} /> Voting Closed
            </span>
          )}
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-8 pb-4 text-center max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-2">{contest.title}</h1>
        {contest.description && <p className="text-gray-500 text-base">{contest.description}</p>}
        {contest.results_public && totalVotes > 0 && (
          <p className="text-xs text-gray-400 mt-2">{totalVotes.toLocaleString()} vote{totalVotes !== 1 ? "s" : ""} cast</p>
        )}
        {countdownTarget && (
          <div className="inline-flex items-center gap-2 mt-4 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
            <Clock size={14} style={{ color: brandColor }} />
            <span className="text-gray-500">{countdownLabel}</span>
            <span style={{ color: brandColor }}>{formatCountdown(countdownTarget, currentTime)}</span>
          </div>
        )}
      </div>

      {/* ── Winner announcement ────────────────────────────────────────────── */}
      {winner && (
        <div className="mx-4 max-w-2xl md:mx-auto w-full px-5 mb-4">
          <div className="rounded-2xl overflow-hidden border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50">
            <div className="px-6 py-5 flex items-center gap-4">
              {winner.photo_url && (
                <img src={winner.photo_url} alt={winner.name} className="w-16 h-16 rounded-xl object-cover shrink-0 border-2 border-amber-300" />
              )}
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-0.5">🏆 Winner</p>
                <p className="text-xl font-bold text-gray-900">{winner.name}</p>
                {winner.description && <p className="text-sm text-gray-600 mt-0.5">{winner.description}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Contestant grid ────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-8 max-w-2xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contestants.map((c) => {
            const isSelected = selected === c.id;
            const voteCount  = counts[c.id] ?? 0;
            const pct        = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
            const isWinner   = contest.winner_contestant_id === c.id;

            return (
              <button
                key={c.id}
                disabled={!isOpen || phase === "email"}
                onClick={() => { if (isOpen) { setSelected(c.id); setPhase("email"); setErrMsg(""); } }}
                className={cn(
                  "text-left rounded-2xl border-2 overflow-hidden transition-all duration-200 w-full",
                  isOpen && !isSelected && "hover:border-gray-300 hover:shadow-md cursor-pointer",
                  isSelected ? "border-transparent shadow-lg scale-[1.02]" : "border-gray-200 bg-white",
                  isWinner && "border-amber-400",
                  !isOpen && "cursor-default"
                )}
                style={isSelected ? { borderColor: brandColor, boxShadow: `0 0 0 3px ${brandColor}25` } : {}}
              >
                {/* Photo */}
                <div className="h-44 bg-gray-100 relative overflow-hidden">
                  {c.photo_url
                    ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-200"><Trophy size={48} /></div>
                  }
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${brandColor}30` }}>
                      <div className="w-12 h-12 rounded-full border-3 border-white flex items-center justify-center shadow-lg" style={{ background: brandColor }}>
                        <CheckCircle2 size={28} className="text-white" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 bg-white">
                  <p className="font-bold text-gray-900 text-base leading-tight">{c.name}</p>
                  {c.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.description}</p>}

                  {/* Vote bar (shown when results_public or contest closed) */}
                  {(contest.results_public || isClosed) && totalVotes > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{voteCount} vote{voteCount !== 1 ? "s" : ""}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: brandColor }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Email step ─────────────────────────────────────────────────────── */}
        {phase === "email" && selected && isOpen && (
          <div className="mt-6 bg-white rounded-2xl border-2 p-6 shadow-lg"
            style={{ borderColor: brandColor }}>
            <p className="font-semibold text-gray-900 mb-1">
              Almost there! Enter your email to confirm your vote.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              We'll send you a quick verification link. One vote per email address.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVote()}
                className="flex-1 h-11"
                autoFocus
              />
              <Button
                onClick={handleVote}
                disabled={submitting || !email.trim()}
                className="h-11 px-5 gap-1.5 shrink-0"
                style={{ background: brandColor, color: "#fff" }}
              >
                {submitting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><ArrowRight size={14} /> Cast Vote</>
                }
              </Button>
            </div>
            {errMsg && (
              <p className="text-xs text-rose-500 mt-2 flex items-center gap-1">
                <AlertCircle size={11} /> {errMsg}
              </p>
            )}
            <button
              className="text-xs text-gray-400 mt-3 underline"
              onClick={() => { setPhase("pick"); setSelected(null); setErrMsg(""); }}
            >
              ← Change my selection
            </button>
          </div>
        )}

        {/* ── Closed state ──────────────────────────────────────────────────── */}
        {isClosed && !winner && (
          <div className="mt-6 bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
            <Clock size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="font-medium text-gray-600">Voting is closed</p>
            <p className="text-sm text-gray-400 mt-1">Results will be announced soon.</p>
          </div>
        )}
        {isUpcoming && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <Clock size={28} className="mx-auto text-amber-400 mb-2" />
            <p className="font-medium text-amber-800">Voting has not opened yet</p>
            <p className="text-sm text-amber-600 mt-1">Come back when the countdown reaches zero.</p>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="text-center py-5 border-t border-gray-100 bg-white/60">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-300">
          <LVLogo size={14} />
          <span>Powered by LV Branding</span>
        </div>
      </footer>
    </div>
  );
}
