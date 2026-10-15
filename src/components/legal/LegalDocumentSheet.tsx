import { useEffect, useState } from "react";
import {
  Ban, CheckCircle2, Clock3, Download, FileText, Loader2, Mail, PenLine, RefreshCw, ShieldAlert,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import LegalStageBadge from "@/components/legal/LegalStageBadge";
import SignaturePad from "@/components/legal/SignaturePad";
import { useAuth } from "@/hooks/useAuth";
import { useLegalActions, useLegalEvents, type LegalDocument, type LegalEvent } from "@/hooks/useLegalSigns";
import { useToast } from "@/hooks/use-toast";
import { deviceName, eventLabel, legalStage } from "@/lib/legal/status";
import { signatureReady, type LegalSignature } from "@/lib/legal/signature";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(iso));

function SignatureShown({ signature }: { signature: LegalSignature }) {
  return (
    <div className="flex h-16 items-end rounded-md border bg-white px-3 pb-2">
      {signature.type === "draw"
        ? <img src={signature.value} alt="Drawn signature" className="max-h-12 max-w-full object-contain" />
        : <span className="truncate text-2xl italic text-[#1c1a1b]">{signature.value}</span>}
    </div>
  );
}

/** Sent, signed by the recipient, countersigned: the order a document goes through. */
function Steps({ doc }: { doc: LegalDocument }) {
  const steps = [
    { label: "Sent", at: doc.sent_at, detail: doc.recipient_email },
    { label: "Signed by the recipient", at: doc.client_signed_at, detail: doc.client_signer_name ? `as ${doc.client_signer_name}` : doc.viewed_at ? `Opened ${when(doc.viewed_at)}` : "" },
    { label: "Countersigned and completed", at: doc.completed_at, detail: doc.lv_signer_name ? `by ${doc.lv_signer_name}` : "" },
  ];
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const done = !!step.at;
        return (
          <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 && <span className={cn("absolute left-[9px] top-5 h-[calc(100%-1rem)] w-px", done ? "bg-emerald-500/60" : "bg-border")} />}
            <span className={cn("relative mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-2", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/30 bg-background")}>
              {done && <CheckCircle2 className="h-3 w-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{step.label}</p>
              <p className="truncate text-xs text-muted-foreground">{[step.at && when(step.at), step.detail].filter(Boolean).join(" · ")}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Activity({ events }: { events: LegalEvent[] }) {
  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn("font-medium", event.event === "email_mismatch" && "text-amber-700 dark:text-amber-400")}>{eventLabel(event.event)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(event.created_at)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[event.event !== "email_mismatch" && event.actor_label, event.ip, deviceName(event.user_agent)].filter(Boolean).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CountersignDialog({ doc, open, onOpenChange }: { doc: LegalDocument; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { countersign } = useLegalActions();
  const defaultName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState<LegalSignature | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setTitle("");
    setSignature(null);
    setAgreed(false);
  }, [open, defaultName]);

  const ready = name.trim().length >= 2 && signatureReady(signature) && agreed;

  const submit = async () => {
    if (!ready || !signature) return;
    try {
      const result = await countersign.mutateAsync({ id: doc.id, signerName: name.trim(), signerTitle: title.trim(), signature });
      toast(result.emailed
        ? { title: "Completed", description: `The signed PDF is saved here and emailed to ${doc.recipient_name} and you.` }
        : { title: "Completed, but an email didn't go out", description: "The signed PDF is saved here. Download it and send it yourself.", variant: "destructive" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Not countersigned", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !countersign.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Countersign {doc.title}</DialogTitle>
          <DialogDescription>
            Signs for LV Branding LLC as {doc.content.countersignerRole}. The signed PDF is then saved here and emailed to {doc.recipient_name} and you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="countersign-name">Your full name</Label>
              <Input id="countersign-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="countersign-title">Your title</Label>
              <Input id="countersign-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Creative Director" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Signature</Label>
            <SignaturePad value={signature} onChange={setSignature} defaultName={name} />
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>I agree to sign this document electronically for LV Branding LLC, and that my electronic signature is as binding as a handwritten one.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={countersign.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || countersign.isPending}>
            {countersign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
            Countersign and complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LegalDocumentSheetProps {
  doc: LegalDocument | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

export default function LegalDocumentSheet({ doc, onOpenChange, canManage }: LegalDocumentSheetProps) {
  const { toast } = useToast();
  const actions = useLegalActions();
  const events = useLegalEvents(doc?.id ?? null);
  const [countersignOpen, setCountersignOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  useEffect(() => {
    setCountersignOpen(false);
    setVoidOpen(false);
    setVoidReason("");
  }, [doc?.id]);

  const run = async (work: Promise<unknown>, done: string) => {
    try {
      await work;
      if (done) toast({ title: done });
    } catch (error) {
      toast({ title: "That didn't work", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  const stage = doc ? legalStage(doc) : null;

  return (
    <Sheet open={!!doc} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {doc && stage && (
          <>
            <SheetHeader className="space-y-2 border-b px-5 py-4 pr-12 text-left">
              <LegalStageBadge stage={stage} />
              <SheetTitle className="text-balance">{doc.title}</SheetTitle>
              <SheetDescription>
                {doc.recipient_name}{doc.company_name ? ` · ${doc.company_name}` : ""} · {doc.language === "es" ? "Spanish" : "English"}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {stage === "countersign" && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium">{doc.client_signer_name} signed {when(doc.client_signed_at!)}.</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">Your signature completes it and sends both sides the signed PDF.</p>
                  {canManage ? (
                    <Button className="mt-3" onClick={() => setCountersignOpen(true)}><PenLine className="mr-2 h-4 w-4" />Countersign</Button>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">An owner, administrator or manager countersigns.</p>
                  )}
                </div>
              )}
              {stage === "expired" && (
                <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p>The signing link expired {when(doc.expires_at)}. Sending it again emails a new link that works for 30 days.</p>
                </div>
              )}
              {stage === "voided" && (
                <div className="flex gap-2.5 rounded-lg border bg-muted/50 p-4 text-sm">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p>Voided {doc.voided_at && when(doc.voided_at)}. The signing link no longer opens it.{doc.void_reason && <> Reason: {doc.void_reason}</>}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {stage === "completed" && (
                  <Button onClick={() => run(actions.download.mutateAsync(doc.id), "")} disabled={actions.download.isPending}>
                    {actions.download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download signed PDF
                  </Button>
                )}
                {canManage && (stage === "waiting" || stage === "expired") && (
                  <Button variant="outline" onClick={() => run(actions.resend.mutateAsync(doc.id), `Sent again to ${doc.recipient_email}`)} disabled={actions.resend.isPending}>
                    {actions.resend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Send again
                  </Button>
                )}
                {canManage && stage !== "completed" && stage !== "voided" && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setVoidOpen(true)}>
                    <Ban className="mr-2 h-4 w-4" />Void
                  </Button>
                )}
              </div>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</h3>
                <Steps doc={doc} />
              </section>

              {(doc.client_signature || doc.lv_signature) && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {doc.client_signature && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{doc.content.signerRole}</p>
                      <SignatureShown signature={doc.client_signature} />
                      <p className="text-xs">{doc.client_signer_name}{doc.client_signer_title ? `, ${doc.client_signer_title}` : ""}</p>
                    </div>
                  )}
                  {doc.lv_signature && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{doc.content.countersignerRole} · LV Branding LLC</p>
                      <SignatureShown signature={doc.lv_signature} />
                      <p className="text-xs">{doc.lv_signer_name}{doc.lv_signer_title ? `, ${doc.lv_signer_title}` : ""}</p>
                    </div>
                  )}
                </section>
              )}

              <Accordion type="multiple" className="rounded-lg border px-4">
                <AccordionItem value="document">
                  <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />Read the document</span></AccordionTrigger>
                  <AccordionContent><LegalDocumentView blocks={doc.content.blocks} className="px-4 py-6 sm:px-6" /></AccordionContent>
                </AccordionItem>
                <AccordionItem value="activity" className="border-b-0">
                  <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><Mail className="h-4 w-4" />Activity and audit trail</span></AccordionTrigger>
                  <AccordionContent>
                    {events.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Activity events={events.data ?? []} />}
                    {(events.data ?? []).some((event) => event.event === "email_mismatch") && (
                      <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Someone with the link typed an email that isn't the recipient's. After 8 tries in an hour the link pauses for that hour.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <CountersignDialog doc={doc} open={countersignOpen} onOpenChange={setCountersignOpen} />
            <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Void {doc.title}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {doc.recipient_name}'s link stops working and the document can't be signed or completed. It stays in LegalSigns, marked voided.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="void-reason">Reason (optional, for your records)</Label>
                  <Textarea id="void-reason" rows={2} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => run(actions.void.mutateAsync({ id: doc.id, reason: voidReason.trim() }), "Document voided")}
                  >
                    Void document
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
