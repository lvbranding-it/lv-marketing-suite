import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ImportedContact } from "@/hooks/useContacts";
import { PIPELINE_STAGES, useUpdatePipelineStage, type PipelineStage } from "@/hooks/useCRM";

interface Props {
  contacts: ImportedContact[];
  onSelect: (c: ImportedContact) => void;
}

function getInitials(first: string | null, last: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function getInitialsBg(name: string) {
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-sky-500", "bg-pink-500", "bg-indigo-500", "bg-teal-500",
  ];
  const idx = (name.charCodeAt(0) ?? 0) % colors.length;
  return colors[idx];
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function FitPill({ score }: { score: number | null }) {
  if (score == null) return null;
  const cls =
    score >= 85
      ? "bg-emerald-100 text-emerald-700"
      : score >= 70
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", cls)}>
      {score}%
    </span>
  );
}

export default function PipelineView({ contacts, onSelect }: Props) {
  const updateStage = useUpdatePipelineStage();

  const stageContacts = (key: PipelineStage) =>
    contacts.filter((c) => (c.pipeline_stage ?? "lead") === key);

  const totalValue = contacts.reduce((sum, c) => sum + (c.deal_value ?? 0), 0);
  const wonCount = contacts.filter((c) => c.pipeline_stage === "won").length;
  const avgDeal =
    contacts.filter((c) => c.deal_value != null).length > 0
      ? contacts.filter((c) => c.deal_value != null).reduce((s, c) => s + (c.deal_value ?? 0), 0) /
        contacts.filter((c) => c.deal_value != null).length
      : 0;

  const moveStage = (contact: ImportedContact, direction: "prev" | "next", e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = PIPELINE_STAGES.findIndex((s) => s.key === (contact.pipeline_stage ?? "lead"));
    const newIdx = direction === "next" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return;
    updateStage.mutate({ id: contact.id, pipeline_stage: PIPELINE_STAGES[newIdx].key });
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="In Pipeline" value={String(contacts.length)} />
        <SummaryCard label="Pipeline Value" value={formatCurrency(totalValue)} />
        <SummaryCard label="Won" value={String(wonCount)} />
        <SummaryCard label="Avg Deal" value={avgDeal > 0 ? formatCurrency(avgDeal) : "—"} />
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const cols = stageContacts(stage.key);
          const stageValue = cols.reduce((s, c) => s + (c.deal_value ?? 0), 0);

          return (
            <div key={stage.key} className="w-72 shrink-0 flex flex-col">
              {/* Column header */}
              <div
                className={cn(
                  "rounded-t-lg px-3 py-2.5 border border-b-0",
                  stage.border,
                  stage.headerBg
                )}
                style={{ borderTopWidth: "3px", borderTopColor: "currentColor" }}
              >
                <div className={cn("flex items-center justify-between", stage.color)}>
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <span>{stage.emoji}</span>
                    <span>{stage.label}</span>
                  </span>
                  <span className="text-[10px] bg-white/60 border border-current/20 px-1.5 py-0.5 rounded-full font-medium">
                    {cols.length}
                  </span>
                </div>
                {stageValue > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatCurrency(stageValue)}
                  </p>
                )}
              </div>

              {/* Cards */}
              <div
                className={cn(
                  "flex-1 border rounded-b-lg p-2 space-y-2 min-h-[120px] max-h-[600px] overflow-y-auto",
                  stage.border
                )}
              >
                {cols.length === 0 ? (
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <p className="text-[10px] text-muted-foreground/50">No contacts yet</p>
                  </div>
                ) : (
                  cols.map((c) => {
                    const initials = getInitials(c.first_name, c.last_name);
                    const avatarBg = getInitialsBg(c.first_name ?? c.last_name ?? "A");
                    const stageIdx = PIPELINE_STAGES.findIndex((s) => s.key === (c.pipeline_stage ?? "lead"));
                    const visibleTags = (c.tags ?? []).slice(0, 2);

                    return (
                      <div
                        key={c.id}
                        onClick={() => onSelect(c)}
                        className="bg-white border border-border rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2"
                      >
                        {/* Top row */}
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0",
                              avatarBg
                            )}
                          >
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">
                              {c.first_name} {c.last_name}
                            </p>
                          </div>
                          <FitPill score={c.fit_score} />
                        </div>

                        {/* Title + company */}
                        {(c.title || c.company) && (
                          <div className="min-w-0">
                            {c.title && (
                              <p className="text-[10px] text-muted-foreground truncate">{c.title}</p>
                            )}
                            {c.company && (
                              <p className="text-[10px] text-sky-500 font-medium truncate">{c.company}</p>
                            )}
                          </div>
                        )}

                        {/* Tags */}
                        {visibleTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {visibleTags.map((t) => (
                              <span
                                key={t}
                                className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Deal value */}
                        {c.deal_value != null && c.deal_value > 0 && (
                          <p className="text-xs text-emerald-600 font-semibold">
                            {formatCurrency(c.deal_value)}
                          </p>
                        )}

                        {/* Last contacted */}
                        <p className="text-[9px] text-muted-foreground/60">
                          {c.last_contacted_at
                            ? `Contacted ${formatDistanceToNow(new Date(c.last_contacted_at), { addSuffix: true })}`
                            : "Never contacted"}
                        </p>

                        {/* Quick stage move */}
                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <button
                            onClick={(e) => moveStage(c, "prev", e)}
                            disabled={stageIdx === 0}
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Move to previous stage"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <span className="text-[9px] text-muted-foreground">
                            {PIPELINE_STAGES[stageIdx]?.emoji}
                          </span>
                          <button
                            onClick={(e) => moveStage(c, "next", e)}
                            disabled={stageIdx === PIPELINE_STAGES.length - 1}
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Move to next stage"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
