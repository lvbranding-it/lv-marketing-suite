import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Check, Download, RotateCcw, Save, Trash2, FolderOpen, Mail, Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import LVLogo from "@/components/LVLogo";
import DevServicesCta from "@/components/DevServicesCta";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_DISCLAIMER, EMPTY_SIGNATURE, FONT_OPTIONS, SIZE_OPTIONS,
  buildSignatureHtml, downloadSignatureFile, hasContent,
  type SignatureFont, type SignatureModel, type SignatureSize,
} from "@/lib/emailSignature";

const PROFILES_KEY = "lv-signature-generator:profiles";

interface SavedProfile {
  id:      string;
  name:    string;
  savedAt: string;
  model:   SignatureModel;
}

function readProfiles(): SavedProfile[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function SignatureGenerator() {
  const { toast } = useToast();

  const [model, setModel]       = useState<SignatureModel>(EMPTY_SIGNATURE);
  const [copied, setCopied]     = useState<"html" | "rich" | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [profiles, setProfiles] = useState<SavedProfile[]>(() => readProfiles());
  const [profileName, setProfileName]   = useState("");

  const previewRef = useRef<HTMLDivElement>(null);

  const html   = useMemo(() => buildSignatureHtml(model), [model]);
  const filled = hasContent(model);

  const set = <K extends keyof SignatureModel>(key: K, value: SignatureModel[K]) =>
    setModel((m) => ({ ...m, [key]: value }));

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // ── Copy ──────────────────────────────────────────────────────────────────────

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied("html");
    } catch {
      toast({ title: "Copy failed", description: "Select the HTML in the box below and copy it manually." });
    }
  };

  /**
   * Gmail and Outlook paste formatted content far more reliably when the *rendered*
   * signature is selected and copied, rather than when HTML is written to the
   * clipboard directly — so try a DOM selection first, then fall back.
   */
  const copyRich = async () => {
    const node = previewRef.current;
    if (!node) return;

    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const ok = document.execCommand("copy");
      selection?.removeAllRanges();
      if (ok) { setCopied("rich"); return; }
      throw new Error("execCommand copy failed");
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html":  new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([html], { type: "text/plain" }),
          }),
        ]);
        setCopied("rich");
      } catch {
        toast({
          title: "Rich copy not supported here",
          description: "Use Download .html, open it in your browser, then copy the signature from that page.",
        });
      }
    }
  };

  // ── Saved profiles (this browser only) ────────────────────────────────────────

  const persist = (next: SavedProfile[]) => {
    try {
      window.localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
      setProfiles(next);
      return true;
    } catch {
      toast({ title: "Could not save locally", description: "This browser's storage is full." });
      return false;
    }
  };

  const saveProfile = () => {
    const profile: SavedProfile = {
      id: crypto.randomUUID(),
      name: profileName.trim() || model.fullName.trim() || `Signature ${profiles.length + 1}`,
      savedAt: new Date().toISOString(),
      model,
    };
    if (persist([profile, ...profiles])) {
      setProfileName("");
      toast({ title: "Profile saved", description: "Stored in this browser only." });
    }
  };

  const loadProfile = (profile: SavedProfile) => {
    setModel({ ...EMPTY_SIGNATURE, ...profile.model });
    setProfilesOpen(false);
    toast({ title: `Loaded ${profile.name}` });
  };

  const reset = () => {
    setModel(EMPTY_SIGNATURE);
    toast({ title: "Reset", description: "All fields cleared." });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const textField = (
    key: keyof SignatureModel, label: string, placeholder: string, hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <Input
        value={String(model[key])}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value as SignatureModel[typeof key])}
      />
    </Field>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b border-border px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 mr-auto min-w-0">
          <LVLogo size={34} className="shrink-0" />
          <div className="leading-tight min-w-0">
            <h1 className="text-base font-bold text-foreground">Email Signature Generator</h1>
            <p className="text-xs text-muted-foreground">
              Clean, client-friendly signatures — table-based HTML with inline styles.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setProfilesOpen(true)}>
            <FolderOpen size={13} /> Saved
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={reset}>
            <RotateCcw size={13} /> Reset
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* ── Inputs ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide">1 — Your details</p>
              <p className="text-[11px] text-muted-foreground">Blank fields are hidden</p>
            </div>

            <div className="p-4 sm:p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-3">
                {textField("fullName", "Full name", "Jane Doe")}
                {textField("role", "Role / title", "Founder")}
                {textField("company", "Company", "Acme Co.")}
                {textField("phone", "Phone", "(713) 555-0123")}
                {textField("email", "Email", "you@example.com")}
                {textField("website", "Website", "example.com")}
                {textField("address", "Location", "Houston, TX")}
                {textField("tagline", "Tagline", "Design that works.")}
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Images</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {textField("logoUrl", "Logo URL", "https://…/logo.png")}
                  {textField("photoUrl", "Headshot URL", "https://…/headshot.jpg")}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Images must be at a public web address. Email clients block images pasted directly
                  from your computer, so upload the file to your website or an image host first, then
                  paste the link here.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
                      <span className="absolute inset-0" style={{ background: model.accent }} />
                      <input
                        type="color"
                        value={model.accent}
                        onChange={(e) => set("accent", e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Accent colour"
                      />
                    </label>
                    <Input
                      value={model.accent.toUpperCase()}
                      onChange={(e) => set("accent", e.target.value)}
                      className="h-9 font-mono text-xs uppercase"
                    />
                  </div>
                </Field>

                <Field label="Size">
                  <Select value={model.size} onValueChange={(v) => set("size", v as SignatureSize)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Font">
                  <Select value={model.font} onValueChange={(v) => set("font", v as SignatureFont)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground leading-relaxed">
                Email clients substitute fonts that aren't installed — every option falls back to Arial
                or Times.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 border-t border-border pt-4">
                {textField("linkedin", "LinkedIn", "linkedin.com/in/…")}
                {textField("instagram", "Instagram", "instagram.com/…")}
                {textField("youtube", "YouTube", "youtube.com/@…")}
                {textField("x", "X (Twitter)", "x.com/…")}
              </div>

              <div className="border-t border-border pt-4">
                <Field label="Disclaimer" hint="Leave empty to omit the footer line entirely.">
                  <Textarea
                    value={model.disclaimer}
                    onChange={(e) => set("disclaimer", e.target.value)}
                    rows={2}
                    placeholder={DEFAULT_DISCLAIMER}
                    className="resize-none text-xs"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* ── Preview + output ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide">2 — Preview &amp; copy</p>
              <p className="text-[11px] text-muted-foreground">Live</p>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold">
                    Preview
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Clients may render this slightly differently
                  </span>
                </div>
                <div className="bg-white p-4 overflow-x-auto">
                  {filled ? (
                    // Built entirely from escaped, locally-entered values — no third-party input.
                    <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
                  ) : (
                    <div className="py-8 text-center text-muted-foreground/70">
                      <Mail size={36} strokeWidth={1.4} className="mx-auto mb-3" />
                      <p className="text-sm">Fill in your details to<br />build your signature</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Button className="gap-1.5 text-xs" onClick={copyRich} disabled={!filled}>
                  {copied === "rich" ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy signature</>}
                </Button>
                <Button variant="outline" className="gap-1.5 text-xs" onClick={copyHtml} disabled={!filled}>
                  {copied === "html" ? <><Check size={13} className="text-primary" /> Copied</> : <><Code2 size={13} /> Copy HTML</>}
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 text-xs col-span-2 sm:col-span-1"
                  onClick={() => downloadSignatureFile(html)}
                  disabled={!filled}
                >
                  <Download size={13} /> Download
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Copy signature</strong> pastes formatted content
                straight into Gmail, Outlook, or Apple Mail — use it first.{" "}
                <strong className="text-foreground">Copy HTML</strong> is for tools that ask for raw
                HTML. If a client strips the formatting, download the file, open it in your browser,
                and copy from there.
              </p>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  HTML output
                </Label>
                <Textarea
                  value={html}
                  readOnly
                  spellCheck={false}
                  rows={10}
                  className="font-mono text-[11px] leading-relaxed"
                />
              </div>

              <div className="flex gap-2 border-t border-border pt-4">
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Save as… (e.g. Sales team)"
                  className="h-9"
                />
                <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={saveProfile} disabled={!filled}>
                  <Save size={14} /> Save
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <p className="text-sm font-semibold">Built for real inboxes</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            The output is a single table with inline styles — the format Gmail, Outlook, and Apple Mail
            actually keep. Everything runs in your browser; nothing is uploaded, and saved profiles stay
            on this device.
          </p>
        </div>

        <DevServicesCta />
      </main>

      <footer className="bg-background border-t border-border py-4 text-center shrink-0">
        <p className="text-xs text-muted-foreground">
          Made with <span className="text-primary">&hearts;</span> by{" "}
          <a
            href="https://www.lvbranding.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground hover:text-primary transition-colors"
          >
            LV Branding
          </a>
        </p>
      </footer>

      {/* ── Saved profiles ── */}
      <Dialog open={profilesOpen} onOpenChange={setProfilesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved signatures</DialogTitle>
            <DialogDescription>
              Reload a signature you saved earlier. These live in this browser only.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {profiles.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No saved signatures yet.</p>
            ) : profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{profile.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(profile.savedAt).toLocaleString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadProfile(profile)}>
                  Load
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={() => persist(profiles.filter((p) => p.id !== profile.id))}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
