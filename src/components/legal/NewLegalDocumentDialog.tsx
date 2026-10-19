import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2, Lock, PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import LegalPartiesForm, {
  detailFieldsOf, FieldInput, fieldProblem, partiesProblems, type PartyDraft,
} from "@/components/legal/LegalPartiesForm";
import { useLegalActions } from "@/hooks/useLegalSigns";
import { useToast } from "@/hooks/use-toast";
import { NO_CLIENT, type SessionClient } from "@/lib/photo-sessions/clients";
import { fieldDefaults, LEGAL_TEMPLATES, legalTemplate, signerRolesFor, type LegalLanguage } from "@/lib/legal/templates";
import { listNames } from "@/lib/legal/status";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TEMPLATE = LEGAL_TEMPLATES.find((template) => template.available)!.key;

interface NewLegalDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (id: string) => void;
}

export default function NewLegalDocumentDialog({ open, onOpenChange, onSent }: NewLegalDocumentDialogProps) {
  const { toast } = useToast();
  const { send } = useLegalActions();
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE);
  const [language, setLanguage] = useState<LegalLanguage>("en");
  const [client, setClient] = useState<SessionClient>(NO_CLIENT);
  const [companyName, setCompanyName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [parties, setParties] = useState<PartyDraft[]>([]);
  const [tried, setTried] = useState(false);
  const [view, setView] = useState<"details" | "preview">("details");
  const formRef = useRef<HTMLDivElement>(null);

  const template = legalTemplate(templateKey)!;

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setTemplateKey(DEFAULT_TEMPLATE);
    setLanguage("en");
    setClient(NO_CLIENT);
    setCompanyName("");
    setValues(fieldDefaults(legalTemplate(DEFAULT_TEMPLATE)!));
    setParties([]);
    setTried(false);
    setView("details");
  }, [open]);

  // A template's starting values fill in whatever is still empty.
  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    const next = legalTemplate(key)!;
    const defaults = fieldDefaults(next);
    setValues((current) => ({ ...defaults, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value.trim())) }));
    // Only the NDAs take more parties; the others drop them.
    setParties((current) => current.slice(0, next.maxAdditionalParties ?? 0));
  };

  const renderInput = useMemo(() => ({
    language, companyName, signerName: client.name, recipientEmail: client.email, values,
    additionalParties: parties.map((party) => ({
      signerName: party.client.name, signerEmail: party.client.email, companyName: party.companyName, values: party.values,
    })),
  }), [language, companyName, client.name, client.email, values, parties]);
  const blocks = useMemo(() => template.render(renderInput), [template, renderInput]);
  const signerRoles = signerRolesFor(template, renderInput);
  const signerNames = [client.name, ...parties.map((party) => party.client.name)].map((name) => name.trim());
  const signerEmails = [client.email, ...parties.map((party) => party.client.email)].map((email) => email.trim().toLowerCase()).filter((email) => EMAIL.test(email));

  const problems = useMemo(() => {
    const list = partiesProblems(template, client, values, parties);
    const details = fieldProblem(detailFieldsOf(template), values);
    if (details) list.details = details;
    return list;
  }, [client, template, values, parties]);
  const ready = Object.keys(problems).length === 0;

  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setTried(true);
    if (!ready) {
      setView("details");
      // The first problem may be scrolled out of view, above the fields being filled in.
      requestAnimationFrame(() => formRef.current?.querySelector("p.text-destructive")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    // Only this template's fields travel with the document.
    const fieldValues = Object.fromEntries(template.fields.map((field) => [field.key, values[field.key]?.trim() ?? ""]).filter(([, value]) => value));
    try {
      const result = await send.mutateAsync({
        templateKey, language, values: fieldValues,
        signers: [
          { client, companyName },
          ...parties.map((party) => ({ client: party.client, companyName: party.companyName, partyValues: party.values })),
        ],
        content: {
          blocks, signerRole: signerRoles[0], ...(parties.length ? { signerRoles } : {}),
          countersignerRole: template.countersignerRole[language],
        },
      });
      toast(result.failed?.length
        ? { title: "Sent, but not to everyone", description: `The email to ${result.failed.join(", ")} didn't go out. Use Send again on the document.`, variant: "destructive" }
        : { title: "Sent for signature", description: `${listNames(signerNames)} will get an email with a link to sign.` });
      onOpenChange(false);
      onSent(result.id);
    } catch (error) {
      toast({ title: "Not sent", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>Each party signs online with their own link. You countersign, and everyone gets the signed PDF.</DialogDescription>
        </DialogHeader>

        <div className="flex border-b px-5 py-2 lg:hidden" role="tablist" aria-label="Document view">
          {(["details", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium",
                view === option ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {option === "details" ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {option === "details" ? "Details" : "Preview"}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div ref={formRef} className={cn("min-h-0 space-y-6 overflow-y-auto px-5 py-5 sm:px-6", view === "preview" && "hidden lg:block")}>
            <section className="space-y-2">
              <Label>Document</Label>
              <div className="grid gap-2">
                {LEGAL_TEMPLATES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!option.available}
                    onClick={() => chooseTemplate(option.key)}
                    aria-pressed={templateKey === option.key}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      templateKey === option.key ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                      !option.available && "cursor-not-allowed opacity-60 hover:bg-transparent",
                    )}
                  >
                    <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2", templateKey === option.key ? "border-primary bg-primary" : "border-muted-foreground/40")} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {option.name.en}
                        {!option.available && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.available ? option.description.en : "Waiting for its approved wording"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label>Language of the document</Label>
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                {(["en", "es"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={language === option}
                    onClick={() => setLanguage(option)}
                    className={cn(
                      "rounded px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      language === option ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option === "en" ? "English" : "Spanish"}
                  </button>
                ))}
              </div>
              {language === "es" && !template.spanishApproved && (
                <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The Spanish text is a translation that a bilingual lawyer hasn't reviewed yet.
                </p>
              )}
            </section>

            <LegalPartiesForm
              template={template}
              language={language}
              signerRoles={signerRoles}
              client={client}
              onClientChange={setClient}
              companyName={companyName}
              onCompanyChange={setCompanyName}
              values={values}
              onValueChange={setValue}
              parties={parties}
              onPartiesChange={setParties}
              problems={tried ? problems : null}
            />

            <section className="space-y-4">
              <Label>Details</Label>
              {detailFieldsOf(template).map((field) => (
                <FieldInput key={field.key} id={`legal-field-${field.key}`} field={field} language={language}
                  value={values[field.key] ?? ""} onChange={(next) => setValue(field.key, next)} />
              ))}
              {tried && problems.details && <p className="text-xs text-destructive">{problems.details}</p>}
            </section>
          </div>

          <div className={cn("min-h-0 overflow-y-auto bg-muted/40 px-4 py-5 sm:px-6 lg:border-l", view === "details" && "hidden lg:block")}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What {parties.length ? "every party" : client.name.trim() || "the recipient"} will sign
            </p>
            <LegalDocumentView blocks={blocks} />
            <div className="mt-4 grid gap-3 rounded-lg border border-dashed bg-background/60 p-4 text-sm sm:grid-cols-2">
              {signerRoles.map((role, index) => (
                <div key={index}>
                  <p className="text-xs font-medium text-muted-foreground">{role}</p>
                  <p className="mt-1">{signerNames[index] || (index ? "Signer" : "Recipient")} signs{parties.length ? "" : " first"}</p>
                </div>
              ))}
              <div>
                <p className="text-xs font-medium text-muted-foreground">{template.countersignerRole[language]} · LV Branding LLC</p>
                <p className="mt-1">You countersign {parties.length ? "once everyone has signed" : "after"}</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {signerEmails.length
              ? <>Emails a personal signing link to <span className="font-medium text-foreground">{listNames(signerEmails)}</span>. {signerEmails.length > 1 ? "They work" : "It works"} for 30 days.</>
              : "The signing link is emailed to the recipient."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={send.isPending || !template.available}>
              {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send for signature
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
