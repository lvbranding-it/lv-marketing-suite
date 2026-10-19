// Editing a sent document before anyone signs, on two screens: Parties (who
// signs, each party's lines, adding or removing parties) and Document (its
// details, and its wording when that must change). The document is made again
// from its template, so the parties block always matches the parties; saving
// sends everyone a new link.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Eye, FileText, Loader2, RotateCcw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import LegalPartiesForm, {
  detailFieldsOf, FieldInput, fieldProblem, partiesProblems, type PartyDraft,
} from "@/components/legal/LegalPartiesForm";
import { useLegalActions, type LegalDocument } from "@/hooks/useLegalSigns";
import { useToast } from "@/hooks/use-toast";
import type { SessionClient } from "@/lib/photo-sessions/clients";
import { applyWording, hasCustomWording, wordingOf } from "@/lib/legal/editing";
import { listNames } from "@/lib/legal/status";
import { legalTemplate, signerRolesFor, type LegalBlock, type LegalRenderInput } from "@/lib/legal/templates";
import { cn } from "@/lib/utils";

export type EditScreen = "parties" | "document";

interface Props {
  doc: LegalDocument;
  open: boolean;
  screen: EditScreen;
  onOpenChange: (open: boolean) => void;
}

const asClient = (contactId: string | null, name: string, email: string): SessionClient =>
  ({ contactId, name, email, adding: !contactId });

const BLOCK_LABEL: Record<LegalBlock["kind"], string> = { title: "Title", heading: "Heading", paragraph: "Paragraph", meta: "Detail" };

export default function EditLegalDocumentDialog({ doc, open, screen: initialScreen, onOpenChange }: Props) {
  const { revise } = useLegalActions();
  const { toast } = useToast();
  const template = legalTemplate(doc.template_key);
  const [screen, setScreen] = useState<EditScreen>(initialScreen);
  const [view, setView] = useState<"form" | "preview">("form");
  const [title, setTitle] = useState(doc.title);
  const [client, setClient] = useState<SessionClient>(asClient(null, "", ""));
  const [companyName, setCompanyName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [parties, setParties] = useState<PartyDraft[]>([]);
  // Reworded text over the template's, or null to follow the template.
  const [wording, setWording] = useState<LegalBlock[] | null>(null);
  const [wordingOpen, setWordingOpen] = useState(false);
  const [wordingSetAside, setWordingSetAside] = useState(false);
  const [startedCustom, setStartedCustom] = useState(false);
  const [tried, setTried] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const inputFrom = (state: {
    client: SessionClient; companyName: string; values: Record<string, string>; parties: PartyDraft[];
  }): LegalRenderInput => ({
    language: doc.language, companyName: state.companyName, signerName: state.client.name, recipientEmail: state.client.email,
    values: state.values,
    additionalParties: state.parties.map((party) => ({
      signerName: party.client.name, signerEmail: party.client.email, companyName: party.companyName, values: party.values,
    })),
  });

  // The document as it stands, each time the dialog opens.
  useEffect(() => {
    if (!open || !template) return;
    const [main, ...others] = doc.signers;
    const start = {
      client: asClient(main?.contact_id ?? doc.contact_id, main?.name ?? doc.recipient_name, main?.email ?? doc.recipient_email),
      companyName: main?.company_name ?? doc.company_name,
      values: Object.fromEntries(Object.entries(doc.field_values ?? {}).map(([key, value]) => [key, String(value ?? "")])),
      parties: others.map((signer) => ({
        key: signer.id, client: asClient(signer.contact_id, signer.name, signer.email),
        companyName: signer.company_name, values: { ...(signer.party_values ?? {}) },
      })),
    };
    const custom = hasCustomWording(template.render(inputFrom(start)), doc.content.blocks);
    setScreen(initialScreen);
    setView("form");
    setTitle(doc.title);
    setClient(start.client);
    setCompanyName(start.companyName);
    setValues(start.values);
    setParties(start.parties);
    setWording(custom ? wordingOf(doc.content.blocks).map((block) => ({ ...block })) : null);
    setStartedCustom(custom);
    setWordingOpen(false);
    setWordingSetAside(false);
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc.id]);

  const renderInput = useMemo(() => inputFrom({ client, companyName, values, parties }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, companyName, values, parties, doc.language]);
  const rendered = useMemo(() => template?.render(renderInput) ?? doc.content.blocks, [template, renderInput, doc.content.blocks]);
  const { blocks, fits } = applyWording(rendered, wording);
  const signerRoles = template ? signerRolesFor(template, renderInput) : [doc.content.signerRole];

  // A detail that adds or removes a section leaves reworded text without a place.
  useEffect(() => {
    if (wording && !fits) {
      setWording(null);
      setWordingSetAside(true);
    }
  }, [wording, fits]);

  const problems = useMemo(() => {
    if (!template) return {};
    const list = partiesProblems(template, client, values, parties);
    const details = fieldProblem(detailFieldsOf(template), values);
    if (details) list.details = details;
    if (!title.trim()) list.title = "Give the document a name";
    if (blocks.some((block) => !block.text.trim())) list.wording = "Every section needs its text";
    return list;
  }, [template, client, values, parties, title, blocks]);
  const partiesWrong = Object.keys(problems).some((key) => key.startsWith("main.") || key.startsWith("party"));
  const documentWrong = ["details", "title", "wording"].some((key) => problems[key]);

  const signers = [
    { name: client.name, email: client.email },
    ...parties.map((party) => ({ name: party.client.name, email: party.client.email })),
  ];
  const emails = signers.map((signer) => signer.email.trim().toLowerCase()).filter(Boolean);
  const before = JSON.stringify([doc.title, doc.content.blocks, doc.signers.map((signer) => [signer.name, signer.email, signer.company_name])]);
  const after = JSON.stringify([title.trim(), blocks, [
    [client.name.trim(), client.email.trim().toLowerCase(), companyName.trim()],
    ...parties.map((party) => [party.client.name.trim(), party.client.email.trim().toLowerCase(), party.companyName.trim()]),
  ]]);
  const changed = before !== after;

  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!template) return;
    setTried(true);
    if (Object.keys(problems).length) {
      setScreen(partiesWrong ? "parties" : "document");
      setView("form");
      requestAnimationFrame(() => formRef.current?.querySelector("p.text-destructive")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    const fieldValues = Object.fromEntries(template.fields.map((field) => [field.key, values[field.key]?.trim() ?? ""]).filter(([, value]) => value));
    try {
      const result = await revise.mutateAsync({
        id: doc.id,
        title: title.trim(),
        content: {
          blocks, signerRole: signerRoles[0], ...(signerRoles.length > 1 ? { signerRoles } : {}),
          countersignerRole: template.countersignerRole[doc.language],
        },
        fieldValues,
        signers: [
          { client, companyName },
          ...parties.map((party) => ({ client: party.client, companyName: party.companyName, partyValues: party.values })),
        ],
      });
      toast(result.emailed
        ? { title: "Changes sent", description: `A new signing link went to ${listNames(emails)}. Earlier links no longer work.` }
        : {
          title: "Changes saved, but an email didn't go out",
          description: `${result.failed?.length ? `The email to ${listNames(result.failed)} failed. ` : ""}Earlier links no longer work. Use Send again to deliver new ones.`,
          variant: "destructive",
        });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Changes not saved", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  const tab = (option: EditScreen, label: string, Icon: typeof Users, wrong: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={screen === option}
      onClick={() => { setScreen(option); setView("form"); }}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        screen === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />{label}
      {tried && wrong && <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-label="Needs attention" />}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !revise.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="space-y-3 border-b px-5 py-4 sm:px-6">
          <div>
            <DialogTitle>Edit {doc.title}</DialogTitle>
            <DialogDescription>Change who signs or what the document says, before anyone signs. Saving sends everyone a new link.</DialogDescription>
          </div>
          <div className="flex rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="What to edit">
            {tab("parties", "Parties", Users, partiesWrong)}
            {tab("document", "Document", FileText, documentWrong)}
          </div>
        </DialogHeader>

        {!template ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">This document's template is no longer in LegalSigns, so it can't be edited. Void it and send a new one.</p>
        ) : (
          <>
            <div className="flex border-b px-5 py-2 lg:hidden" role="tablist" aria-label="Form or preview">
              {(["form", "preview"] as const).map((option) => (
                <button key={option} type="button" role="tab" aria-selected={view === option} onClick={() => setView(option)}
                  className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium",
                    view === option ? "bg-muted text-foreground" : "text-muted-foreground")}>
                  {option === "form" ? (screen === "parties" ? "Parties" : "Document") : <><Eye className="h-3.5 w-3.5" />Preview</>}
                </button>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
              <div ref={formRef} className={cn("min-h-0 space-y-6 overflow-y-auto px-5 py-5 sm:px-6", view === "preview" && "hidden lg:block")}>
                {screen === "parties" ? (
                  <LegalPartiesForm
                    template={template}
                    language={doc.language}
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
                ) : (
                  <>
                    <section className="space-y-1.5">
                      <Label htmlFor="edit-title">Document name</Label>
                      <Input id="edit-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
                      <p className="text-xs text-muted-foreground">Used in the emails and the PDF's file name.</p>
                      {tried && problems.title && <p className="text-xs text-destructive">{problems.title}</p>}
                    </section>

                    {detailFieldsOf(template).length > 0 && (
                      <section className="space-y-4">
                        <Label>Details</Label>
                        {detailFieldsOf(template).map((field) => (
                          <FieldInput key={field.key} id={`edit-field-${field.key}`} field={field} language={doc.language}
                            value={values[field.key] ?? ""} onChange={(next) => setValue(field.key, next)} />
                        ))}
                        {tried && problems.details && <p className="text-xs text-destructive">{problems.details}</p>}
                      </section>
                    )}

                    <section className="rounded-lg border">
                      <button type="button" onClick={() => setWordingOpen((current) => !current)} aria-expanded={wordingOpen}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                        <span>
                          <span className="block text-sm font-medium">Change the wording</span>
                          <span className="block text-xs text-muted-foreground">
                            {wording ? "This document's wording was changed by hand." : "Uses the template's approved wording."}
                          </span>
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", wordingOpen && "rotate-180")} />
                      </button>
                      {wordingOpen && (
                        <div className="space-y-4 border-t px-4 py-4">
                          <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Only when the text itself must change. Edits here are for this document only and no longer follow the details above.
                          </p>
                          {wording && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setWording(null)}>
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Use the template's wording
                            </Button>
                          )}
                          {wordingOf(blocks).map((block, index) => {
                            const id = `edit-wording-${index}`;
                            const edit = (text: string) => setWording((current) => {
                              const base = current ?? wordingOf(rendered).map((item) => ({ ...item }));
                              return base.map((item, position) => (position === index ? { ...item, text } as LegalBlock : item));
                            });
                            return (
                              <div key={index} className="space-y-1.5">
                                <Label htmlFor={id} className="text-xs text-muted-foreground">{BLOCK_LABEL[block.kind]}</Label>
                                {block.kind === "paragraph"
                                  ? <Textarea id={id} rows={4} value={block.text} maxLength={10000} onChange={(event) => edit(event.target.value)} />
                                  : <Input id={id} value={block.text} maxLength={10000} onChange={(event) => edit(event.target.value)} />}
                              </div>
                            );
                          })}
                          {tried && problems.wording && <p className="text-xs text-destructive">{problems.wording}</p>}
                        </div>
                      )}
                    </section>
                  </>
                )}
                {(startedCustom || wordingSetAside) && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    {wordingSetAside
                      ? "A change above added or removed a section, so the hand-edited wording was set aside. Edit it again under Document if you still need it."
                      : "This document's wording was changed by hand; that wording is kept, and the parties and details list update from the form."}
                  </p>
                )}
              </div>

              <div className={cn("min-h-0 overflow-y-auto bg-muted/40 px-4 py-5 sm:px-6 lg:border-l", view === "form" && "hidden lg:block")}>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">What every party will sign</p>
                <LegalDocumentView blocks={blocks} />
              </div>
            </div>
          </>
        )}

        <DialogFooter className="flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {emails.length ? <>Saving emails a new link to <span className="font-medium text-foreground">{listNames(emails)}</span>. Earlier links stop working.</> : null}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={revise.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={!template || !changed || revise.isPending}>
              {revise.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Save and resend
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
