import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Users, Pencil, ChevronRight, ArrowLeft, Trash2, UserPlus, Search, Link2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useImportedContacts } from "@/hooks/useContacts";
import {
  useCcsClients, useSaveCcsClient, useDeleteCcsClient, useImportContactAsClient, type CcsClient,
} from "@/hooks/useCcs";

const EMPTY: Partial<CcsClient> = {
  company_name: "", primary_contact_name: "", primary_contact_email: "", phone: "",
  billing_contact_name: "", billing_contact_email: "", address: "", notes: "",
};

export default function CcsClients() {
  const { data: clients = [], isLoading } = useCcsClients();
  const save = useSaveCcsClient();
  const del = useDeleteCcsClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<CcsClient>>(EMPTY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CcsClient | null>(null);

  const openNew = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (c: CcsClient) => { setForm(c); setOpen(true); };
  const set = (k: keyof CcsClient, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.company_name?.trim()) { toast({ title: "Company name is required", variant: "destructive" }); return; }
    try {
      await save.mutateAsync({ id: form.id, ...form, company_name: form.company_name! });
      toast({ title: form.id ? "Client updated" : "Client created" });
      setOpen(false);
    } catch (e) {
      toast({ title: "Could not save client", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast({ title: "Client deleted" });
    } catch (e) {
      toast({ title: "Could not delete", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <Link to="/ccs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><Users size={22} /> Clients</h1>
            <p className="mt-1 text-sm text-muted-foreground">{clients.length} client{clients.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPickerOpen(true)}><UserPlus size={16} className="mr-1.5" /> Import from CRM</Button>
            <Button onClick={openNew}><Plus size={16} className="mr-1.5" /> New client</Button>
          </div>
        </header>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : clients.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No clients yet.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" onClick={() => setPickerOpen(true)}><UserPlus size={16} className="mr-1.5" /> Import from CRM</Button>
                <Button onClick={openNew}><Plus size={16} className="mr-1.5" /> New client</Button>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Primary contact</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Added</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to={`/ccs/clients/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.company_name}</Link>
                      {c.contact_id && <span className="ml-2 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"><Link2 size={10} /> CRM</span>}
                      {c.status === "archived" && <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-500">Archived</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {c.primary_contact_name || "—"}
                      {c.primary_contact_email ? <span className="block text-xs">{c.primary_contact_email}</span> : null}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">{format(new Date(c.created_at), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 size={14} /></Button>
                        <Link to={`/ccs/clients/${c.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Edit client" : "New client"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Company name" required>
              <Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Co." />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary contact"><Input value={form.primary_contact_name ?? ""} onChange={(e) => set("primary_contact_name", e.target.value)} /></Field>
              <Field label="Contact email"><Input type="email" value={form.primary_contact_email ?? ""} onChange={(e) => set("primary_contact_email", e.target.value)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Billing contact"><Input value={form.billing_contact_name ?? ""} onChange={(e) => set("billing_contact_name", e.target.value)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billing email"><Input type="email" value={form.billing_contact_email ?? ""} onChange={(e) => set("billing_contact_email", e.target.value)} /></Field>
              <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            </div>
            <Field label="Notes"><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save client"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from CRM */}
      <ContactPicker open={pickerOpen} onOpenChange={setPickerOpen} existing={clients} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.company_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the client and all of its projects, acknowledgment requests, responses, and signed records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ContactPicker({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: CcsClient[] }) {
  const { data: contacts = [], isLoading } = useImportedContacts();
  const importContact = useImportContactAsClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const linkedContactIds = useMemo(() => new Set(existing.map((c) => c.contact_id).filter(Boolean)), [existing]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => {
      const hay = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase();
      return !term || hay.includes(term);
    }).slice(0, 50);
  }, [contacts, q]);

  const doImport = async (c: (typeof contacts)[number]) => {
    try {
      await importContact.mutateAsync({ id: c.id, first_name: c.first_name, last_name: c.last_name, company: c.company, email: c.email, phone: c.phone });
      toast({ title: `Added ${c.company || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "client"} to Collaboration` });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not import", description: String((e as Error).message), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader><DialogTitle>Bring a client from CRM</DialogTitle></DialogHeader>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name, company, or email…" className="pl-9" />
        </div>
        <div className="mt-2 max-h-[52vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No matching contacts.</p>
          ) : filtered.map((c) => {
            const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
            const linked = linkedContactIds.has(c.id);
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.company || name || c.email || "Contact"}</p>
                  <p className="truncate text-xs text-muted-foreground">{[name, c.email].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {linked ? (
                  <span className="shrink-0 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">Added</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => doImport(c)} disabled={importContact.isPending}>Add</Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
    </div>
  );
}
