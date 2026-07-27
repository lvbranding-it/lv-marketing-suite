import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Copy, Check, ExternalLink, Inbox, TrendingUp, Clock, Eye, Percent } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

// ── The seven public lead wizards ───────────────────────────────────────────────

const FORMS = [
  {
    source: "av-landing",
    emoji:  "🎥",
    title:  "AV Event Production",
    desc:   "LED screens, multi-camera coverage, and live broadcasting for festivals, conferences, and corporate events.",
    path:   "/av-event-production-houston",
  },
  {
    source: "web-solutions",
    emoji:  "💻",
    title:  "Industry Web Solutions",
    desc:   "Custom web apps, portals, e-commerce, and booking systems built around industry workflows.",
    path:   "/industry-web-solutions-web-app-development",
  },
  {
    source: "ux-ui-design",
    emoji:  "🎨",
    title:  "UX/UI Web Design",
    desc:   "UX research, UI design, prototyping, and design systems for websites and digital products.",
    path:   "/ux-ui-web-design-user-experiences-web-development",
  },
  {
    source: "creative-content",
    emoji:  "🖌️",
    title:  "Creative Strategy & Content Design",
    desc:   "Creative direction, content systems, collateral, campaign creative, and brand activations.",
    path:   "/creative-strategy-content-design-houston",
  },
  {
    source: "photo-video",
    emoji:  "📸",
    title:  "Photography & Video Production",
    desc:   "Commercial photography and video rooted in brand strategy — products, events, corporate, sports.",
    path:   "/commercial-photography-video-production-houston",
  },
  {
    source: "brand-strategy",
    emoji:  "🧭",
    title:  "Brand Strategy & Identity",
    desc:   "Brand positioning, messaging architecture, logo design, visual identity, and brand guidelines.",
    path:   "/brand-strategy-identity-houston",
  },
  {
    source: "digital-marketing",
    emoji:  "📈",
    title:  "Digital Marketing & Paid Media",
    desc:   "Paid search, paid social, SEO, email marketing, and full-funnel campaign strategy.",
    path:   "/digital-marketing-paid-media-houston",
  },
];

interface LeadRow {
  source:     string;
  created_at: string;
}

function useLeadStats() {
  return useQuery({
    queryKey: ["av-lead-stats"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("av_leads")
        .select("source, created_at");
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });
}

interface ViewRow {
  source:    string;
  viewed_at: string;
}

function useViewStats() {
  return useQuery({
    queryKey: ["lead-form-views"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("lead_form_views")
        .select("source, viewed_at");
      if (error) throw error;
      return (data ?? []) as ViewRow[];
    },
  });
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant={copied ? "secondary" : "outline"} className="h-8 text-xs gap-1.5 shrink-0" onClick={copy}>
      {copied ? <><Check size={13} className="text-emerald-500" /> Copied</> : <><Copy size={13} /> Copy Link</>}
    </Button>
  );
}

export default function LeadForms() {
  const { data: leads = [], isLoading } = useLeadStats();
  const { data: views = [] } = useViewStats();

  const viewsBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) m.set(v.source, (m.get(v.source) ?? 0) + 1);
    return m;
  }, [views]);

  const statsBySource = useMemo(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const m = new Map<string, { total: number; last30: number; lastAt: string | null }>();
    for (const l of leads) {
      const s = m.get(l.source) ?? { total: 0, last30: 0, lastAt: null };
      s.total += 1;
      if (now - new Date(l.created_at).getTime() <= THIRTY_DAYS) s.last30 += 1;
      if (!s.lastAt || l.created_at > s.lastAt) s.lastAt = l.created_at;
      m.set(l.source, s);
    }
    return m;
  }, [leads]);

  const totalLeads  = leads.length;
  const total30     = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return leads.filter((l) => new Date(l.created_at).getTime() >= cutoff).length;
  }, [leads]);

  const origin = window.location.origin;

  return (
    <AppShell>
      <Header title="Lead Forms" subtitle="Shareable service intake links — copy and send, leads flow into Contacts." />

      <div className="p-3 sm:p-6 pb-16 max-w-4xl mx-auto space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-md">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Total leads</p>
            <p className="text-2xl font-bold leading-none">{isLoading ? "…" : totalLeads}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Across all forms</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Last 30 days</p>
            <p className="text-2xl font-bold leading-none text-primary">{isLoading ? "…" : total30}</p>
            <p className="text-[10px] text-muted-foreground mt-1">New submissions</p>
          </div>
        </div>

        {/* Form cards */}
        <div className="space-y-3">
          {FORMS.map((f) => {
            const url = `${origin}${f.path}`;
            const esUrl = `${origin}/es${f.path}`;
            const stats = statsBySource.get(f.source);
            return (
              <div key={f.source} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
                {/* Title + actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">
                      {f.emoji}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{f.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" asChild title="Open English form">
                      <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
                    </Button>
                  </div>
                </div>

                {/* Links — English + Spanish */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-1.5">
                    <span className="text-[9px] font-semibold text-muted-foreground shrink-0 w-6">EN</span>
                    <code className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{url}</code>
                    <CopyLinkButton url={url} />
                  </div>
                  <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-1.5">
                    <span className="text-[9px] font-semibold text-muted-foreground shrink-0 w-6">ES</span>
                    <code className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{esUrl}</code>
                    <CopyLinkButton url={esUrl} />
                  </div>
                </div>

                {/* Stats */}
                {isLoading ? (
                  <Skeleton className="h-5 w-64" />
                ) : (() => {
                  const viewCount = viewsBySource.get(f.source) ?? 0;
                  const total = stats?.total ?? 0;
                  const conversion = viewCount > 0 ? Math.round((total / viewCount) * 100) : null;
                  return (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Eye size={12} />
                        <strong className="text-foreground">{viewCount}</strong> view{viewCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Inbox size={12} />
                        <strong className="text-foreground">{total}</strong> lead{total !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <TrendingUp size={12} />
                        <strong className={stats?.last30 ? "text-primary" : "text-foreground"}>{stats?.last30 ?? 0}</strong> last 30 days
                      </span>
                      {conversion !== null && (
                        <span className="flex items-center gap-1.5">
                          <Percent size={12} />
                          <strong className="text-foreground">{conversion}%</strong> conversion
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} />
                        {stats?.lastAt
                          ? <>Last lead {formatDistanceToNow(new Date(stats.lastAt), { addSuffix: true })}</>
                          : "No leads yet"}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
