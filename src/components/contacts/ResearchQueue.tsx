import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Search, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Loader2, Sparkles, Mail, Linkedin, Globe, Building2,
  AlertCircle, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { type ImportedContact } from "@/hooks/useContacts";
import { runSkillStream } from "@/lib/claude";
import { useToast } from "@/hooks/use-toast";
import {
  verifyContact,
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  type VerifyResult,
} from "@/lib/contactResearch";

interface Props {
  contacts: ImportedContact[];
}

type ResearchState = "idle" | "verifying" | "streaming" | "done" | "error";

// ── Verification pill ────────────────────────────────────────────────────────
function VerifyPill({
  label,
  live,
  detail,
}: {
  label: string;
  live: boolean | null;
  detail: string;
}) {
  if (live === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
        <AlertCircle size={9} />
        {label}: {detail}
      </span>
    );
  }
  return live ? (
    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={9} />
      {label}: {detail}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle size={9} />
      {label}: {detail}
    </span>
  );
}

// ── Source badge colors ──────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; class: string }> = {
  vibe:   { label: "Vibe",   class: "bg-violet-100 text-violet-700 border-violet-200" },
  apollo: { label: "Apollo", class: "bg-blue-100 text-blue-700 border-blue-200" },
  manual: { label: "Manual", class: "bg-slate-100 text-slate-600 border-slate-200" },
};

// ── Individual contact research card ─────────────────────────────────────────
function ResearchCard({ contact }: { contact: ImportedContact }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [researchState, setResearchState] = useState<ResearchState>("idle");
  const [streamedText, setStreamedText] = useState(contact.research_result ?? "");
  const [notes, setNotes] = useState(contact.research_notes ?? "");

  const sourceMeta = SOURCE_META[contact.source] ?? SOURCE_META.manual;
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";

  const [verification, setVerification] = useState<VerifyResult | null>(null);

  const runResearch = async () => {
    setResearchState("verifying");
    setStreamedText("");
    setExpanded(true);

    // Step 1: run real HTTP checks
    const vr = await verifyContact(contact);
    setVerification(vr);

    // Step 2: stream Claude analysis with real verification data
    setResearchState("streaming");
    await runSkillStream(
      {
        skillSystemPrompt: RESEARCH_SYSTEM_PROMPT,
        userMessage: buildResearchPrompt(contact, vr),
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (t) => setStreamedText((prev) => prev + t),
        onComplete: async (text) => {
          await supabase
            .from("contacts")
            .update({ research_result: text })
            .eq("id", contact.id);
          qc.invalidateQueries({ queryKey: ["contacts"] });
          setResearchState("done");
        },
        onError: (err) => {
          toast({ variant: "destructive", description: err.message });
          setResearchState("error");
        },
      }
    );
  };

  const saveNotes = async () => {
    await supabase.from("contacts").update({ research_notes: notes }).eq("id", contact.id);
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  const verify = async () => {
    await supabase
      .from("contacts")
      .update({
        verification_status: "verified",
        pipeline_stage: "lead",
        verified_at: new Date().toISOString(),
        research_notes: notes || null,
      })
      .eq("id", contact.id);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    toast({ description: `${fullName} verified and added to pipeline as Lead.` });
  };

  const archive = async () => {
    await supabase
      .from("contacts")
      .update({ verification_status: "invalid", research_notes: notes || null })
      .eq("id", contact.id);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    toast({ description: `${fullName} archived.` });
  };

  const hasResult = streamedText.length > 0;
  const isVerifying = researchState === "verifying";
  const isStreaming = researchState === "streaming";
  const isBusy = isVerifying || isStreaming;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card transition-shadow hover:shadow-sm">
      {/* Card header — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Initials avatar */}
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
          {`${contact.first_name?.[0] ?? ""}${contact.last_name?.[0] ?? ""}`.toUpperCase() || "?"}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{fullName}</span>
            <Badge variant="outline" className={cn("text-[9px] border px-1.5 py-0", sourceMeta.class)}>
              {sourceMeta.label}
            </Badge>
            {hasResult && researchState !== "streaming" && (
              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                <Sparkles size={10} /> Researched
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        {/* Meta badges */}
        <div className="flex items-center gap-2 shrink-0">
          {contact.email && (
            <span title={contact.email}>
              <Mail size={12} className="text-muted-foreground/50" />
            </span>
          )}
          {contact.linkedin_url && (
            <span title="Has LinkedIn">
              <Linkedin size={12} className="text-muted-foreground/50" />
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}
          </span>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Contact data pills */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            {contact.email && (
              <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground">
                <Mail size={10} />{contact.email}
              </span>
            )}
            {contact.company && (
              <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground">
                <Building2 size={10} />{contact.company}
              </span>
            )}
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors"
              >
                <Linkedin size={10} />LinkedIn
              </a>
            )}
            {contact.website && (
              <a
                href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe size={10} />{contact.website}
              </a>
            )}
          </div>

          {/* Verification status pills — shown after checks run */}
          {verification && (
            <div className="flex flex-wrap gap-1.5">
              <VerifyPill
                label="Website"
                live={verification.website.live}
                detail={verification.website.live
                  ? `HTTP ${verification.website.status}`
                  : (verification.website.error ?? "no response")}
              />
              <VerifyPill
                label="Email domain"
                live={verification.email.mx_valid}
                detail={verification.email.domain ?? "—"}
              />
              <VerifyPill
                label="LinkedIn"
                live={verification.linkedin.format_valid ? true : (verification.linkedin.url ? false : null)}
                detail={verification.linkedin.username ?? (verification.linkedin.url ? "bad URL" : "not provided")}
              />
            </div>
          )}

          {/* AI Research result */}
          {hasResult ? (
            <div className="bg-muted/40 border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck size={11} className="text-primary" />
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                  AI Research — verified data
                </span>
                {isBusy && (
                  <Loader2 size={10} className="animate-spin text-muted-foreground ml-1" />
                )}
              </div>
              <div className="text-xs">
                <MarkdownContent>{streamedText}</MarkdownContent>
                {isStreaming && (
                  <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={runResearch}
              disabled={isBusy}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary"
            >
              {isVerifying ? (
                <><Loader2 size={13} className="animate-spin" />Checking links…</>
              ) : isStreaming ? (
                <><Loader2 size={13} className="animate-spin" />Analyzing…</>
              ) : (
                <><Sparkles size={13} />Research with AI</>
              )}
            </Button>
          )}

          {/* Re-research button if result already exists */}
          {hasResult && !isBusy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={runResearch}
              className="h-6 text-[10px] text-muted-foreground gap-1 px-2"
            >
              <Sparkles size={10} /> Re-research
            </Button>
          )}

          {/* Notes */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Research Notes</p>
            <textarea
              className="w-full text-xs border border-border rounded-md p-2.5 bg-background resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Add your own notes about this contact…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={verify}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 size={13} />
              Verify & Add to Pipeline
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={archive}
              className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
            >
              <XCircle size={13} />
              Archive
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ResearchQueue component ──────────────────────────────────────────────
export default function ResearchQueue({ contacts }: Props) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "vibe" | "apollo">("all");

  const unverified = contacts.filter((c) => c.verification_status === "unverified");

  const filtered = unverified.filter((c) => {
    const matchSource = sourceFilter === "all" || c.source === sourceFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q);
    return matchSource && matchSearch;
  });

  const vibeCount   = unverified.filter((c) => c.source === "vibe").length;
  const apolloCount = unverified.filter((c) => c.source === "apollo").length;

  if (unverified.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-foreground">Research queue is clear</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          All imported contacts have been reviewed. Import new contacts from Vibe Prospecting or Apollo to start researching.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Awaiting Review</p>
          <p className="text-2xl font-bold mt-0.5">{unverified.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] uppercase tracking-widest text-violet-500">From Vibe</p>
          <p className="text-2xl font-bold mt-0.5 text-violet-600">{vibeCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[9px] uppercase tracking-widest text-blue-500">From Apollo</p>
          <p className="text-2xl font-bold mt-0.5 text-blue-600">{apolloCount}</p>
        </div>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          These contacts were imported from external sources. Use <strong>AI Research</strong> to verify they're real and relevant before adding them to your pipeline.
        </p>
      </div>

      {/* Search + source filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 h-8 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search by name, company, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(["all", "vibe", "apollo"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md border font-medium transition-colors",
                sourceFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              )}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Info line */}
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{filtered.length}</span> of {unverified.length} unverified contacts
        {search && " · filtered by search"}
      </p>

      {/* Contact cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No contacts match your filter.</p>
        ) : (
          filtered.map((c) => <ResearchCard key={c.id} contact={c} />)
        )}
      </div>
    </div>
  );
}
