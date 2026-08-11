import React, { useState, useMemo, useCallback } from "react";
import { format, formatDistanceToNow, isPast, isToday } from "date-fns";
import {
  Search, Trash2, Pencil, UserPlus, CheckSquare, Square, X, PlusCircle,
  ChevronRight, Tag, Plus, Upload, Loader2, CalendarClock, CheckCircle2, DollarSign,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactSlideOver from "@/components/contacts/ContactSlideOver";
import PipelineView from "@/components/contacts/PipelineView";
import ResearchQueue from "@/components/contacts/ResearchQueue";
import TagSidebar from "@/components/contacts/TagSidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useImportedContacts,
  useImportContact,
  useUpdateContact,
  useDeleteContact,
  type ImportedContact,
} from "@/hooks/useContacts";
import { PIPELINE_STAGES, useUpdateContactCRM, type PipelineStage } from "@/hooks/useCRM";
import { useContactTagDefinitions, useCreateTagDefinition, pickTagColor } from "@/hooks/useContactTags";
import { usePermissions } from "@/hooks/usePermissions";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseContactsCSV } from "@/lib/csvImport";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import BranchSelect from "@/components/branches/BranchSelect";
import { branchMatchesFilter, useAccessibleBranches, type BranchFilterValue } from "@/hooks/useBranches";

type SortKey = "activity" | "name" | "company" | "stage" | "contacted" | "followup" | "deal";
type SortDir = 1 | -1;
type StageFilter = "all" | "none" | PipelineStage;

const stageMeta = (key: string | null | undefined) =>
  PIPELINE_STAGES.find((s) => s.key === key) ?? null;

const fullName = (c: ImportedContact) =>
  `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company || c.email || "Contact";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export default function Contacts() {
  const { toast } = useToast();
  const { canAddContacts, canDeleteContacts, isMember, isManager } = usePermissions();
  const { log } = useActivityLog();
  const { org } = useOrg();

  const { data: allImported = [], isLoading } = useImportedContacts();
  const [branchFilter, setBranchFilter] = useState<BranchFilterValue>("all");
  const { data: accessibleBranches = [], isBranchRestricted } = useAccessibleBranches();
  const branchContext = isBranchRestricted && branchFilter === "all" && accessibleBranches.length === 1
    ? accessibleBranches[0]
    : null;
  const effectiveBranchFilter = branchContext ? branchContext.id : branchFilter;
  const contactBranchId =
    effectiveBranchFilter !== "all" && effectiveBranchFilter !== "unassigned"
      ? effectiveBranchFilter
      : null;

  const contacts = useMemo(
    () => allImported.filter((c) => branchMatchesFilter(c.branch_id, effectiveBranchFilter)),
    [allImported, effectiveBranchFilter]
  );

  const addContact    = useImportContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const updateCRM     = useUpdateContactCRM();
  const { data: tagDefs = [] } = useContactTagDefinitions();
  const createTagDef  = useCreateTagDefinition();

  // ── CSV Import ──────────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);

  const handleCSVImport = async (file: File) => {
    if (!org) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseContactsCSV(text);
      if (parsed.length === 0) {
        toast({ variant: "destructive", description: "No valid contacts found. Make sure the file has an Email column." });
        return;
      }

      const allNewTags = Array.from(new Set(parsed.flatMap((c) => c.tags)));
      for (const tagName of allNewTags) {
        if (!tagDefs.some((d) => d.name === tagName)) {
          await supabase.from("contact_tag_definitions").insert({
            org_id: org.id, name: tagName,
            color: pickTagColor(tagDefs.map((d) => d.color)),
          });
        }
      }

      const rows = parsed.map((c) => ({
        org_id:     org.id,
        first_name: c.first_name || null,
        last_name:  c.last_name  || null,
        email:      c.email,
        phone:      c.phone      || null,
        company:    c.company    || null,
        title:      c.title      || null,
        city:       c.city       || null,
        state:      c.state      || null,
        country:    c.country    || null,
        tags:       c.tags,
        source:     "manual" as const,
        source_id:  null,
        apollo_id:  null,
        signals:    [],
        raw_data:   {},
        branch_id:  contactBranchId,
      }));

      const { error } = await supabase
        .from("contacts")
        .upsert(rows, { onConflict: "org_id,email" });

      if (error) throw error;
      toast({ description: `✓ ${parsed.length} contacts imported successfully.` });
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  // ── Quick-tag popover ───────────────────────────────────────────────────
  const [quickTagOpen, setQuickTagOpen]   = useState<string | null>(null);
  const [quickTagQuery, setQuickTagQuery] = useState("");

  const quickAddTag = async (contact: ImportedContact, tagName: string) => {
    const existing = contact.tags ?? [];
    if (existing.includes(tagName)) return;
    await updateContact.mutateAsync({ id: contact.id, tags: [...existing, tagName] });
    if (!tagDefs.some((d) => d.name === tagName)) {
      createTagDef.mutate({ name: tagName, color: pickTagColor(tagDefs.map((d) => d.color)) });
    }
  };

  const tagColorMap = useMemo(() => {
    const m = new Map<string, string>();
    tagDefs.forEach((d) => m.set(d.name, d.color));
    return m;
  }, [tagDefs]);

  // A contact added in the last two days is called out, so a lead that arrived
  // overnight is obvious without reading timestamps.
  const activityAt = (c: ImportedContact): string | null => {
    // Array.prototype.at is ES2022; this project targets ES2020.
    const stamps = ([c.updated_at, c.created_at].filter(Boolean) as string[]).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  };

  const isNew = (c: ImportedContact) => {
    const at = activityAt(c);
    return Boolean(at) && Date.now() - new Date(at as string).getTime() < 48 * 60 * 60 * 1000;
  };

  // ── View state ──────────────────────────────────────────────────────────
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [search, setSearch]   = useState("");
  // Most recent activity first. Not created_at: the lead endpoint upserts by
  // email, so a returning prospect updates an existing contact and keeps its
  // original created_at. Sorting by creation would hide exactly the submissions
  // this page exists to surface.
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [slideOverContact, setSlideOverContact] = useState<ImportedContact | null>(null);
  const [formOpen, setFormOpen]     = useState(false);
  const [editTarget, setEditTarget] = useState<ImportedContact | null>(null);
  const [selectionSet, setSelectionSet] = useState<Set<string>>(new Set());

  // ── Filter + sort ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const bySort = (a: ImportedContact, b: ImportedContact): number => {
      switch (sortKey) {
        case "activity":  return (activityAt(a) ?? "").localeCompare(activityAt(b) ?? "");
        case "name":      return fullName(a).localeCompare(fullName(b));
        case "company":   return (a.company ?? "").localeCompare(b.company ?? "");
        case "stage": {
          const ia = PIPELINE_STAGES.findIndex((s) => s.key === a.pipeline_stage);
          const ib = PIPELINE_STAGES.findIndex((s) => s.key === b.pipeline_stage);
          return ia - ib;
        }
        case "contacted": return (a.last_contacted_at ?? "").localeCompare(b.last_contacted_at ?? "");
        case "followup":  return (a.next_followup_at ?? "9999").localeCompare(b.next_followup_at ?? "9999");
        case "deal":      return (a.deal_value ?? 0) - (b.deal_value ?? 0);
      }
    };
    return contacts
      .filter((c) => {
        if (selectedTag && !(c.tags ?? []).includes(selectedTag)) return false;
        if (stageFilter === "none" && c.pipeline_stage) return false;
        if (stageFilter !== "all" && stageFilter !== "none" && c.pipeline_stage !== stageFilter) return false;
        if (!q) return true;
        return (
          fullName(c).toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.title ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => sortDir * bySort(a, b));
  }, [contacts, selectedTag, stageFilter, search, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }
  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-muted-foreground/30 ml-0.5">↕</span>;
    return <span className="text-primary ml-0.5">{sortDir === 1 ? "↑" : "↓"}</span>;
  }

  // ── Selection ───────────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every((c) => selectionSet.has(c.id));
  const someSelected = selectionSet.size > 0;

  const toggleSelectAll = () => {
    setSelectionSet(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  };

  const toggleRow = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectionSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    for (const id of selectionSet) await deleteContact.mutateAsync(id);
    toast({ description: `${selectionSet.size} contact${selectionSet.size !== 1 ? "s" : ""} deleted.` });
    setSelectionSet(new Set());
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteContact.mutateAsync(id);
    setSelectionSet((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast({ description: "Contact deleted." });
  };

  const handleAddToPipeline = async (c: ImportedContact, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateContact.mutateAsync({ id: c.id, pipeline_stage: "lead" });
    toast({ description: `${fullName(c)} added to pipeline.` });
  };

  // ── Follow-up helpers ───────────────────────────────────────────────────
  const followUps = useMemo(() => {
    const withDate = contacts.filter((c) => c.next_followup_at && c.pipeline_stage !== "lost");
    const overdue  = withDate
      .filter((c) => isPast(new Date(c.next_followup_at!)) && !isToday(new Date(c.next_followup_at!)))
      .sort((a, b) => a.next_followup_at!.localeCompare(b.next_followup_at!));
    const upcoming = withDate
      .filter((c) => !overdue.includes(c))
      .sort((a, b) => a.next_followup_at!.localeCompare(b.next_followup_at!));
    return { overdue, upcoming };
  }, [contacts]);

  const markFollowUpDone = async (c: ImportedContact, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase
      .from("contacts")
      .update({ last_contacted_at: new Date().toISOString(), next_followup_at: null })
      .eq("id", c.id);
    updateCRM.mutate({ id: c.id }); // trigger invalidation via existing hook
    toast({ description: `Follow-up with ${fullName(c)} marked done.` });
  };

  // ── Form helpers ────────────────────────────────────────────────────────
  const openAdd = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit = (c: ImportedContact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(c);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditTarget(null); };

  const handleSave = async (values: Partial<ImportedContact>) => {
    if (editTarget) {
      await updateContact.mutateAsync({ id: editTarget.id, ...values });
      toast({ description: "Contact updated." });
      if (isMember || isManager) {
        log("edited_contact", "contact", editTarget.id,
          `${values.first_name ?? editTarget.first_name} ${values.last_name ?? editTarget.last_name}`.trim());
      }
    } else {
      await addContact.mutateAsync({
        ...values,
        branch_id:
          values.branch_id && values.branch_id !== "unassigned"
            ? values.branch_id
            : contactBranchId,
        source:    "manual",
        source_id: null,
        apollo_id: null,
        signals:   [],
        raw_data:  {},
      } as Parameters<typeof addContact.mutateAsync>[0]);
      toast({ description: "Contact added." });
    }
    closeForm();
  };

  // ── Stats ───────────────────────────────────────────────────────────────
  const inPipeline    = contacts.filter((c) => !!c.pipeline_stage);
  const pipelineValue = inPipeline.reduce((s, c) => s + (c.deal_value ?? 0), 0);
  const overdueCount  = followUps.overdue.length;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <Header title="Contacts" subtitle="Your CRM — contacts, follow-ups, and pipeline in one place." />

      <div className="p-3 sm:p-6 pb-16">
        <div className="mb-4 flex justify-end">
          <BranchSelect value={branchFilter} onValueChange={setBranchFilter} />
        </div>
        <Tabs defaultValue="contacts">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <div className="overflow-x-auto flex-1 min-w-0">
              <TabsList className="w-max">
                <TabsTrigger value="contacts">
                  Contacts
                  <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{contacts.length}</span>
                </TabsTrigger>
                <TabsTrigger value="followups">
                  Follow-ups
                  {overdueCount > 0 && (
                    <span className="ml-1.5 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                      {overdueCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="research">
                  Research
                  {contacts.filter((c) => c.verification_status === "unverified").length > 0 && (
                    <span className="ml-1.5 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                      {contacts.filter((c) => c.verification_status === "unverified").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pipeline">
                  Pipeline
                  <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{inPipeline.length}</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canAddContacts && (
                <>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".csv"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { handleCSVImport(f); e.target.value = ""; }
                      }}
                    />
                    <Button size="sm" variant="outline" asChild disabled={importing}>
                      <span>
                        {importing
                          ? <Loader2 size={14} className="sm:mr-1.5 animate-spin" />
                          : <Upload size={14} className="sm:mr-1.5" />}
                        <span className="hidden sm:inline">{importing ? "Importing…" : "Import CSV"}</span>
                      </span>
                    </Button>
                  </label>
                  <Button size="sm" onClick={openAdd}>
                    <UserPlus size={14} className="sm:mr-1.5" />
                    <span className="hidden sm:inline">New Contact</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ── Contacts tab ─────────────────────────────────────── */}
          <TabsContent value="contacts">

            {/* Mobile tag strip */}
            <div className="lg:hidden overflow-x-auto flex gap-1.5 pb-2 mb-3">
              <button
                onClick={() => setSelectedTag(null)}
                className={cn(
                  "shrink-0 px-3 py-1 text-xs rounded-full border font-medium transition-colors",
                  !selectedTag ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                )}
              >All</button>
              {tagDefs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedTag(selectedTag === d.name ? null : d.name)}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-3 py-1 text-xs rounded-full border font-medium transition-colors",
                    selectedTag === d.name ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-primary"
                  )}
                  style={selectedTag === d.name ? { background: d.color, borderColor: d.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </button>
              ))}
            </div>

            <div className="flex gap-4 items-start">

              {/* Desktop tag sidebar */}
              <div className="hidden lg:block w-60 shrink-0 sticky top-4">
                <div className="bg-card border border-border rounded-lg p-3 max-h-[80vh] overflow-y-auto">
                  <TagSidebar
                    contacts={contacts}
                    selectedTag={selectedTag}
                    onSelectTag={setSelectedTag}
                  />
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <StatCard label="Total contacts" value={String(contacts.length)} sub="In this workspace" />
                  <StatCard label="In pipeline" value={String(inPipeline.length)} sub={`${contacts.length - inPipeline.length} not staged`} />
                  <StatCard label="Pipeline value" value={pipelineValue > 0 ? fmtMoney(pipelineValue) : "—"} sub="Sum of deal values" />
                  <StatCard
                    label="Overdue follow-ups"
                    value={String(overdueCount)}
                    sub={overdueCount > 0 ? "Needs attention" : "All caught up"}
                    accent={overdueCount > 0}
                  />
                </div>

                {/* Search + stage filter */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, company, title, email, phone, tag…"
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StageChip active={stageFilter === "all"} onClick={() => setStageFilter("all")} label="All" />
                    {PIPELINE_STAGES.map((s) => (
                      <StageChip
                        key={s.key}
                        active={stageFilter === s.key}
                        onClick={() => setStageFilter(stageFilter === s.key ? "all" : s.key)}
                        label={`${s.emoji} ${s.label}`}
                      />
                    ))}
                    <StageChip active={stageFilter === "none"} onClick={() => setStageFilter(stageFilter === "none" ? "all" : "none")} label="Not in pipeline" />
                  </div>
                </div>

                {/* Bulk action bar */}
                {someSelected && (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
                    <span className="text-sm font-medium text-primary">
                      {selectionSet.size} contact{selectionSet.size !== 1 ? "s" : ""} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectionSet(new Set())}>
                        <X size={12} className="mr-1" /> Clear
                      </Button>
                      {canDeleteContacts && (
                        <Button
                          variant="destructive" size="sm" className="h-7 text-xs"
                          onClick={handleBulkDelete} disabled={deleteContact.isPending}
                        >
                          <Trash2 size={12} className="mr-1" /> Delete {selectionSet.size} selected
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing <span className="text-foreground font-medium">{filtered.length}</span> of {contacts.length} contacts</span>
                  <span className="hidden sm:inline">Click a row for full details &amp; activity</span>
                </div>

                {/* Table */}
                <div className="border border-border rounded-lg overflow-hidden">
                  {/* Header (desktop) */}
                  <div className="hidden md:grid grid-cols-[36px_1.4fr_1fr_0.8fr_1fr_0.8fr_0.8fr_0.6fr_96px] bg-muted/50 border-b border-border">
                    <div className="px-3 py-2 flex items-center justify-center border-r border-border">
                      <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-primary transition-colors">
                        {allSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                      </button>
                    </div>
                    {([
                      ["Name", "name"], ["Activity", "activity"], ["Stage", "stage"], ["Tags", null],
                      ["Last contacted", "contacted"], ["Follow-up", "followup"], ["Deal", "deal"], ["", null],
                    ] as [string, SortKey | null][]).map(([col, sk], i) => (
                      <div
                        key={`h-${i}`}
                        onClick={sk ? () => handleSort(sk) : undefined}
                        className={cn(
                          "px-3 py-2 text-[9px] uppercase tracking-widest text-muted-foreground border-r border-border last:border-r-0",
                          sk && "cursor-pointer hover:text-foreground select-none"
                        )}
                      >
                        {col}{sk && sortArrow(sk)}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="max-h-[640px] overflow-y-auto">
                    {isLoading ? (
                      <div className="p-4 space-y-2">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="p-10 text-center text-sm text-muted-foreground">
                        {contacts.length === 0
                          ? "No contacts yet — add one or import a CSV to get started."
                          : "No contacts match your filters."}
                      </div>
                    ) : (
                      filtered.map((c) => {
                        const isChecked = selectionSet.has(c.id);
                        const stage = stageMeta(c.pipeline_stage);
                        const overdue = c.next_followup_at && isPast(new Date(c.next_followup_at)) && !isToday(new Date(c.next_followup_at));
                        return (
                          <React.Fragment key={c.id}>
                            {/* Desktop row */}
                            <div
                              className={cn(
                                "hidden md:grid grid-cols-[36px_2.4fr_0.8fr_0.85fr_1.35fr_0.7fr_0.6fr_0.4fr_84px] border-b border-border last:border-b-0 transition-colors group cursor-pointer",
                                isChecked ? "bg-primary/5" : "hover:bg-muted/40"
                              )}
                              onClick={() => setSlideOverContact(c)}
                            >
                              <div className="px-3 py-2.5 flex items-center justify-center border-r border-border" onClick={(e) => e.stopPropagation()}>
                                <button onClick={(e) => toggleRow(c.id, e)} className="text-muted-foreground hover:text-primary transition-colors">
                                  {isChecked ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                                </button>
                              </div>

                              {/* Name, with company or title beneath so the column
                                  that used to hold company can show arrival time. */}
                              <div className="px-3 py-2.5 flex flex-col justify-center overflow-hidden">
                                <span className="text-sm font-medium truncate" title={fullName(c)}>
                                  {isNew(c) && (
                                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-label="New" />
                                  )}
                                  {fullName(c)}
                                </span>
                                {(c.company || c.title) && (
                                  <span className="text-[10px] truncate" title={c.company ?? c.title ?? undefined}>
                                    <span className="text-sky-600">{c.company}</span>
                                    {c.company && c.title && <span className="text-muted-foreground"> · </span>}
                                    <span className="text-muted-foreground">{c.title}</span>
                                  </span>
                                )}
                              </div>

                              {/* Activity: when anything last happened with this
                                  contact, which for a lead is its submission. */}
                              <div className="px-3 py-2.5 flex items-center border-l border-border">
                                <span
                                  className={cn("text-[10px] truncate", isNew(c) ? "text-primary font-semibold" : "text-muted-foreground")}
                                  title={[
                                    c.created_at ? `Added ${new Date(c.created_at).toLocaleString()}` : null,
                                    c.updated_at ? `Updated ${new Date(c.updated_at).toLocaleString()}` : null,
                                  ].filter(Boolean).join(" · ")}
                                >
                                  {activityAt(c)
                                    ? formatDistanceToNow(new Date(activityAt(c) as string), { addSuffix: true })
                                    : "—"}
                                </span>
                              </div>

                              {/* Stage */}
                              <div className="px-3 py-2.5 flex items-center border-l border-border">
                                {stage ? (
                                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap", stage.bg, stage.color)}>
                                    {stage.emoji} {stage.label}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40">—</span>
                                )}
                              </div>

                              {/* Tags */}
                              <div className="px-3 py-2.5 flex items-center gap-1 overflow-hidden border-l border-border">
                                {(c.tags ?? []).slice(0, 2).map((t) => (
                                  <span
                                    key={t}
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white truncate max-w-[130px] shrink-0"
                                    style={{ background: tagColorMap.get(t) ?? "#6366f1" }}
                                    title={t}
                                  >{t}</span>
                                ))}
                                {(c.tags ?? []).length > 2 && (
                                  <span className="text-[9px] text-muted-foreground">+{(c.tags ?? []).length - 2}</span>
                                )}
                                {(c.tags ?? []).length === 0 && <span className="text-[10px] text-muted-foreground/40">—</span>}
                              </div>

                              {/* Last contacted */}
                              <div className="px-3 py-2.5 flex items-center border-l border-border">
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {c.last_contacted_at
                                    ? formatDistanceToNow(new Date(c.last_contacted_at), { addSuffix: true })
                                    : "Never"}
                                </span>
                              </div>

                              {/* Follow-up */}
                              <div className="px-3 py-2.5 flex items-center border-l border-border">
                                {c.next_followup_at ? (
                                  <span className={cn(
                                    "text-[10px] flex items-center gap-1 whitespace-nowrap",
                                    overdue ? "text-red-600 font-semibold" : "text-muted-foreground"
                                  )}>
                                    <CalendarClock size={10} />
                                    {format(new Date(c.next_followup_at), "MMM d")}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40">—</span>
                                )}
                              </div>

                              {/* Deal */}
                              <div className="px-3 py-2.5 flex items-center border-l border-border">
                                {c.deal_value != null && c.deal_value > 0 ? (
                                  <span className="text-[10px] font-semibold text-emerald-600">{fmtMoney(c.deal_value)}</span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40">—</span>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="px-1.5 py-2.5 flex items-center justify-center gap-0.5 border-l border-border" onClick={(e) => e.stopPropagation()}>
                                {/* Quick tag */}
                                <Popover
                                  open={quickTagOpen === c.id}
                                  onOpenChange={(o) => {
                                    setQuickTagOpen(o ? c.id : null);
                                    if (!o) setQuickTagQuery("");
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Add tag"
                                    >
                                      <Tag size={11} />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48 p-2 space-y-1.5" align="end" side="bottom">
                                    <input
                                      autoFocus
                                      value={quickTagQuery}
                                      onChange={(e) => setQuickTagQuery(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        const opts = tagDefs.filter(
                                          (d) => !(c.tags ?? []).includes(d.name) &&
                                            (!quickTagQuery || d.name.toLowerCase().includes(quickTagQuery.toLowerCase()))
                                        );
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          if (opts[0]) { quickAddTag(c, opts[0].name); setQuickTagOpen(null); setQuickTagQuery(""); }
                                          else if (quickTagQuery.trim()) { quickAddTag(c, quickTagQuery.trim()); setQuickTagOpen(null); setQuickTagQuery(""); }
                                        }
                                        if (e.key === "Escape") { setQuickTagOpen(null); setQuickTagQuery(""); }
                                      }}
                                      placeholder="Search or create…"
                                      className="w-full h-7 text-xs bg-muted/50 border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                                      {tagDefs
                                        .filter((d) => !(c.tags ?? []).includes(d.name) && (!quickTagQuery || d.name.toLowerCase().includes(quickTagQuery.toLowerCase())))
                                        .map((d) => (
                                          <button
                                            key={d.id}
                                            onClick={(e) => { e.stopPropagation(); quickAddTag(c, d.name); setQuickTagOpen(null); setQuickTagQuery(""); }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left"
                                          >
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                                            {d.name}
                                          </button>
                                        ))}
                                      {quickTagQuery.trim() && !tagDefs.some((d) => d.name.toLowerCase() === quickTagQuery.toLowerCase()) && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); quickAddTag(c, quickTagQuery.trim()); setQuickTagOpen(null); setQuickTagQuery(""); }}
                                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left text-primary"
                                        >
                                          <Plus size={10} className="shrink-0" />
                                          Create <strong className="ml-0.5">"{quickTagQuery.trim()}"</strong>
                                        </button>
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                {!c.pipeline_stage && (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-emerald-600"
                                    onClick={(e) => handleAddToPipeline(c, e)}
                                    title="Add to pipeline"
                                    disabled={updateContact.isPending}
                                  >
                                    <PlusCircle size={11} />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  onClick={(e) => openEdit(c, e)}
                                  title="Edit contact"
                                >
                                  <Pencil size={11} />
                                </Button>
                                {canDeleteContacts && (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                    onClick={(e) => handleDelete(c.id, e)}
                                    title="Delete contact"
                                  >
                                    <Trash2 size={11} />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Mobile card */}
                            <div
                              className="flex md:hidden items-center justify-between px-3 py-3 cursor-pointer hover:bg-muted/50 border-b border-border last:border-b-0"
                              onClick={() => setSlideOverContact(c)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <button onClick={(e) => toggleRow(c.id, e)} className="shrink-0 text-muted-foreground">
                                  {isChecked ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                                </button>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{fullName(c)}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {[c.title, c.company].filter(Boolean).join(" · ") || c.email}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {stage && (
                                      <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", stage.bg, stage.color)}>
                                        {stage.emoji} {stage.label}
                                      </span>
                                    )}
                                    {overdue && (
                                      <span className="text-[9px] font-semibold text-red-600 flex items-center gap-0.5">
                                        <CalendarClock size={9} /> Overdue
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-muted-foreground shrink-0 ml-2" />
                            </div>
                          </React.Fragment>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>{/* end main content */}
            </div>{/* end flex layout */}
          </TabsContent>

          {/* ── Follow-ups tab ────────────────────────────────────── */}
          <TabsContent value="followups">
            <div className="max-w-3xl space-y-6">
              <FollowUpSection
                title="Overdue"
                emptyText="Nothing overdue — great job staying on top of it."
                contacts={followUps.overdue}
                accent
                tagColorMap={tagColorMap}
                onSelect={setSlideOverContact}
                onDone={markFollowUpDone}
              />
              <FollowUpSection
                title="Upcoming"
                emptyText="No follow-ups scheduled. Open a contact and set a follow-up date to see it here."
                contacts={followUps.upcoming}
                tagColorMap={tagColorMap}
                onSelect={setSlideOverContact}
                onDone={markFollowUpDone}
              />
            </div>
          </TabsContent>

          {/* ── Research tab ─────────────────────────────────────── */}
          <TabsContent value="research">
            <ResearchQueue contacts={contacts} />
          </TabsContent>

          {/* ── Pipeline tab ─────────────────────────────────────── */}
          <TabsContent value="pipeline">
            <PipelineView
              contacts={inPipeline}
              onSelect={setSlideOverContact}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Contact slide-over */}
      <ContactSlideOver
        contact={slideOverContact}
        onClose={() => setSlideOverContact(null)}
        onUpdate={(updates) => {
          if (!updates) return;
          setSlideOverContact((prev) => (prev ? { ...prev, ...updates } : prev));
        }}
      />

      <ContactFormModal
        open={formOpen}
        contact={editTarget}
        onClose={closeForm}
        onSave={handleSave}
        saving={addContact.isPending || updateContact.isPending}
      />
    </AppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StageChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs rounded-full border transition-colors font-medium whitespace-nowrap",
        active
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-transparent border-border text-muted-foreground hover:border-primary hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}

function FollowUpSection({
  title, emptyText, contacts, accent, tagColorMap, onSelect, onDone,
}: {
  title: string;
  emptyText: string;
  contacts: ImportedContact[];
  accent?: boolean;
  tagColorMap: Map<string, string>;
  onSelect: (c: ImportedContact) => void;
  onDone: (c: ImportedContact, e: React.MouseEvent) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-semibold flex items-center gap-2", accent && contacts.length > 0 && "text-red-600")}>
        <CalendarClock size={14} />
        {title}
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full",
          accent && contacts.length > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
        )}>
          {contacts.length}
        </span>
      </h3>
      <div className="border border-border rounded-lg overflow-hidden">
        {contacts.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">{emptyText}</div>
        ) : (
          contacts.map((c) => {
            const stage = stageMetaLocal(c.pipeline_stage);
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/40 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company || c.email}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {c.company && <span className="text-xs text-sky-600 truncate">{c.company}</span>}
                    {stage && (
                      <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", stage.bg, stage.color)}>
                        {stage.emoji} {stage.label}
                      </span>
                    )}
                    {(c.tags ?? []).slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white"
                        style={{ background: tagColorMap.get(t) ?? "#6366f1" }}
                      >{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {c.deal_value != null && c.deal_value > 0 && (
                    <span className="text-xs font-semibold text-emerald-600 hidden sm:flex items-center gap-0.5">
                      <DollarSign size={11} />{new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(c.deal_value)}
                    </span>
                  )}
                  <div className="text-right">
                    <p className={cn("text-xs font-medium whitespace-nowrap", accent ? "text-red-600" : "text-foreground")}>
                      {format(new Date(c.next_followup_at!), "MMM d, yyyy")}
                    </p>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(c.next_followup_at!), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={(e) => onDone(c, e)}
                    title="Mark done — sets last contacted to now and clears the follow-up"
                  >
                    <CheckCircle2 size={12} /> Done
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function stageMetaLocal(key: string | null | undefined) {
  return PIPELINE_STAGES.find((s) => s.key === key) ?? null;
}

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub: string; accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 relative overflow-hidden group">
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-2xl font-bold leading-none", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
