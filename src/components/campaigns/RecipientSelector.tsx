import { useState, useMemo } from "react";
import { Search, Users, CheckCircle2, XCircle, AlertCircle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useImportedContacts } from "@/hooks/useContacts";
import { useSuppressions, type SelectedRecipient } from "@/hooks/useCampaigns";

interface Props {
  selected: SelectedRecipient[];
  onChange: (recipients: SelectedRecipient[]) => void;
}

type StageFilter = "all" | "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";

const STAGE_LABELS: Record<string, string> = {
  all:       "All",
  lead:      "Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal:  "Proposal",
  won:       "Won",
  lost:      "Lost",
};

export default function RecipientSelector({ selected, onChange }: Props) {
  const [search,       setSearch]       = useState("");
  const [stageFilter,  setStageFilter]  = useState<StageFilter>("all");
  const [tagFilter,    setTagFilter]    = useState<string>("");
  const [showFilters,  setShowFilters]  = useState(false);

  const { data: contacts = [], isLoading } = useImportedContacts();
  const { data: suppressed = [] }          = useSuppressions();

  const suppSet = new Set(suppressed);

  // Gather all tags from contacts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    contacts.forEach((c) => (c.tags ?? []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [contacts]);

  // Filter contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (!c.email) return false;
      if (stageFilter !== "all" && c.pipeline_stage !== stageFilter) return false;
      if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
      const q = search.toLowerCase();
      if (q) {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        const company = (c.company ?? "").toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        if (!name.includes(q) && !company.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, stageFilter, tagFilter, search]);

  const selectedIds = new Set(selected.map((r) => r.id));

  const toggle = (c: (typeof contacts)[0]) => {
    const isSuppressed = suppSet.has((c.email ?? "").toLowerCase());
    if (isSuppressed) return; // can't select suppressed
    if (selectedIds.has(c.id)) {
      onChange(selected.filter((r) => r.id !== c.id));
    } else {
      onChange([
        ...selected,
        {
          id:             c.id,
          email:          c.email!,
          first_name:     c.first_name,
          last_name:      c.last_name,
          company:        c.company,
          title:          c.title,
          contact_id:     c.id,
          pipeline_stage: c.pipeline_stage,
          tags:           c.tags ?? [],
          suppressed:     false,
        },
      ]);
    }
  };

  const selectAll = () => {
    const toAdd = filtered.filter(
      (c) => c.email && !suppSet.has(c.email.toLowerCase()) && !selectedIds.has(c.id)
    );
    onChange([
      ...selected,
      ...toAdd.map((c) => ({
        id:             c.id,
        email:          c.email!,
        first_name:     c.first_name,
        last_name:      c.last_name,
        company:        c.company,
        title:          c.title,
        contact_id:     c.id,
        pipeline_stage: c.pipeline_stage,
        tags:           c.tags ?? [],
        suppressed:     false,
      })),
    ]);
  };

  const clearAll = () => {
    const filteredIds = new Set(filtered.map((c) => c.id));
    onChange(selected.filter((r) => !filteredIds.has(r.id)));
  };

  const suppressedInView = filtered.filter((c) => c.email && suppSet.has(c.email.toLowerCase())).length;

  return (
    <div className="space-y-3 h-full flex flex-col">
      {/* Selection summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {selected.length} selected
            </p>
            {suppressedInView > 0 && (
              <p className="text-[10px] text-amber-600">
                {suppressedInView} suppressed (will be skipped)
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
            Select all visible
          </Button>
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full pl-8 pr-3 h-9 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search by name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters toggle */}
      <button
        onClick={() => setShowFilters((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
        Filters {(stageFilter !== "all" || tagFilter) && <span className="text-primary font-medium">· active</span>}
      </button>

      {showFilters && (
        <div className="space-y-2 p-3 bg-muted/40 rounded-lg border border-border">
          {/* Stage filter */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Pipeline Stage</p>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(STAGE_LABELS) as StageFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] rounded-md border font-medium transition-colors",
                    stageFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  )}
                >
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Tag</p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setTagFilter("")}
                  className={cn(
                    "px-2 py-0.5 text-[10px] rounded-md border font-medium transition-colors",
                    !tagFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                  )}
                >All</button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter(t === tagFilter ? "" : t)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded-md border font-medium transition-colors",
                      tagFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                    )}
                  >{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {filtered.length} contacts · {contacts.filter((c) => c.email).length} total with email
      </p>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[400px]">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading contacts…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Users size={28} className="text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No contacts match your filters.</p>
          </div>
        ) : (
          filtered.map((c) => {
            const isSuppressed = suppSet.has((c.email ?? "").toLowerCase());
            const isSelected   = selectedIds.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggle(c)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-xs",
                  isSuppressed
                    ? "opacity-40 cursor-not-allowed bg-muted/30 border-border"
                    : isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/40"
                )}
              >
                {/* Checkbox */}
                <div className={cn(
                  "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center",
                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                )}>
                  {isSelected && <CheckCircle2 size={10} className="text-primary-foreground" />}
                </div>

                {/* Avatar */}
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {`${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "?"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}
                  </p>
                  <p className="text-muted-foreground truncate">{c.email}</p>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1 shrink-0">
                  {c.company && (
                    <span className="text-[9px] text-muted-foreground hidden sm:block truncate max-w-[80px]">
                      {c.company}
                    </span>
                  )}
                  {c.pipeline_stage && c.pipeline_stage !== "lead" && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {c.pipeline_stage}
                    </Badge>
                  )}
                  {isSuppressed && (
                    <span title="Unsubscribed or bounced">
                      <AlertCircle size={12} className="text-amber-500" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
