import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Trash2, Pencil, UserPlus, CheckSquare, Square, X, PlusCircle, ChevronRight, Tag, Plus, Upload, Loader2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import ContactDetailModal from "@/components/contacts/ContactDetailModal";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactSlideOver from "@/components/contacts/ContactSlideOver";
import PipelineView from "@/components/contacts/PipelineView";
import ResearchQueue from "@/components/contacts/ResearchQueue";
import ProspectSearchPanel from "@/components/contacts/ProspectSearchPanel";
import ApolloPanel from "@/components/contacts/ApolloPanel";
import TagSidebar from "@/components/contacts/TagSidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONTACTS as STATIC_CONTACTS,
  IND_META,
  SIGNALS,
  type Contact,
} from "@/data/contacts";
import {
  useImportedContacts,
  useImportContact,
  useUpdateContact,
  useDeleteContact,
  type ImportedContact,
} from "@/hooks/useContacts";
import { useContactTagDefinitions, useCreateTagDefinition, pickTagColor } from "@/hooks/useContactTags";
import { usePermissions } from "@/hooks/usePermissions";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseContactsCSV } from "@/lib/csvImport";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

type SortKey = "score" | "name" | "company";
type SortDir = 1 | -1;

// Static contacts use "s-{id}", imported contacts use their UUID
const toStaticKey = (id: number) => `s-${id}`;

const FILTER_TABS = [
  { key: "all",    label: "All" },
  { key: "re",     label: "Real Estate" },
  { key: "con",    label: "Construction" },
  { key: "law",    label: "Legal" },
  { key: "fin",    label: "Finance" },
  { key: "food",   label: "Food & Bev" },
  { key: "np",     label: "Nonprofit" },
  { key: "hos",    label: "Hospitality" },
  { key: "biz",    label: "Consulting" },
  { key: "events", label: "Events" },
  { key: "signal", label: "🔥 Signals" },
];

export default function Contacts() {
  const { toast } = useToast();
  const { canAddContacts, canDeleteContacts, isMember, isManager } = usePermissions();
  const { log } = useActivityLog();
  const { org } = useOrg();

  const { data: imported = [], isLoading } = useImportedContacts();
  const addContact    = useImportContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: tagDefs = [] } = useContactTagDefinitions();
  const createTagDef  = useCreateTagDefinition();

  // ── CSV Import ──────────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);

  const handleCSVImport = async (file: File) => {
    if (!org) return;
    setImporting(true);
    try {
      const text = await file.text();
      const contacts = parseContactsCSV(text);
      if (contacts.length === 0) {
        toast({ variant: "destructive", description: "No valid contacts found. Make sure the file has an Email column." });
        return;
      }

      // Auto-create any new tag definitions
      const allNewTags = Array.from(new Set(contacts.flatMap((c) => c.tags)));
      for (const tagName of allNewTags) {
        if (!tagDefs.some((d) => d.name === tagName)) {
          await supabase.from("contact_tag_definitions").insert({
            org_id: org.id, name: tagName,
            color: pickTagColor(tagDefs.map((d) => d.color)),
          });
        }
      }

      const rows = contacts.map((c) => ({
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
      }));

      const { error } = await supabase
        .from("contacts")
        .upsert(rows, { onConflict: "org_id,email" });

      if (error) throw error;
      toast({ description: `✓ ${contacts.length} contacts imported successfully.` });
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  // Quick-tag popover state: contactId → search query
  const [quickTagOpen, setQuickTagOpen]   = useState<string | null>(null);
  const [quickTagQuery, setQuickTagQuery] = useState("");

  const quickAddTag = async (contact: ImportedContact, tagName: string) => {
    const existing = contact.tags ?? [];
    if (existing.includes(tagName)) return;
    const newTags = [...existing, tagName];
    await updateContact.mutateAsync({ id: contact.id, tags: newTags });
    if (!tagDefs.some((d) => d.name === tagName)) {
      createTagDef.mutate({ name: tagName, color: pickTagColor(tagDefs.map((d) => d.color)) });
    }
  };

  // Tag color lookup
  const tagColorMap = useMemo(() => {
    const m = new Map<string, string>();
    tagDefs.forEach((d) => m.set(d.name, d.color));
    return m;
  }, [tagDefs]);

  // View state
  const [filter, setFilter]   = useState("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [selected, setSelected] = useState<Contact | null>(null);

  // Slide-over for imported contacts
  const [slideOverContact, setSlideOverContact] = useState<ImportedContact | null>(null);

  // Hidden static IDs — persisted in localStorage so deletions survive refresh
  const [hiddenStaticIds, setHiddenStaticIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("contacts:hiddenStaticIds");
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  // Keep localStorage in sync whenever hiddenStaticIds changes
  useEffect(() => {
    localStorage.setItem(
      "contacts:hiddenStaticIds",
      JSON.stringify(Array.from(hiddenStaticIds))
    );
  }, [hiddenStaticIds]);

  // Form modal
  const [formOpen, setFormOpen]       = useState(false);
  const [editTarget, setEditTarget]   = useState<ImportedContact | null>(null);

  // Bulk selection — keys: "s-{n}" for static, UUID for imported
  const [selectionSet, setSelectionSet] = useState<Set<string>>(new Set());

  // ── Filtered + sorted static contacts ───────────────────────────────────
  const filtered = useMemo(() => {
    return STATIC_CONTACTS
      .filter((c) => !hiddenStaticIds.has(c.id))
      .filter((c) => {
        const matchFilter =
          filter === "all"    ? true :
          filter === "signal" ? c.signals.length > 0 :
          c.ind === filter;
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          `${c.first} ${c.last}`.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q);
        return matchFilter && matchSearch;
      })
      .sort((a, b) => {
        if (sortKey === "name")    return sortDir * a.last.localeCompare(b.last);
        if (sortKey === "company") return sortDir * a.company.localeCompare(b.company);
        return sortDir * (b.score - a.score);
      });
  }, [filter, search, sortKey, sortDir, hiddenStaticIds]);

  // Imported contacts filtered by selected tag
  const filteredImported = useMemo(() => {
    if (!selectedTag) return imported;
    return imported.filter((c) => (c.tags ?? []).includes(selectedTag));
  }, [imported, selectedTag]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }
  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-muted-foreground/30 ml-0.5">↕</span>;
    return <span className="text-primary ml-0.5">{sortDir === 1 ? "↑" : "↓"}</span>;
  }

  // ── Selection helpers ───────────────────────────────────────────────────
  const allVisibleKeys = useMemo(() => {
    const staticKeys = filtered.map((c) => toStaticKey(c.id));
    const importedKeys = imported.map((c) => c.id);
    return [...importedKeys, ...staticKeys];
  }, [filtered, imported]);

  const allSelected = allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selectionSet.has(k));
  const someSelected = selectionSet.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectionSet(new Set());
    } else {
      setSelectionSet(new Set(allVisibleKeys));
    }
  };

  const toggleRow = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectionSet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ── Bulk delete ─────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const staticToHide: number[] = [];
    const importedToDelete: string[] = [];

    for (const key of selectionSet) {
      if (key.startsWith("s-")) {
        const id = parseInt(key.slice(2), 10);
        if (!isNaN(id)) staticToHide.push(id);
      } else {
        importedToDelete.push(key);
      }
    }

    if (staticToHide.length) {
      setHiddenStaticIds((prev) => new Set([...prev, ...staticToHide]));
    }

    for (const id of importedToDelete) {
      await deleteContact.mutateAsync(id);
    }

    const total = staticToHide.length + importedToDelete.length;
    toast({ description: `${total} contact${total !== 1 ? "s" : ""} deleted.` });
    setSelectionSet(new Set());
  };

  // ── Single-row delete ───────────────────────────────────────────────────
  const handleDeleteStatic = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenStaticIds((prev) => new Set([...prev, id]));
    setSelectionSet((prev) => { const n = new Set(prev); n.delete(toStaticKey(id)); return n; });
    toast({ description: "Contact removed." });
  };

  const handleDeleteImported = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteContact.mutateAsync(id);
    setSelectionSet((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast({ description: "Contact deleted." });
  };

  // ── Add to Pipeline (static contact → DB contact with pipeline_stage: lead) ──
  const handleAddToPipeline = async (c: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    await addContact.mutateAsync({
      first_name:      c.first,
      last_name:       c.last,
      title:           c.title,
      company:         c.company,
      email:           c.email !== "—" ? c.email : null,
      phone:           null,
      linkedin_url:    null,
      website:         null,
      city:            "Houston",
      state:           "TX",
      country:         "US",
      employees_range: null,
      fit_score:       c.score,
      industry:        c.ind,
      source:          "manual",
      source_id:       null,
      apollo_id:       null,
      signals:         c.signals,
      raw_data:        {},
      pipeline_stage:  "lead",
      deal_value:      null,
      deal_probability: null,
      last_contacted_at: null,
      next_followup_at: null,
      tags:            [],
      crm_notes:       null,
    });
    // Hide from static list
    setHiddenStaticIds((prev) => new Set([...prev, c.id]));
    toast({ description: `${c.first} ${c.last} added to pipeline.` });
  };

  // ── Form open/close helpers ─────────────────────────────────────────────
  const openAdd = () => { setEditTarget(null); setFormOpen(true); };

  const openEditImported = (c: ImportedContact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(c);
    setFormOpen(true);
  };

  const openEditStatic = (c: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget({
      id:              `static-${c.id}`,
      org_id:          "",
      first_name:      c.first,
      last_name:       c.last,
      title:           c.title,
      company:         c.company,
      email:           c.email !== "—" ? c.email : "",
      phone:           null,
      linkedin_url:    null,
      website:         null,
      city:            "Houston",
      state:           "TX",
      country:         "US",
      employees_range: null,
      fit_score:       c.score,
      industry:        c.ind,
      source:          "manual",
      source_id:       null,
      apollo_id:       null,
      signals:         c.signals,
      raw_data:        {},
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
      pipeline_stage:  "lead",
      deal_value:      null,
      deal_probability: null,
      last_contacted_at: null,
      next_followup_at: null,
      tags:            [],
      crm_notes:       null,
    } as ImportedContact);
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditTarget(null); };

  const handleSave = async (values: Partial<ImportedContact>) => {
    if (editTarget && !editTarget.id.startsWith("static-")) {
      await updateContact.mutateAsync({ id: editTarget.id, ...values });
      toast({ description: "Contact updated." });
      if (isMember || isManager) {
        log("edited_contact", "contact", editTarget.id,
          `${values.first_name ?? editTarget.first_name} ${values.last_name ?? editTarget.last_name}`.trim());
      }
    } else {
      await addContact.mutateAsync({
        ...values,
        source:    "manual",
        source_id: null,
        apollo_id: null,
        signals:   editTarget?.signals ?? [],
        raw_data:  {},
      } as Parameters<typeof addContact.mutateAsync>[0]);
      toast({ description: editTarget ? "Contact saved to your list." : "Contact added." });
    }
    closeForm();
  };

  // ── Stat helpers ────────────────────────────────────────────────────────
  const visibleStatic = useMemo(
    () => STATIC_CONTACTS.filter((c) => !hiddenStaticIds.has(c.id)),
    [hiddenStaticIds]
  );

  const signalCount = useMemo(() => {
    const fromStatic   = visibleStatic.filter((c) => c.signals.length > 0).length;
    const fromImported = imported.filter((c) => c.signals && c.signals.length > 0).length;
    return fromStatic + fromImported;
  }, [visibleStatic, imported]);

  const indCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleStatic.forEach((c) => { counts[c.ind] = (counts[c.ind] ?? 0) + 1; });
    imported.forEach((c) => {
      if (c.industry) { counts[c.industry] = (counts[c.industry] ?? 0) + 1; }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [visibleStatic, imported]);
  const indMax = indCounts[0]?.[1] ?? 1;

  const industryCount = indCounts.length;

  const sigCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleStatic.forEach((c) =>
      c.signals.forEach((s) => { counts[s] = (counts[s] ?? 0) + 1; })
    );
    imported.forEach((c) =>
      (c.signals ?? []).forEach((s) => { counts[s] = (counts[s] ?? 0) + 1; })
    );
    return counts;
  }, [visibleStatic, imported]);
  const sigMax = Math.max(...Object.values(sigCounts), 1);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <Header title="Contacts" subtitle="Houston MSA · brand-ready decision makers" />

      <div className="p-3 sm:p-6 pb-16">
        <Tabs defaultValue="my-contacts">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <div className="overflow-x-auto flex-1 min-w-0">
              <TabsList className="w-max">
                <TabsTrigger value="my-contacts">
                  <span className="hidden xs:inline">My </span>Contacts
                  <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                    {visibleStatic.length + imported.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="research">
                  Research
                  {imported.filter((c) => c.verification_status === "unverified").length > 0 && (
                    <span className="ml-1.5 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                      {imported.filter((c) => c.verification_status === "unverified").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pipeline">
                  Pipeline
                  <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                    {imported.filter((c) => c.verification_status === "verified").length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="vibe" className="hidden sm:flex">Find Prospects</TabsTrigger>
                <TabsTrigger value="apollo" className="hidden sm:flex">Apollo CRM</TabsTrigger>
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

          {/* ── My Contacts ─────────────────────────────────────── */}
          <TabsContent value="my-contacts">

            {/* Mobile tag strip — full-width row above content */}
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
            <div className="hidden lg:block w-48 shrink-0 sticky top-4">
              <div className="bg-card border border-border rounded-lg p-3 max-h-[80vh] overflow-y-auto">
                <TagSidebar
                  contacts={imported}
                  selectedTag={selectedTag}
                  onSelectTag={setSelectedTag}
                />
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Total contacts" value={String(visibleStatic.length + imported.length)} sub={`${visibleStatic.length} Houston · ${imported.length} imported`} />
              <StatCard label="Growth signals" value={String(signalCount)} sub="New role · hiring · expansion" accent />
              <StatCard label="Industries"     value={String(industryCount)} sub="Unique sectors represented" />
              <StatCard label="Imported"       value={String(imported.length)} sub="Via Vibe or Apollo" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Contacts by industry</p>
                <div className="space-y-2">
                  {indCounts.map(([ind, cnt]) => {
                    const m = IND_META[ind] ?? IND_META.biz;
                    return (
                      <div key={ind} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-24 text-right shrink-0 truncate">{m.label}</span>
                        <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
                          <div className="h-full rounded-sm" style={{ width: `${Math.round((cnt / indMax) * 100)}%`, background: m.color }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-5 shrink-0">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Growth signals</p>
                <div className="space-y-3">
                  {SIGNALS.map((s) => {
                    const cnt = sigCounts[s.id] ?? 0;
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-[10px] text-muted-foreground flex-1 truncate">{s.label}</span>
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round((cnt / sigMax) * 100)}%`, background: s.color }} />
                        </div>
                        <span className="text-xs font-semibold text-foreground w-5 text-right shrink-0">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Imported contacts */}
            {(isLoading || imported.length > 0) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {selectedTag ? (
                    <>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: tagColorMap.get(selectedTag) ?? "#6366f1" }}
                      />
                      {selectedTag}
                      <span className="text-muted-foreground font-normal text-[11px]">({filteredImported.length})</span>
                      <button
                        onClick={() => setSelectedTag(null)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      ><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <Tag size={13} className="text-muted-foreground" />
                      Imported ({imported.length})
                      <span className="text-[10px] font-normal text-muted-foreground">via Vibe Prospecting or Apollo</span>
                    </>
                  )}
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  {isLoading ? (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : filteredImported.length === 0 && selectedTag ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No contacts with tag <strong>{selectedTag}</strong> yet.
                    </div>
                  ) : (
                    filteredImported.map((c) => {
                      const key = c.id;
                      const isChecked = selectionSet.has(key);
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setSlideOverContact(c)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Checkbox */}
                            <button
                              onClick={(e) => toggleRow(key, e)}
                              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            >
                              {isChecked
                                ? <CheckSquare size={15} className="text-primary" />
                                : <Square size={15} />}
                            </button>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {c.first_name} {c.last_name}
                                <span className="ml-2 text-[10px] text-muted-foreground font-normal">{c.title}</span>
                              </p>
                              <p className="text-xs text-sky-500 truncate">{c.company}</p>
                              {/* Tag chips */}
                              {(c.tags ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(c.tags ?? []).map((t) => (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white"
                                      style={{ background: tagColorMap.get(t) ?? "#6366f1" }}
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[9px] hidden sm:inline-flex">{c.source}</Badge>
                            {c.email && <span className="text-[10px] text-primary hidden sm:block">{c.email}</span>}
                            {/* Quick tag button */}
                            <Popover
                              open={quickTagOpen === c.id}
                              onOpenChange={(o) => {
                                setQuickTagOpen(o ? c.id : null);
                                if (!o) setQuickTagQuery("");
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-muted-foreground hover:text-primary text-[11px] gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Tag size={11} />
                                  <span className="hidden md:inline">Tag</span>
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
                                    const filtered = tagDefs.filter(
                                      (d) => !(c.tags ?? []).includes(d.name) &&
                                        (!quickTagQuery || d.name.toLowerCase().includes(quickTagQuery.toLowerCase()))
                                    );
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      if (filtered[0]) { quickAddTag(c, filtered[0].name); setQuickTagOpen(null); setQuickTagQuery(""); }
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
                                    ))
                                  }
                                  {quickTagQuery.trim() && !tagDefs.some((d) => d.name.toLowerCase() === quickTagQuery.toLowerCase()) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); quickAddTag(c, quickTagQuery.trim()); setQuickTagOpen(null); setQuickTagQuery(""); }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left text-primary"
                                    >
                                      <Plus size={10} className="shrink-0" />
                                      Create <strong className="ml-0.5">"{quickTagQuery.trim()}"</strong>
                                    </button>
                                  )}
                                  {tagDefs.filter((d) => !(c.tags ?? []).includes(d.name)).length === 0 && !quickTagQuery && (
                                    <p className="text-[11px] text-muted-foreground text-center py-2">All tags already applied</p>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={(e) => openEditImported(c, e)}
                              title="Edit contact"
                            >
                              <Pencil size={12} />
                            </Button>
                            {canDeleteContacts && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hidden sm:inline-flex"
                                onClick={(e) => handleDeleteImported(c.id, e)}
                                title="Delete contact"
                              >
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Filter + search */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "px-3 py-1 text-xs rounded-sm border transition-colors font-medium",
                      filter === key
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-transparent border-border text-muted-foreground hover:border-primary hover:text-primary"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, company, title, email…"
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* Bulk action bar */}
            {someSelected && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
                <span className="text-sm font-medium text-primary">
                  {selectionSet.size} contact{selectionSet.size !== 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectionSet(new Set())}
                  >
                    <X size={12} className="mr-1" />
                    Clear
                  </Button>
                  {canDeleteContacts && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleBulkDelete}
                      disabled={deleteContact.isPending}
                    >
                      <Trash2 size={12} className="mr-1" />
                      Delete {selectionSet.size} selected
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Showing <span className="text-foreground font-medium">{filtered.length}</span> contacts</span>
              <span>Hover a row to edit or delete · click to expand</span>
            </div>

            {/* Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="hidden md:grid grid-cols-[36px_36px_1fr_1fr_0.8fr_0.7fr_0.8fr_60px_100px] bg-muted/50 border-b border-border">
                <div className="px-3 py-2 flex items-center justify-center border-r border-border">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {allSelected
                      ? <CheckSquare size={14} className="text-primary" />
                      : <Square size={14} />}
                  </button>
                </div>
                {(["#", "Name", "Title", "Company", "Industry", "Email", "Signal", ""] as const).map((col, i) => {
                  const sortMap: Record<string, SortKey> = { Name: "name", Company: "company" };
                  const sk = sortMap[col] as SortKey | undefined;
                  return (
                    <div
                      key={`h-${i}`}
                      onClick={sk ? () => handleSort(sk) : undefined}
                      className={cn(
                        "px-3 py-2 text-[9px] uppercase tracking-widest text-muted-foreground border-r border-border last:border-r-0",
                        sk && "cursor-pointer hover:text-foreground select-none",
                        i === 0 && "text-center"
                      )}
                    >
                      {col}{sk && sortArrow(sk)}
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="max-h-[640px] overflow-y-auto">
                {filtered.map((c) => {
                  const ind = IND_META[c.ind] ?? IND_META.biz;
                  const key = toStaticKey(c.id);
                  const isChecked = selectionSet.has(key);
                  return (
                    <React.Fragment key={c.id}>
                    <div
                      className={cn(
                        "hidden md:grid grid-cols-[36px_36px_1fr_1fr_0.8fr_0.7fr_0.8fr_60px_100px] border-b border-border last:border-b-0 transition-colors group",
                        isChecked ? "bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      {/* Row checkbox */}
                      <div className="px-3 py-2.5 flex items-center justify-center border-r border-border">
                        <button
                          onClick={(e) => toggleRow(key, e)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          {isChecked
                            ? <CheckSquare size={13} className="text-primary" />
                            : <Square size={13} />}
                        </button>
                      </div>

                      {/* # */}
                      <div
                        className="px-3 py-2.5 flex items-center justify-center text-[10px] text-muted-foreground/50 cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        {c.id}
                      </div>

                      {/* Name */}
                      <div
                        className="px-3 py-2.5 flex items-center text-sm font-medium overflow-hidden cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        <span className="truncate">{c.first} {c.last}</span>
                      </div>

                      {/* Title */}
                      <div
                        className="px-3 py-2.5 flex items-center text-xs text-muted-foreground overflow-hidden border-l border-border cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        <span className="truncate">{c.title}</span>
                      </div>

                      {/* Company */}
                      <div
                        className="px-3 py-2.5 flex items-center overflow-hidden border-l border-border cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        <span className="truncate text-xs text-sky-500">{c.company}</span>
                      </div>

                      {/* Industry */}
                      <div
                        className="px-3 py-2.5 flex items-center border-l border-border cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        <span className={cn("text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm border truncate", ind.bgClass, ind.textClass, ind.borderClass)}>
                          {ind.label}
                        </span>
                      </div>

                      {/* Email */}
                      <div
                        className="px-3 py-2.5 flex items-center overflow-hidden border-l border-border cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        {c.email !== "—"
                          ? <span className="truncate text-[10px] text-primary">{c.email}</span>
                          : <span className="text-[10px] text-muted-foreground/40">—</span>}
                      </div>

                      {/* Signal */}
                      <div
                        className="px-3 py-2.5 flex items-center border-l border-border cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        {c.signals.length > 0 ? (
                          <span className="flex items-center gap-1 text-[9px] text-primary border border-primary/30 bg-primary/5 px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {c.signals.length}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-1.5 py-2.5 flex items-center justify-center gap-0.5 border-l border-border">
                        {canAddContacts && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-emerald-600"
                            onClick={(e) => handleAddToPipeline(c, e)}
                            title="Add to pipeline"
                            disabled={addContact.isPending}
                          >
                            <PlusCircle size={11} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={(e) => openEditStatic(c, e)}
                          title="Edit contact"
                        >
                          <Pencil size={11} />
                        </Button>
                        {canDeleteContacts && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDeleteStatic(c.id, e)}
                            title="Remove contact"
                          >
                            <Trash2 size={11} />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Mobile card — only visible below md */}
                    <div
                      className="flex md:hidden items-center justify-between px-3 py-3 cursor-pointer hover:bg-muted/50 border-b border-border"
                      onClick={() => setSelected(c)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {`${c.first[0] ?? ""}${c.last[0] ?? ""}`.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.first} {c.last}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.title} · {c.company}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {c.signals.length > 0 && (
                          <span className="flex items-center gap-1 text-[9px] text-primary border border-primary/30 bg-primary/5 px-1.5 py-0.5 rounded-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {c.signals.length}
                          </span>
                        )}
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            </div>{/* end main content */}
          </div>{/* end flex layout */}
          </TabsContent>

          {/* ── Research Queue ────────────────────────────────────── */}
          <TabsContent value="research">
            <ResearchQueue contacts={imported} />
          </TabsContent>

          {/* ── Pipeline ─────────────────────────────────────────── */}
          <TabsContent value="pipeline">
            <PipelineView
              contacts={imported.filter((c) => c.verification_status === "verified" || !c.verification_status)}
              onSelect={setSlideOverContact}
            />
          </TabsContent>

          {/* ── Vibe Prospecting ─────────────────────────────────── */}
          <TabsContent value="vibe">
            <ProspectSearchPanel />
          </TabsContent>

          {/* ── Apollo CRM ───────────────────────────────────────── */}
          <TabsContent value="apollo">
            <ApolloPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Static contact detail modal */}
      <ContactDetailModal contact={selected} onClose={() => setSelected(null)} />

      {/* Imported contact slide-over */}
      <ContactSlideOver
        contact={slideOverContact}
        onClose={() => setSlideOverContact(null)}
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
