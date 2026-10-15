import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2, Lock, PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import SessionClientFields from "@/components/photo-sessions/SessionClientFields";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { useImportedContacts } from "@/hooks/useContacts";
import { useLegalActions } from "@/hooks/useLegalSigns";
import { useToast } from "@/hooks/use-toast";
import { NO_CLIENT, type SessionClient } from "@/lib/photo-sessions/clients";
import {
  LEGAL_TEMPLATES, legalTemplate, missingLegalFields, signerRoleFor, type LegalLanguage,
} from "@/lib/legal/templates";
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
  const { data: contacts = [] } = useImportedContacts();
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE);
  const [language, setLanguage] = useState<LegalLanguage>("en");
  const [client, setClient] = useState<SessionClient>(NO_CLIENT);
  const [companyName, setCompanyName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
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
    setValues({});
    setTried(false);
    setView("details");
  }, [open]);

  // A chosen contact brings their company, unless one was already typed.
  useEffect(() => {
    if (!client.contactId) return;
    const company = contacts.find((contact) => contact.id === client.contactId)?.company?.trim();
    if (company) setCompanyName((current) => current || company);
  }, [client.contactId, contacts]);

  const blocks = useMemo(
    () => template.render({ language, companyName, signerName: client.name, values }),
    [template, language, companyName, client.name, values],
  );

  const problems = useMemo(() => {
    const list: Record<string, string> = {};
    if (!client.contactId && !client.adding) list.client = "Choose who signs, or add them";
    else if (!client.name.trim()) list.client = "Add the signer's name";
    if (!client.email.trim()) list.email = "The signing link goes to this email";
    else if (!EMAIL.test(client.email.trim())) list.email = "Check this email address";
    const missing = missingLegalFields(template, values, "en");
    if (missing.length) list.fields = `Fill in: ${missing.join(", ")}`;
    return list;
  }, [client, template, values]);
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
        templateKey, language, client, companyName, values: fieldValues,
        content: { blocks, signerRole: signerRoleFor(template, values, language), countersignerRole: template.countersignerRole[language] },
      });
      toast({ title: "Sent for signature", description: `${client.name.trim()} will get an email with a link to sign.` });
      onOpenChange(false);
      onSent(result.id);
    } catch (error) {
      toast({ title: "Not sent", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  const fieldId = (key: string) => `legal-field-${key}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>The recipient signs online first. You countersign, and both of you get the signed PDF.</DialogDescription>
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
                    onClick={() => setTemplateKey(option.key)}
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
                        {option.available ? option.description.en : "Waiting for LV Branding's approved NDA wording"}
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
              {language === "es" && (
                <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The Spanish text is a translation that a bilingual lawyer hasn't reviewed yet.
                </p>
              )}
            </section>

            <section className="space-y-4">
              <SessionClientFields
                idPrefix="legal"
                value={client}
                onChange={setClient}
                errors={tried ? { name: problems.client, email: problems.email } : null}
              />
              <div className="space-y-1.5">
                <Label htmlFor="legal-company">Company</Label>
                <Input id="legal-company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="The client's company, if any" />
              </div>
            </section>

            <section className="space-y-4">
              {template.fields.map((field) => {
                const label = (
                  <Label htmlFor={fieldId(field.key)}>
                    {field.label.en}{field.required && <span className="text-destructive"> *</span>}
                  </Label>
                );
                const hint = field.hint ? <p className="text-xs text-muted-foreground">{field.hint.en}</p> : null;
                if (field.type === "select") {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      {label}
                      <Select value={values[field.key] ?? ""} onValueChange={(next) => setValue(field.key, next)}>
                        <SelectTrigger id={fieldId(field.key)}><SelectValue placeholder="Choose" /></SelectTrigger>
                        <SelectContent>
                          {field.options!.map((option) => <SelectItem key={option.value} value={option.value}>{option.label.en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {hint}
                    </div>
                  );
                }
                return (
                  <div key={field.key} className="space-y-1.5">
                    {label}
                    {field.type === "textarea" ? (
                      <Textarea id={fieldId(field.key)} rows={3} value={values[field.key] ?? ""} placeholder={field.placeholder?.[language]} onChange={(event) => setValue(field.key, event.target.value)} />
                    ) : (
                      <Input id={fieldId(field.key)} type={field.type === "date" ? "date" : "text"} value={values[field.key] ?? ""} placeholder={field.placeholder?.[language]} onChange={(event) => setValue(field.key, event.target.value)} />
                    )}
                    {hint}
                  </div>
                );
              })}
              {tried && problems.fields && <p className="text-xs text-destructive">{problems.fields}</p>}
            </section>
          </div>

          <div className={cn("min-h-0 overflow-y-auto bg-muted/40 px-4 py-5 sm:px-6 lg:border-l", view === "details" && "hidden lg:block")}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">What {client.name.trim() || "the recipient"} will sign</p>
            <LegalDocumentView blocks={blocks} />
            <div className="mt-4 grid gap-3 rounded-lg border border-dashed bg-background/60 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{signerRoleFor(template, values, language)}</p>
                <p className="mt-1">{client.name.trim() || "Recipient"} signs first</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{template.countersignerRole[language]} · LV Branding LLC</p>
                <p className="mt-1">You countersign after</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {client.email.trim() && EMAIL.test(client.email.trim())
              ? <>Emails a personal signing link to <span className="font-medium text-foreground">{client.email.trim()}</span>. It works for 30 days.</>
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
