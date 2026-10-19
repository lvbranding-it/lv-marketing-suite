// Who signs a LegalSigns document, shared by New document and Edit parties:
// the main recipient and, on the NDAs, up to three more parties, each with
// the person who signs for them and their lines in the agreement.

import { useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import SessionClientFields from "@/components/photo-sessions/SessionClientFields";
import { useImportedContacts } from "@/hooks/useContacts";
import { NO_CLIENT, type SessionClient } from "@/lib/photo-sessions/clients";
import type { LegalField, LegalLanguage, LegalTemplate } from "@/lib/legal/templates";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNER_LABELS = { name: "Signer", email: "Signer email", newName: "Signer name" };

/** A party who signs besides the main recipient. signerId when it was already on the document. */
export interface PartyDraft {
  key: string;
  client: SessionClient;
  companyName: string;
  values: Record<string, string>;
}

export const newPartyDraft = (): PartyDraft => ({ key: crypto.randomUUID(), client: NO_CLIENT, companyName: "", values: {} });

/** The main recipient's lines in the agreement (NDAs), asked with who signs rather than with the details. */
export const partyFieldsOf = (template: LegalTemplate) => template.fields.filter((field) => field.group === "party");
/** The document's own details: everything else. */
export const detailFieldsOf = (template: LegalTemplate) => template.fields.filter((field) => field.group !== "party");

/** What is wrong with these fields' values: required ones left empty, then emails that aren't. */
export function fieldProblem(fields: LegalField[], values: Record<string, string>) {
  const missing = fields.filter((field) => field.required && !values[field.key]?.trim()).map((field) => field.label.en);
  if (missing.length) return `Fill in: ${missing.join(", ")}`;
  const bad = fields.filter((field) => field.type === "email" && values[field.key]?.trim() && !EMAIL.test(values[field.key].trim())).map((field) => field.label.en);
  return bad.length ? `Check: ${bad.join(", ")}` : "";
}

/** Problems with who signs, keyed main.name, main.email, main.fields, party0.name, and so on. */
export function partiesProblems(template: LegalTemplate, client: SessionClient, values: Record<string, string>, parties: PartyDraft[]) {
  const list: Record<string, string> = {};
  const seen = new Set<string>();
  const check = (prefix: string, signer: SessionClient, fields: LegalField[], fieldValues: Record<string, string>, main: boolean) => {
    if (!signer.contactId && !signer.adding) list[`${prefix}.name`] = "Choose who signs, or add them";
    else if (!signer.name.trim()) list[`${prefix}.name`] = "Add the signer's name";
    const email = signer.email.trim().toLowerCase();
    if (!email) list[`${prefix}.email`] = main ? "The signing link goes to this email" : "Their signing link goes to this email";
    else if (!EMAIL.test(email)) list[`${prefix}.email`] = "Check this email address";
    else if (seen.has(email)) list[`${prefix}.email`] = "Each party needs its own signer email";
    seen.add(email);
    const problem = fieldProblem(fields, fieldValues);
    if (problem) list[`${prefix}.fields`] = problem;
  };
  check("main", client, partyFieldsOf(template), values, true);
  parties.forEach((party, index) => check(`party${index}`, party.client, template.partyFields ?? [], party.values, false));
  return list;
}

/** One input for a template field, labelled in English, with its hint. */
export function FieldInput({ id, field, value, language, onChange }: {
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

interface PartyCardProps {
  idPrefix: string;
  title: string;
  language: LegalLanguage;
  client: SessionClient;
  companyName: string;
  fields: LegalField[];
  values: Record<string, string>;
  errors: { name?: string; email?: string; fields?: string } | null;
  onClient: (client: SessionClient) => void;
  onCompany: (companyName: string) => void;
  onValue: (key: string, value: string) => void;
  onRemove?: () => void;
}

/** A party: who signs for it, its company and its lines in the agreement. */
function PartyCard({ idPrefix, title, language, client, companyName, fields, values, errors, onClient, onCompany, onValue, onRemove }: PartyCardProps) {
  const { data: contacts = [] } = useImportedContacts();
  // A chosen contact brings their company, unless one was already typed.
  useEffect(() => {
    if (!client.contactId || companyName.trim()) return;
    const company = contacts.find((contact) => contact.id === client.contactId)?.company?.trim();
    if (company) onCompany(company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.contactId, contacts]);

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={onRemove} aria-label={`Remove ${title}`}>
            <X className="mr-1 h-3.5 w-3.5" />Remove
          </Button>
        )}
      </div>
      <SessionClientFields idPrefix={idPrefix} value={client} onChange={onClient} errors={errors} labels={SIGNER_LABELS} />
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-company`}>Company</Label>
        <Input id={`${idPrefix}-company`} value={companyName} placeholder="Their company, if any" onChange={(event) => onCompany(event.target.value)} />
      </div>
      {fields.map((field) => (
        <FieldInput key={field.key} id={`${idPrefix}-${field.key}`} field={field} language={language}
          value={values[field.key] ?? ""} onChange={(next) => onValue(field.key, next)} />
      ))}
      {errors?.fields && <p className="text-xs text-destructive">{errors.fields}</p>}
    </div>
  );
}

interface LegalPartiesFormProps {
  template: LegalTemplate;
  language: LegalLanguage;
  /** Each signer's role in the document ("Party 2 · Casa Melilla"), main recipient first. */
  signerRoles: string[];
  client: SessionClient;
  onClientChange: (client: SessionClient) => void;
  companyName: string;
  onCompanyChange: (companyName: string) => void;
  /** The document's values; the main recipient's party lines live here. */
  values: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
  parties: PartyDraft[];
  onPartiesChange: (update: (parties: PartyDraft[]) => PartyDraft[]) => void;
  /** From partiesProblems, once the person has tried to save. */
  problems: Record<string, string> | null;
}

export default function LegalPartiesForm({
  template, language, signerRoles, client, onClientChange, companyName, onCompanyChange,
  values, onValueChange, parties, onPartiesChange, problems,
}: LegalPartiesFormProps) {
  const max = template.maxAdditionalParties ?? 0;
  const roleLabel = (index: number) => signerRoles[index]?.split(" · ")[0] ?? "";
  // "Party 3", or "Receiving Party 2" on the One-way NDA, where every other
  // party shares the agreement's label: numbered on the form only.
  const title = (index: number) => {
    const label = roleLabel(index + 1) || `Party ${index + 3}`;
    return label === roleLabel(0) ? `${label} ${index + 2}` : label;
  };
  const errorsFor = (prefix: string) => (problems ? {
    name: problems[`${prefix}.name`], email: problems[`${prefix}.email`], fields: problems[`${prefix}.fields`],
  } : null);
  const update = (key: string, patch: Partial<PartyDraft>) =>
    onPartiesChange((current) => current.map((party) => (party.key === key ? { ...party, ...patch } : party)));

  return (
    <section className="space-y-3">
      <div>
        <Label>{max ? "Parties" : "Who signs"}</Label>
        {max > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Add up to {max} more companies or people. Each signs with their own link; you countersign once everyone has signed.
          </p>
        )}
      </div>
      <PartyCard
        idPrefix="legal-main"
        title={max ? (roleLabel(0) || "Recipient") : "Recipient"}
        language={language}
        client={client}
        companyName={companyName}
        fields={partyFieldsOf(template)}
        values={values}
        errors={errorsFor("main")}
        onClient={onClientChange}
        onCompany={onCompanyChange}
        onValue={onValueChange}
      />
      {parties.map((party, index) => (
        <PartyCard
          key={party.key}
          idPrefix={`legal-party-${party.key}`}
          title={title(index)}
          language={language}
          client={party.client}
          companyName={party.companyName}
          fields={template.partyFields ?? []}
          values={party.values}
          errors={errorsFor(`party${index}`)}
          onClient={(next) => update(party.key, { client: next })}
          onCompany={(next) => update(party.key, { companyName: next })}
          onValue={(key, next) => update(party.key, { values: { ...party.values, [key]: next } })}
          onRemove={() => onPartiesChange((current) => current.filter((item) => item.key !== party.key))}
        />
      ))}
      {parties.length < max && (
        <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => onPartiesChange((current) => [...current, newPartyDraft()])}>
          <Plus className="mr-2 h-4 w-4" />Add another party
        </Button>
      )}
    </section>
  );
}
