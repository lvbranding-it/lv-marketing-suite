import { useEffect, useRef, useState } from "react";
import {
  Link2, MessageSquare, User, Download, Copy, Check, FileCode2, FileText,
  Layers, Sparkles, Trash2, Save, Upload, X, QrCode, FolderOpen, Loader2, Palette,
} from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import LVLogo from "@/components/LVLogo";
import DevServicesCta from "@/components/DevServicesCta";
import { useToast } from "@/hooks/use-toast";
import {
  EMPTY_CONTACT, QR_CHARCOAL, QR_WHITE, buildQrSvg, buildVCard, canvasToBlob,
  createCsvTemplate, createPdfBlobFromJpeg, downloadBlob, normalizeUrl, parseCsvBatch,
  renderQrBlob, renderQrCanvas, sanitizeFilename,
  type ContactFields,
} from "@/lib/qr";

// ── Local persistence (this browser only — nothing leaves the device) ───────────

const PROJECTS_KEY = "lv-qr-generator:projects";
const PRESETS_KEY  = "lv-qr-generator:presets";

type Tab = "url" | "text" | "contact";

interface Brand {
  foreground: string;
  background: string;
}

const DEFAULT_BRAND: Brand = { foreground: QR_CHARCOAL, background: QR_WHITE };

interface SavedProject {
  id:           string;
  name:         string;
  savedAt:      string;
  tab:          Tab;
  urlInput:     string;
  textInput:    string;
  contact:      ContactFields;
  brand:        Brand;
  logoDataUrl:  string;
  logoName:     string;
}

interface SavedPreset {
  id:          string;
  name:        string;
  savedAt:     string;
  brand:       Brand;
  logoDataUrl: string;
  logoName:    string;
}

function readStoredList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Small building blocks ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
          <span className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <Input
          value={value.toUpperCase()}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 font-mono text-xs uppercase"
        />
      </div>
    </Field>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function QrGenerator() {
  const { toast } = useToast();

  const [tab, setTab]             = useState<Tab>("url");
  const [urlInput, setUrlInput]   = useState("");
  const [textInput, setTextInput] = useState("");
  const [contact, setContact]     = useState<ContactFields>(EMPTY_CONTACT);

  const [brand, setBrand]             = useState<Brand>(DEFAULT_BRAND);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [logoName, setLogoName]       = useState("");

  const [qrData, setQrData]   = useState("");
  const [copied, setCopied]   = useState(false);
  const [busy, setBusy]       = useState<string | null>(null);

  const [batchOpen, setBatchOpen]       = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen]   = useState(false);

  const [batchInput, setBatchInput] = useState(
    "homepage,https://lvbranding.com\ncontact,mailto:hello@lvbranding.com",
  );
  const [projects, setProjects]       = useState<SavedProject[]>(() => readStoredList(PROJECTS_KEY));
  const [presets, setPresets]         = useState<SavedPreset[]>(() => readStoredList(PRESETS_KEY));
  const [projectName, setProjectName] = useState("");
  const [presetName, setPresetName]   = useState("");

  const previewRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef  = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  // ── Encoded payload follows the active tab ────────────────────────────────────
  useEffect(() => {
    if (tab === "url")  return setQrData(normalizeUrl(urlInput));
    if (tab === "text") return setQrData(textInput);
    const hasContact =
      contact.firstName || contact.lastName || contact.phone || contact.email ||
      contact.organization || contact.url;
    setQrData(hasContact ? buildVCard(contact) : "");
  }, [tab, urlInput, textInput, contact]);

  // ── Live preview ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;

    if (!qrData.trim()) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    renderQrCanvas(canvas, qrData, {
      size: 260,
      foreground: brand.foreground,
      background: brand.background,
      logoDataUrl,
    }).catch(() => {});
  }, [qrData, brand, logoDataUrl]);

  const persist = <T,>(key: string, value: T[], setter: (v: T[]) => void) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      setter(value);
      return true;
    } catch {
      toast({
        title: "Could not save locally",
        description: "This browser's storage is full — remove a saved item (large logos take up space) and try again.",
      });
      return false;
    }
  };

  // ── Exports ───────────────────────────────────────────────────────────────────

  const baseName = `lv-branding-qr-${tab}`;

  const runExport = async (key: string, task: () => Promise<void>) => {
    if (!qrData) return;
    setBusy(key);
    try {
      await task();
    } catch {
      toast({ title: "Export failed", description: "Something went wrong generating that file. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const exportPng = () =>
    runExport("png", async () => {
      const blob = await renderQrBlob(qrData, {
        size: 1024, foreground: brand.foreground, background: brand.background, logoDataUrl,
      });
      if (blob) downloadBlob(blob, `${baseName}.png`);
    });

  const exportHighResPng = () =>
    runExport("png2048", async () => {
      const blob = await renderQrBlob(qrData, {
        size: 2048, foreground: brand.foreground, background: brand.background, logoDataUrl,
      });
      if (blob) downloadBlob(blob, `${baseName}-2048.png`);
    });

  const exportTransparentPng = () =>
    runExport("transparent", async () => {
      const blob = await renderQrBlob(qrData, {
        size: 1024, transparent: true, foreground: brand.foreground, logoDataUrl,
      });
      if (blob) downloadBlob(blob, `${baseName}-transparent.png`);
    });

  const exportSvg = () =>
    runExport("svg", async () => {
      const svg = await buildQrSvg(qrData, {
        size: 1024, foreground: brand.foreground, background: brand.background, logoDataUrl,
      });
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${baseName}.svg`);
    });

  const exportPdf = () =>
    runExport("pdf", async () => {
      const canvas = document.createElement("canvas");
      await renderQrCanvas(canvas, qrData, {
        size: 1024, foreground: brand.foreground, background: brand.background, logoDataUrl,
      });
      const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.95);
      if (!jpeg) return;
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      downloadBlob(createPdfBlobFromJpeg(bytes, canvas.width, canvas.height), `${baseName}.pdf`);
    });

  const copyData = async () => {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access." });
    }
  };

  // ── Logo ──────────────────────────────────────────────────────────────────────

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(String(reader.result ?? ""));
      setLogoName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const clearLogo = () => { setLogoDataUrl(""); setLogoName(""); };

  const clearFields = () => {
    setUrlInput("");
    setTextInput("");
    setContact(EMPTY_CONTACT);
  };

  // ── Batch ─────────────────────────────────────────────────────────────────────

  const onBatchFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBatchInput(String(reader.result ?? ""));
      toast({ title: `Loaded ${file.name}`, description: "Review the rows, then export the ZIP." });
    };
    reader.readAsText(file);
  };

  const exportBatchZip = async () => {
    const rows = parseCsvBatch(batchInput);
    if (!rows.length) {
      toast({ title: "Nothing to export", description: "Add at least one row — `filename,value` or one value per line." });
      return;
    }
    setBusy("batch");
    try {
      const zip = new JSZip();
      for (const row of rows) {
        const blob = await renderQrBlob(row.value, {
          size: 1024, foreground: brand.foreground, background: brand.background, logoDataUrl,
        });
        if (blob) zip.file(`${sanitizeFilename(row.name)}.png`, blob);
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "lv-branding-qr-batch.zip");
      toast({ title: "Batch ready", description: `Exported ${rows.length} QR code${rows.length === 1 ? "" : "s"} as a ZIP archive.` });
    } catch {
      toast({ title: "Batch export failed", description: "Check the CSV rows and try again." });
    } finally {
      setBusy(null);
    }
  };

  // ── Projects & presets ────────────────────────────────────────────────────────

  const saveProject = () => {
    const project: SavedProject = {
      id: crypto.randomUUID(),
      name: projectName.trim() || `${tab.toUpperCase()} QR — ${new Date().toLocaleDateString()}`,
      savedAt: new Date().toISOString(),
      tab, urlInput, textInput, contact, brand, logoDataUrl, logoName,
    };
    if (persist(PROJECTS_KEY, [project, ...projects], setProjects)) {
      setProjectName("");
      toast({ title: "Project saved", description: "Stored in this browser only." });
    }
  };

  const loadProject = (project: SavedProject) => {
    setTab(project.tab ?? "url");
    setUrlInput(project.urlInput ?? "");
    setTextInput(project.textInput ?? "");
    setContact(project.contact ?? EMPTY_CONTACT);
    setBrand(project.brand ?? DEFAULT_BRAND);
    setLogoDataUrl(project.logoDataUrl ?? "");
    setLogoName(project.logoName ?? "");
    setProjectsOpen(false);
    toast({ title: `Loaded ${project.name}` });
  };

  const savePreset = () => {
    const preset: SavedPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim() || `Brand preset ${presets.length + 1}`,
      savedAt: new Date().toISOString(),
      brand, logoDataUrl, logoName,
    };
    if (persist(PRESETS_KEY, [preset, ...presets], setPresets)) {
      setPresetName("");
      toast({ title: "Preset saved", description: "Stored in this browser only." });
    }
  };

  const applyPreset = (preset: SavedPreset) => {
    setBrand(preset.brand ?? DEFAULT_BRAND);
    setLogoDataUrl(preset.logoDataUrl ?? "");
    setLogoName(preset.logoName ?? "");
    setPresetsOpen(false);
    toast({ title: `Applied ${preset.name}` });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const exports = [
    { key: "svg",         label: "SVG",             icon: FileCode2, action: exportSvg },
    { key: "pdf",         label: "PDF",             icon: FileText,  action: exportPdf },
    { key: "transparent", label: "Transparent PNG", icon: Layers,    action: exportTransparentPng },
    { key: "png2048",     label: "High-res 2048",   icon: Sparkles,  action: exportHighResPng },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b border-border px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 mr-auto min-w-0">
          <LVLogo size={34} className="shrink-0" />
          <div className="leading-tight min-w-0">
            <h1 className="text-base font-bold text-foreground">QR Generator</h1>
            <p className="text-xs text-muted-foreground">
              Static QR codes with your brand colours, logo, and print-ready exports.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setPresetsOpen(true)}>
            <Palette size={13} /> Presets
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setProjectsOpen(true)}>
            <FolderOpen size={13} /> Saved
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setBatchOpen(true)}>
            <Layers size={13} /> Batch CSV
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-3 sm:p-6 space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <TabsList className="w-full h-auto rounded-none border-b border-border bg-muted/40 p-0">
              {[
                { id: "url",     label: "URL",     icon: Link2 },
                { id: "text",    label: "Text",    icon: MessageSquare },
                { id: "contact", label: "Contact", icon: User },
              ].map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 text-xs uppercase tracking-wide data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  <Icon size={14} /> {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="grid lg:grid-cols-2">
              {/* ── Inputs ── */}
              <div className="p-4 sm:p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-border">
                <TabsContent value="url" className="mt-0 space-y-4">
                  <Field label="Website URL">
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="example.com or https://example.com"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      https:// is added automatically if you leave it out.
                    </p>
                  </Field>
                </TabsContent>

                <TabsContent value="text" className="mt-0 space-y-4">
                  <Field label="Text content">
                    <Textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Enter any text to encode…"
                      rows={6}
                      className="resize-none"
                    />
                  </Field>
                </TabsContent>

                <TabsContent value="contact" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name">
                      <Input value={contact.firstName} placeholder="John"
                        onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))} />
                    </Field>
                    <Field label="Last name">
                      <Input value={contact.lastName} placeholder="Doe"
                        onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Phone">
                    <Input value={contact.phone} placeholder="+1 (555) 123-4567"
                      onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
                  </Field>
                  <Field label="Email">
                    <Input value={contact.email} placeholder="you@example.com"
                      onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
                  </Field>
                  <Field label="Organization">
                    <Input value={contact.organization} placeholder="Company name"
                      onChange={(e) => setContact((c) => ({ ...c, organization: e.target.value }))} />
                  </Field>
                  <Field label="Website">
                    <Input value={contact.url} placeholder="https://example.com"
                      onChange={(e) => setContact((c) => ({ ...c, url: e.target.value }))} />
                  </Field>
                </TabsContent>

                <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 text-muted-foreground" onClick={clearFields}>
                  <Trash2 size={13} /> Clear fields
                </Button>

                {/* Brand */}
                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Brand</p>
                    <button
                      type="button"
                      onClick={() => setBrand(DEFAULT_BRAND)}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Reset colours
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ColorField label="Foreground" value={brand.foreground}
                      onChange={(hex) => setBrand((b) => ({ ...b, foreground: hex }))} />
                    <ColorField label="Background" value={brand.background}
                      onChange={(hex) => setBrand((b) => ({ ...b, background: hex }))} />
                  </div>

                  <Field label="Centre logo">
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
                    {logoDataUrl ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                        <img src={logoDataUrl} alt="" className="h-7 w-7 rounded object-contain" />
                        <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">{logoName}</span>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={clearLogo} title="Remove logo">
                          <X size={13} />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => logoInputRef.current?.click()}>
                        <Upload size={13} /> Upload logo
                      </Button>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Error correction switches to level H so the code still scans.
                    </p>
                  </Field>
                </div>
              </div>

              {/* ── Preview & exports ── */}
              <div className="p-4 sm:p-6 bg-muted/20 flex flex-col items-center gap-4">
                <div className="w-full max-w-[300px] flex flex-col items-center justify-center rounded-lg border border-border bg-card p-6 min-h-[280px] shadow-sm">
                  {qrData ? (
                    <>
                      <canvas ref={previewRef} width={260} height={260} className="max-w-full h-auto" />
                      <div className="mt-4 text-center">
                        <div className="mx-auto mb-1.5 h-[3px] w-6 rounded-full bg-primary" />
                        <p className="text-[11px] text-muted-foreground">Scan with any camera app</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground/70">
                      <QrCode size={40} strokeWidth={1.4} className="mx-auto mb-3" />
                      <p className="text-sm">Fill in the form to<br />generate your QR code</p>
                    </div>
                  )}
                </div>

                {qrData && (
                  <>
                    <div className="w-full max-w-[300px] grid grid-cols-2 gap-2">
                      <Button className="gap-1.5 text-xs" onClick={exportPng} disabled={busy === "png"}>
                        {busy === "png" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PNG
                      </Button>
                      <Button variant="outline" className="gap-1.5 text-xs" onClick={copyData}>
                        {copied ? <><Check size={13} className="text-primary" /> Copied</> : <><Copy size={13} /> Copy data</>}
                      </Button>
                    </div>

                    <div className="w-full max-w-[300px] space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Export</p>
                      <div className="grid grid-cols-2 gap-2">
                        {exports.map(({ key, label, icon: Icon, action }) => (
                          <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5 text-[11px]"
                            onClick={action}
                            disabled={busy === key}
                          >
                            {busy === key ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />} {label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="w-full max-w-[300px] space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Encoded data</p>
                      <pre className="max-h-20 overflow-y-auto rounded-md bg-muted px-3 py-2 text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
                        {qrData}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Tabs>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <p className="text-sm font-semibold">Static codes, generated on your device</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Nothing is uploaded and nothing expires — the QR encodes your content directly, so it keeps
            working forever with no tracking redirect in the middle. Saved projects and brand presets
            live in this browser only.
          </p>
        </div>

        <DevServicesCta />
      </main>

      {/* Footer */}
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

      {/* ── Batch CSV ── */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Batch QR generation</DialogTitle>
            <DialogDescription>
              Upload a CSV, paste rows, or start from the template. Every row is rendered at 1024px
              with the current brand settings and bundled into a ZIP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <input ref={batchInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onBatchFile} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => batchInputRef.current?.click()}>
                <Upload size={13} /> Upload CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => downloadBlob(new Blob([createCsvTemplate()], { type: "text/csv" }), "qr-batch-template.csv")}
              >
                <Download size={13} /> Template
              </Button>
            </div>

            <Field label="CSV rows">
              <Textarea value={batchInput} onChange={(e) => setBatchInput(e.target.value)} rows={7} className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">
                Format: <code className="text-foreground">filename,value</code> — e.g.{" "}
                <code className="text-foreground">homepage,https://example.com</code>
              </p>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Close</Button>
            <Button onClick={exportBatchZip} disabled={busy === "batch"} className="gap-1.5">
              {busy === "batch" ? <><Loader2 size={14} className="animate-spin" /> Building…</> : <><Download size={14} /> Export ZIP</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Saved projects ── */}
      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved projects</DialogTitle>
            <DialogDescription>
              Store the current content, colours, and logo so you can reload them later on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Client website QR" />
            <Button onClick={saveProject} className="gap-1.5 shrink-0"><Save size={14} /> Save</Button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No saved projects yet.</p>
            ) : projects.map((project) => (
              <div key={project.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{project.name}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(project.savedAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadProject(project)}>Load</Button>
                <Button
                  variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={() => persist(PROJECTS_KEY, projects.filter((p) => p.id !== project.id), setProjects)}
                  title="Delete project"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Brand presets ── */}
      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Brand presets</DialogTitle>
            <DialogDescription>
              Save the current colours and logo as a reusable preset for future codes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="LV red preset" />
            <Button onClick={savePreset} className="gap-1.5 shrink-0"><Save size={14} /> Save</Button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {presets.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No brand presets yet.</p>
            ) : presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{preset.name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.brand?.foreground }} />
                    <span className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.brand?.background }} />
                    {preset.logoName && (
                      <span className="truncate text-[11px] text-muted-foreground">{preset.logoName}</span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset(preset)}>Apply</Button>
                <Button
                  variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={() => persist(PRESETS_KEY, presets.filter((p) => p.id !== preset.id), setPresets)}
                  title="Delete preset"
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
