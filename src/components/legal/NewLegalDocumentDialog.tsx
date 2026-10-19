import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2, Lock, PencilLine, Plus, Send, X } from "lucide-react";
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
  fieldDefaults, LEGAL_TEMPLATES, legalTemplate, missingLegalFields, missingPartyFields, signerRolesFor,
  type LegalField, type LegalLanguage, type LegalTemplate,
} from "@/lib/legal/templates";
import { listNames } from "@/lib/legal/status";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TEMPLATE = LEGAL_TEMPLATES.find((template) => template.available)!.key;

/** A party who signs besides the main recipient (NDAs). */
interface ExtraParty {
  key: string;
  client: SessionClient;
  companyName: string;
  values: Record<string, string>;
}

const newParty = (): ExtraParty => ({ key: crypto.randomUUID(), client: NO_CLIENT, companyName: "", values: {} });

/** One input for a template field, labelled in English, with its hint. */
function FieldInput({ id, field, value, language, onChange }: {
  id: string; field: LegalField; value: string; language: LegalLanguage; onChange: (value: string) => void;
}) {
  const label = (
    <Label htmlFor={id}>
      {field.label.en}{field.required && <span className="text-destructive"> *</span>}
    </Label>
  );
  const hint = field.hint ? <p className="text-xs text-muted-foreground">{field.hint.en}</p> : null;
  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        {label}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {field.options!.map((option) => <SelectItem key={option.value} value={option.value}>{option.label.en}</SelectItem>)}
          </SelectContent>
        </Select>
        {hint}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {label}
      {field.type === "textarea" ? (
        <Textarea id={id} rows={3} value={value} placeholder={field.placeholder?.[language]} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} type={field.type === "date" || field.type === "email" ? field.type : "text"} value={value} placeholder={field.placeholder?.[language]} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint}
    </div>
  );
}

/** An additional party: who signs for it, its company and its lines in the agreement. */
function ExtraPartyCard({ party, title, template, language, errors, onChange, onRemove }: {
  party: ExtraParty; title: string; template: LegalTemplate; language: LegalLanguage;
  errors: { name?: string; email?: string; fields?: string } | null;
  onChange: (party: ExtraParty) => void; onRemove: () => void;
}) {
  const { data: contacts = [] } = useImportedContacts();
  // A chosen contact brings their company, unless one was already typed.
  useEffect(() => {
    if (!party.client.contactId || party.companyName.trim()) return;
    const company = contacts.find((contact) => contact.id === party.client.contactId)?.company?.trim();
    if (company) onChange({ ...party, companyName: company });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.client.contactId, contacts]);

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={onRemove} aria-label={`Remove ${title}`}>
          <X className="mr-1 h-3.5 w-3.5" />Remove
        </Button>
      </div>
      <SessionClientFields
        idPrefix={`legal-party-${party.key}`}
        value={party.client}
        onChange={(client) => onChange({ ...party, client })}
        errors={errors}
        labels={{ name: "Signer", email: "Signer email", newName: "Signer name" }}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`legal-party-${party.key}-company`}>Company</Label>
        <Input id={`legal-party-${party.key}-company`} value={party.companyName} placeholder="Their company, if any"
          onChange={(event) => onChange({ ...party, companyName: event.target.value })} />
      </div>
      {(template.partyFields ?? []).map((field) => (
        <FieldInput key={field.key} id={`legal-party-${party.key}-${field.key}`} field={field} language={language}
          value={party.values[field.key] ?? ""} onChange={(next) => onChange({ ...party, values: { ...party.values, [field.key]: next } })} />
      ))}
      {errors?.fields && <p className="text-xs text-destructive">{errors.fields}</p>}
    </div>
  );
}

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
  const [parties, setParties] = useState<ExtraParty[]>([]);
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
  const maxParties = template.maxAdditionalParties ?? 0;

  // A chosen contact brings their company, unless one was already typed.
  useEffect(() => {
    if (!client.contactId) return;
    const company = contacts.find((contact) => contact.id === client.contactId)?.company?.trim();
    if (company) setCompanyName((current) => current || company);
  }, [client.contactId, contacts]);

  const renderInput = useMemo(() => ({
    language, companyName, signerName: client.name, recipientEmail: client.email, values,
    additionalParties: parties.map((party) => ({
      signerName: party.client.name, signerEmail: party.client.email, companyName: party.companyName, values: party.values,
    })),
  }), [language, companyName, client.name, client.email, values, parties]);
  const blocks = useMemo(() => template.render(renderInput), [template, renderInput]);
  const signerRoles = signerRolesFor(template, renderInput);
  // "Party 3", or "Receiving Party 2" on the One-way NDA, where every other
  // party shares the agreement's label: numbered on the form only.
  const partyTitle = (index: number) => {
    const label = signerRoles[index + 1]?.split(" · ")[0] ?? `Party ${index + 3}`;
    return label === signerRoles[0]?.split(" · ")[0] ? `${label} ${index + 2}` : label;
  };
  const signerNames = [client.name, ...parties.map((party) => party.client.name)].map((name) => name.trim());
  const signerEmails = [client.email, ...parties.map((party) => party.client.email)].map((email) => email.trim()).filter((email) => EMAIL.test(email));

  const problems = useMemo(() => {
    const list: Record<string, string> = {};
    if (!client.contactId && !client.adding) list.client = "Choose who signs, or add them";
    else if (!client.name.trim()) list.client = "Add the signer's name";
    if (!client.email.trim()) list.email = "The signing link goes to this email";
    else if (!EMAIL.test(client.email.trim())) list.email = "Check this email address";
    const missing = missingLegalFields(template, values, "en");
    const badEmails = template.fields
      .filter((field) => field.type === "email" && values[field.key]?.trim() && !EMAIL.test(values[field.key].trim()))
      .map((field) => field.label.en);
    if (missing.length) list.fields = `Fill in: ${missing.join(", ")}`;
    else if (badEmails.length) list.fields = `Check: ${badEmails.join(", ")}`;
    const seen = new Set([client.email.trim().toLowerCase()]);
    parties.forEach((party, index) => {
      const prefix = `party${index}`;
      if (!party.client.contactId && !party.client.adding) list[`${prefix}.name`] = "Choose who signs, or add them";
      else if (!party.client.name.trim()) list[`${prefix}.name`] = "Add the signer's name";
      const email = party.client.email.trim().toLowerCase();
      if (!email) list[`${prefix}.email`] = "Their signing link goes to this email";
      else if (!EMAIL.test(email)) list[`${prefix}.email`] = "Check this email address";
      else if (seen.has(email)) list[`${prefix}.email`] = "Each party needs its own signer email";
      seen.add(email);
      const partyMissing = missingPartyFields(template, party.values, "en");
      const partyBad = (template.partyFields ?? [])
        .filter((field) => field.type === "email" && party.values[field.key]?.trim() && !EMAIL.test(party.values[field.key].trim()))
        .map((field) => field.label.en);
      if (partyMissing.length) list[`${prefix}.fields`] = `Fill in: ${partyMissing.join(", ")}`;
      else if (partyBad.length) list[`${prefix}.fields`] = `Check: ${partyBad.join(", ")}`;
    });
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
        signers: [{ client, companyName }, ...parties.map((party) => ({ client: party.client, companyName: party.companyName }))],
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

  const fieldId = (key: string) => `legal-field-${key}`;
  const partyErrors = (index: number) => (tried ? {
    name: problems[`party${index}.name`], email: problems[`party${index}.email`], fields: problems[`party${index}.fields`],
  } : null);

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
              {template.fields.map((field) => (
                <FieldInput key={field.key} id={fieldId(field.key)} field={field} language={language}
                  value={values[field.key] ?? ""} onChange={(next) => setValue(field.key, next)} />
              ))}
              {tried && problems.fields && <p className="text-xs text-destructive">{problems.fields}</p>}
            </section>

            {maxParties > 0 && (
              <section className="space-y-3">
                <div>
                  <Label>Other parties</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add up to {maxParties} more companies or people. Each signs with their own link; you countersign once everyone has signed.
                  </p>
                </div>
                {parties.map((party, index) => (
                  <ExtraPartyCard
                    key={party.key}
                    party={party}
                    title={partyTitle(index)}
                    template={template}
                    language={language}
                    errors={partyErrors(index)}
                    onChange={(next) => setParties((current) => current.map((item) => (item.key === party.key ? next : item)))}
                    onRemove={() => setParties((current) => current.filter((item) => item.key !== party.key))}
                  />
                ))}
                {parties.length < maxParties && (
                  <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setParties((current) => [...current, newParty()])}>
                    <Plus className="mr-2 h-4 w-4" />Add another party
                  </Button>
                )}
              </section>
            )}
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
