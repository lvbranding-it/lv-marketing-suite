import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronRight, FileSignature, Loader2, Plus, Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LegalDocumentSheet from "@/components/legal/LegalDocumentSheet";
import LegalStageBadge from "@/components/legal/LegalStageBadge";
import NewLegalDocumentDialog from "@/components/legal/NewLegalDocumentDialog";
import { useLegalDocuments, type LegalDocument } from "@/hooks/useLegalSigns";
import { usePermissions } from "@/hooks/usePermissions";
import {
  LEGAL_FILTERS, legalStage, matchesFilter, matchesSearch, stageDetail, type LegalFilter, type LegalStage,
} from "@/lib/legal/status";
import { cn } from "@/lib/utils";

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(new Date(iso));

/** The date that matters for where the document stands. */
function stageDate(doc: LegalDocument, stage: LegalStage) {
  if (stage === "completed" && doc.completed_at) return `Completed ${shortDate(doc.completed_at)}`;
  if (stage === "countersign" && doc.client_signed_at) return `Signed ${shortDate(doc.client_signed_at)}`;
  if (stage === "voided" && doc.voided_at) return `Voided ${shortDate(doc.voided_at)}`;
  if (stage === "expired") return `Expired ${shortDate(doc.expires_at)}`;
  return `Sent ${shortDate(doc.sent_at)}`;
}

function Count({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone?: "amber" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border bg-background p-4 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "amber" && value > 0 && "text-amber-600 dark:text-amber-400")}>{value}</p>
    </button>
  );
}

export default function LegalSigns() {
  const { isManagerOrAbove } = usePermissions();
  const documents = useLegalDocuments();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<LegalFilter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const openId = params.get("document");
  const all = documents.data ?? [];
  const openDoc = all.find((doc) => doc.id === openId) ?? null;

  const staged = useMemo(() => all.map((doc) => ({ doc, stage: legalStage(doc) })), [all]);
  const counts = useMemo(() => {
    const result = { countersign: 0, waiting: 0, completed: 0, closed: 0 };
    for (const { stage } of staged) {
      if (stage === "expired" || stage === "voided") result.closed++;
      else result[stage]++;
    }
    return result;
  }, [staged]);
  const shown = staged.filter(({ doc, stage }) => matchesFilter(stage, filter) && matchesSearch(doc, query));

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("document", id);
    else next.delete("document");
    setParams(next, { replace: true });
  };
  const toggle = (next: LegalFilter) => setFilter((current) => (current === next ? "all" : next));

  return (
    <AppShell>
      <div className="flex min-h-full flex-col bg-muted/20">
        <Header
          title="LegalSigns"
          subtitle="Send releases and NDAs, collect signatures, keep the signed copies."
          actions={isManagerOrAbove && <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />New document</Button>}
        />
        <main className="flex-1 space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Count label="To countersign" value={counts.countersign} active={filter === "countersign"} onClick={() => toggle("countersign")} tone="amber" />
            <Count label="Waiting for signature" value={counts.waiting} active={filter === "waiting"} onClick={() => toggle("waiting")} />
            <Count label="Completed" value={counts.completed} active={filter === "completed"} onClick={() => toggle("completed")} />
            <Count label="Expired or voided" value={counts.closed} active={filter === "closed"} onClick={() => toggle("closed")} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
              {LEGAL_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company or document" className="bg-background pl-9" aria-label="Search documents" />
            </div>
          </div>

          {documents.isLoading ? (
            <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : documents.isError ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">LegalSigns couldn't load your documents.</p>
                <p className="mt-0.5 text-muted-foreground">If this is the first time, the LegalSigns database migration may not be applied yet.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => documents.refetch()}>Try again</Button>
              </div>
            </div>
          ) : all.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background p-12 text-center">
              <FileSignature className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold">No documents yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Send a photo, media, talent or location release, or a client approval form. The recipient signs from their email, you countersign, and the signed PDF is saved here.
              </p>
              {isManagerOrAbove && <Button className="mt-5" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Send the first document</Button>}
            </div>
          ) : shown.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">No documents match.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-background">
              {shown.map(({ doc, stage }) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => open(doc.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.recipient_name}{doc.company_name && <span className="font-normal text-muted-foreground"> · {doc.company_name}</span>}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {doc.title}
                        <span className="ml-1.5 rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide">{doc.language}</span>
                      </p>
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p className="truncate text-sm">{stageDate(doc, stage)}</p>
                      {stageDetail(doc, stage) && <p className="truncate text-xs text-muted-foreground">{stageDetail(doc, stage)}</p>}
                    </div>
                    <LegalStageBadge stage={stage} className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto" />
                    <ChevronRight className="col-start-2 row-span-2 row-start-1 h-4 w-4 text-muted-foreground sm:col-start-auto sm:row-span-1 sm:row-start-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <NewLegalDocumentDialog open={creating} onOpenChange={setCreating} onSent={(id) => open(id)} />
      <LegalDocumentSheet doc={openDoc} onOpenChange={(next) => !next && open(null)} canManage={isManagerOrAbove} />
    </AppShell>
  );
}
