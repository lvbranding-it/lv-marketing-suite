import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, Loader2, Lock, Mail, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LVLogo from "@/components/LVLogo";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import SignaturePad from "@/components/legal/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { signatureReady, type LegalSignature } from "@/lib/legal/signature";
import type { LegalBlock, LegalLanguage } from "@/lib/legal/templates";

const WORDS = {
  en: {
    secure: "Secure signing",
    loading: "Opening your document",
    notFound: "This signing link isn't valid.",
    notFoundHelp: "Check that you opened the whole link from the email, or ask LV Branding to send it again.",
    voided: "This document was withdrawn.",
    voidedHelp: "LV Branding cancelled it, so it can no longer be signed. If you think this is a mistake, reply to the email you received.",
    expired: "This signing link expired.",
    expiredHelp: "Ask LV Branding to send it again and you'll get a new link.",
    alreadySigned: "This document is already signed.",
    alreadySignedHelp: "LV Branding will email you the final copy once every party has signed.",
    completedHelp: "The copy signed by every party was emailed to you.",
    confirmTitle: "Confirm your email",
    confirmHelp: (hint: string) => `To open this document, type the email address it was sent to (${hint}).`,
    email: "Email address",
    continue: "Open document",
    mismatch: "That isn't the email this document was sent to.",
    tooMany: "Too many tries. Try again in an hour.",
    unavailable: "Signing isn't available right now. Try again in a few minutes.",
    readThenSign: "Read the document, then sign at the end.",
    signTitle: "Sign",
    fullName: "Full legal name",
    titleLabel: "Title or role (optional)",
    titlePlaceholder: "Only if you sign for a company",
    signature: "Signature",
    consent: "I agree to sign this document electronically, and that my electronic signature is as binding as a handwritten one. I have read the document and agree to its terms.",
    sign: "Sign document",
    signing: "Signing",
    signedTitle: "Signed. Thank you.",
    signedHelp: "LV Branding will countersign next. We'll email you the final copy signed by every party.",
    signedWaitingHelp: "The other parties still have to sign. Once they do, LV Branding will countersign, and we'll email you the final copy signed by every party.",
    signedAt: "Signed",
    footer: "LV Branding LLC · Houston, Texas",
    signatureRequired: "Add your full name and signature.",
    consentRequired: "Check the box to agree to sign electronically.",
  },
  es: {
    secure: "Firma segura",
    loading: "Abriendo su documento",
    notFound: "Este enlace de firma no es válido.",
    notFoundHelp: "Revise que abrió el enlace completo del correo, o pida a LV Branding que se lo envíe de nuevo.",
    voided: "Este documento fue retirado.",
    voidedHelp: "LV Branding lo canceló y ya no se puede firmar. Si cree que es un error, responda al correo que recibió.",
    expired: "Este enlace de firma venció.",
    expiredHelp: "Pida a LV Branding que se lo envíe de nuevo y recibirá un enlace nuevo.",
    alreadySigned: "Este documento ya está firmado.",
    alreadySignedHelp: "LV Branding le enviará por correo la copia final cuando todas las partes hayan firmado.",
    completedHelp: "La copia firmada por todas las partes se le envió por correo.",
    confirmTitle: "Confirme su correo",
    confirmHelp: (hint: string) => `Para abrir este documento, escriba el correo al que se envió (${hint}).`,
    email: "Correo electrónico",
    continue: "Abrir documento",
    mismatch: "Ese no es el correo al que se envió este documento.",
    tooMany: "Demasiados intentos. Inténtelo de nuevo en una hora.",
    unavailable: "La firma no está disponible en este momento. Inténtelo en unos minutos.",
    readThenSign: "Lea el documento y firme al final.",
    signTitle: "Firma",
    fullName: "Nombre legal completo",
    titleLabel: "Cargo o función (opcional)",
    titlePlaceholder: "Solo si firma en nombre de una empresa",
    signature: "Firma",
    consent: "Acepto firmar este documento electrónicamente y que mi firma electrónica tiene la misma validez que una firma manuscrita. He leído el documento y acepto sus términos.",
    sign: "Firmar documento",
    signing: "Firmando",
    signedTitle: "Firmado. Gracias.",
    signedHelp: "LV Branding lo firmará a continuación. Le enviaremos por correo la copia final firmada por todas las partes.",
    signedWaitingHelp: "Las demás partes todavía deben firmar. Cuando lo hagan, LV Branding lo firmará y le enviaremos por correo la copia final firmada por todas las partes.",
    signedAt: "Firmado",
    footer: "LV Branding LLC · Houston, Texas",
    signatureRequired: "Agregue su nombre completo y su firma.",
    consentRequired: "Marque la casilla para aceptar la firma electrónica.",
  },
};

type State = "sent" | "viewed" | "client_signed" | "completed" | "voided" | "expired";
interface Peek { language: LegalLanguage; title: string; state: State; email_hint: string }
interface OpenDocument {
  title: string;
  language: LegalLanguage;
  company_name: string;
  recipient_name: string;
  content: { blocks: LegalBlock[]; signerRole: string; signerRoles?: string[]; countersignerRole: string };
  /** Which signer this link is for, from 1; their role is signerRoles[position - 1]. */
  position?: number;
  state: State;
  client_signed_at: string | null;
}

/** The function's answer, including its refusals, which arrive as error statuses. */
async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke("legal-sign", { body });
  if (!error) return { data: data as T };
  const context = (error as { context?: Response }).context;
  const detail = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
  return { error: detail?.error || "unavailable" };
}

const guessLanguage = (): LegalLanguage => (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "en");

function Shell({ language, children }: { language: LegalLanguage; children: React.ReactNode }) {
  const words = WORDS[language];
  return (
    <div lang={language} className="flex min-h-screen flex-col bg-[#f1f1f2] text-[#1c1a1b]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <LVLogo size={30} className="rounded-full ring-1 ring-black/10" />
            <span className="text-sm font-bold tracking-[0.1em] text-[#cb2039]">LV BRANDING</span>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500"><Lock className="h-3.5 w-3.5" />{words.secure}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-neutral-500">{words.footer}</footer>
    </div>
  );
}

function Notice({ icon: Icon, tone = "neutral", title, help }: { icon: typeof AlertCircle; tone?: "neutral" | "good" | "bad"; title: string; help: string }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-[#cb2039]" : "text-neutral-500";
  return (
    <div className="mx-auto max-w-md rounded-xl border border-black/5 bg-white p-8 text-center shadow-sm">
      <Icon className={`mx-auto h-10 w-10 ${color}`} />
      <h1 className="mt-4 text-balance text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{help}</p>
    </div>
  );
}

export default function SignDocument() {
  const { token = "" } = useParams();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [opening, setOpening] = useState(false);
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState<LegalSignature | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signError, setSignError] = useState("");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [othersPending, setOthersPending] = useState(false);

  useEffect(() => {
    let alive = true;
    setPeek(null);
    setLoadError(null);
    setDoc(null);
    setSigned(false);
    setOthersPending(false);
    call<Peek>({ action: "peek", token }).then(({ data, error }) => {
      if (!alive) return;
      if (data) setPeek(data);
      else setLoadError(error ?? "unavailable");
    });
    return () => { alive = false; };
  }, [token]);

  const language = doc?.language ?? peek?.language ?? guessLanguage();
  const words = WORDS[language];

  const openDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setOpening(true);
    setEmailError("");
    const { data, error } = await call<{ document: OpenDocument }>({ action: "open", token, email: email.trim() });
    setOpening(false);
    if (data) {
      setDoc(data.document);
      setName(data.document.recipient_name);
      window.scrollTo({ top: 0 });
      return;
    }
    if (error === "voided" || error === "expired") setPeek((current) => current && { ...current, state: error });
    else setEmailError(error === "email_mismatch" ? words.mismatch : error === "too_many_tries" ? words.tooMany : words.unavailable);
  };

  const sign = async () => {
    if (name.trim().length < 2 || !signatureReady(signature)) return setSignError(words.signatureRequired);
    if (!agreed) return setSignError(words.consentRequired);
    setSigning(true);
    setSignError("");
    const { data, error } = await call<{ ok: true; others_pending?: boolean }>({
      action: "sign", token, email: email.trim(), signer_name: name.trim(), signer_title: title.trim(), signature, consent: true,
    });
    setSigning(false);
    if (data || error === "already_signed") {
      setOthersPending(!!data?.others_pending);
      setSigned(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSignError(error === "voided" ? words.voidedHelp : error === "expired" ? words.expiredHelp : words.unavailable);
  };

  if (!peek && !loadError) {
    return (
      <Shell language={language}>
        <div className="grid min-h-[40vh] place-items-center text-sm text-neutral-500">
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{words.loading}</span>
        </div>
      </Shell>
    );
  }
  if (loadError) {
    return (
      <Shell language={language}>
        {loadError === "not_found"
          ? <Notice icon={AlertCircle} tone="bad" title={words.notFound} help={words.notFoundHelp} />
          : <Notice icon={AlertCircle} title={words.unavailable} help="" />}
      </Shell>
    );
  }

  const state = peek!.state;
  if (signed) return <Shell language={language}><Notice icon={CheckCircle2} tone="good" title={words.signedTitle} help={othersPending ? words.signedWaitingHelp : words.signedHelp} /></Shell>;
  if (state === "voided") return <Shell language={language}><Notice icon={AlertCircle} title={words.voided} help={words.voidedHelp} /></Shell>;
  if (state === "expired") return <Shell language={language}><Notice icon={Clock3} title={words.expired} help={words.expiredHelp} /></Shell>;
  if (state === "client_signed" || state === "completed" || doc?.state === "client_signed" || doc?.state === "completed") {
    const completed = state === "completed" || doc?.state === "completed";
    return <Shell language={language}><Notice icon={CheckCircle2} tone="good" title={words.alreadySigned} help={completed ? words.completedHelp : words.alreadySignedHelp} /></Shell>;
  }

  if (!doc) {
    return (
      <Shell language={language}>
        <form onSubmit={openDocument} className="mx-auto max-w-md rounded-xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
          <Mail className="h-8 w-8 text-[#cb2039]" />
          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-neutral-500">{peek!.title}</p>
          <h1 className="mt-1 text-xl font-semibold">{words.confirmTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">{words.confirmHelp(peek!.email_hint)}</p>
          <div className="mt-5 space-y-1.5">
            <Label htmlFor="sign-email">{words.email}</Label>
            <Input
              id="sign-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 bg-white text-base"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "sign-email-error" : undefined}
            />
            {emailError && <p id="sign-email-error" className="text-sm text-[#cb2039]">{emailError}</p>}
          </div>
          <Button type="submit" className="mt-5 h-11 w-full" disabled={opening || !email.trim()}>
            {opening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{words.continue}
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell language={language}>
      <p className="mb-4 text-sm text-neutral-600">{words.readThenSign}</p>
      <LegalDocumentView blocks={doc.content.blocks} />

      <section className="mt-6 rounded-lg border border-black/5 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="sign-heading">
        <h2 id="sign-heading" className="text-lg font-semibold">{words.signTitle}</h2>
        <p className="mt-0.5 text-sm text-neutral-500">{doc.content.signerRoles?.[(doc.position ?? 1) - 1] ?? doc.content.signerRole}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sign-name">{words.fullName}</Label>
            <Input id="sign-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-11 bg-white text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sign-title">{words.titleLabel}</Label>
            <Input id="sign-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={words.titlePlaceholder} className="h-11 bg-white text-base" />
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          <Label>{words.signature}</Label>
          <SignaturePad value={signature} onChange={setSignature} defaultName={name} language={language} />
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#cb2039]" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>{words.consent}</span>
        </label>
        {signError && <p className="mt-4 text-sm text-[#cb2039]" role="alert">{signError}</p>}
        <Button className="mt-5 h-11 w-full sm:w-auto sm:px-8" onClick={sign} disabled={signing}>
          {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
          {signing ? words.signing : words.sign}
        </Button>
      </section>
    </Shell>
  );
}
