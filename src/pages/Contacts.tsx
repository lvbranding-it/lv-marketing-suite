import { useState, useMemo, useCallback } from "react";
import { Search, Trash2, Pencil, UserPlus, CheckSquare, Square, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import ContactDetailModal from "@/components/contacts/ContactDetailModal";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ProspectSearchPanel from "@/components/contacts/ProspectSearchPanel";
import ApolloPanel from "@/components/contacts/ApolloPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const { data: imported = [], isLoading } = useImportedContacts();
  const addContact    = useImportContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  // View state
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [selected, setSelected] = useState<Contact | null>(null);

  // Hidden static IDs (deleted locally)
  const [hiddenStaticIds, setHiddenStaticIds] = useState<Set<number>>(new Set());

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

    // Hide static contacts
    if (staticToHide.length) {
      setHiddenStaticIds((prev) => new Set([...prev, ...staticToHide]));
    }

    // Delete imported contacts from DB
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
    } as ImportedContact);
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditTarget(null); };

  const handleSave = async (values: Partial<ImportedContact>) => {
    if (editTarget && !editTarget.id.startsWith("static-")) {
      // Real DB contact — update
      await updateContact.mutateAsync({ id: editTarget.id, ...values });
      toast({ description: "Contact updated." });
    } else {
      // New contact or static-prefill — insert
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
  const signalCount = STATIC_CONTACTS.filter((c) => c.signals.length > 0).length;

  const indCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATIC_CONTACTS.forEach((c) => { counts[c.ind] = (counts[c.ind] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, []);
  const indMax = indCounts[0]?.[1] ?? 1;

  const sigCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATIC_CONTACTS.forEach((c) =>
      c.signals.forEach((s) => { counts[s] = (counts[s] ?? 0) + 1; })
    );
    return counts;
  }, []);
  const sigMax = Math.max(...Object.values(sigCounts), 1);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <Header title="Contacts" subtitle="Houston MSA · brand-ready decision makers" />

      <div className="p-6">
        <Tabs defaultValue="my-contacts">
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="my-contacts">
                My Contacts
                <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                  {STATIC_CONTACTS.length - hiddenStaticIds.size + imported.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="vibe">Find Prospects</TabsTrigger>
              <TabsTrigger value="apollo">Apollo CRM</TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={openAdd}>
              <UserPlus size={14} className="mr-1.5" />
              New Contact
            </Button>
          </div>

          {/* ── My Contacts ─────────────────────────────────────── */}
          <TabsContent value="my-contacts" className="space-y-6">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total contacts"  value={String(STATIC_CONTACTS.length - hiddenStaticIds.size + imported.length)} sub="Static + imported" />
              <StatCard label="Growth signals"  value={String(signalCount)} sub="New role · hiring · expansion" accent />
              <StatCard label="Industries"      value="11" sub="Across Houston metro" />
              <StatCard label="Imported"        value={String(imported.length)} sub="Via Vibe or Apollo" />
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
                <h3 className="text-sm font-semibold">
                  Imported ({imported.length})
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">via Vibe Prospecting or Apollo</span>
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  {isLoading ? (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : (
                    imported.map((c) => {
                      const key = c.id;
                      const isChecked = selectionSet.has(key);
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30"
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
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[9px]">{c.source}</Badge>
                            {c.email && <span className="text-[10px] text-primary hidden sm:block">{c.email}</span>}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={(e) => openEditImported(c, e)}
                              title="Edit contact"
                            >
                              <Pencil size={12} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) => handleDeleteImported(c.id, e)}
                              title="Delete contact"
                            >
                              <Trash2 size={12} />
                            </Button>
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
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
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
              <div className="grid grid-cols-[36px_36px_1fr_1fr_0.8fr_0.7fr_0.8fr_60px_72px] bg-muted/50 border-b border-border">
                {/* Select-all checkbox */}
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
              <div className="max-h-[520px] overflow-y-auto">
                {filtered.map((c) => {
                  const ind = IND_META[c.ind] ?? IND_META.biz;
                  const key = toStaticKey(c.id);
                  const isChecked = selectionSet.has(key);
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "grid grid-cols-[36px_36px_1fr_1fr_0.8fr_0.7fr_0.8fr_60px_72px] border-b border-border last:border-b-0 transition-colors group",
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={(e) => openEditStatic(c, e)}
                          title="Edit contact"
                        >
                          <Pencil size={11} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteStatic(c.id, e)}
                          title="Remove contact"
                        >
                          <Trash2 size={11} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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

      <ContactDetailModal contact={selected} onClose={() => setSelected(null)} />

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
