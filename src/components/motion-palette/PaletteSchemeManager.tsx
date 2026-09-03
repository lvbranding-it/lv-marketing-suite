import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileUp,
  Pencil,
  Plus,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  createScheme,
  deleteScheme,
  duplicateScheme,
  exportScheme,
  formatSchemeColorsForCopy,
  importScheme,
  renameScheme,
  saveSchemes,
  schemeExportFilename,
  type PaletteScheme,
} from "@/lib/lottie-schemes";
import { cn } from "@/lib/utils";

interface PaletteSchemeManagerProps {
  open: boolean;
  mode: "manage" | "save";
  onOpenChange: (open: boolean) => void;
  schemes: PaletteScheme[];
  onSchemesChange: (schemes: PaletteScheme[]) => void;
  currentColors: string[];
  onApply: (scheme: PaletteScheme) => void;
  onRequestSave: () => void;
  onNotify: (message: string, error?: boolean) => void;
}

function persistAndSet(next: PaletteScheme[], setter: (schemes: PaletteScheme[]) => void) {
  saveSchemes(next);
  setter(next);
}

export default function PaletteSchemeManager({
  open,
  mode,
  onOpenChange,
  schemes,
  onSchemesChange,
  currentColors,
  onApply,
  onRequestSave,
  onNotify,
}: PaletteSchemeManagerProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaletteScheme | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEditingId(null);
      setEditingName("");
    }
  }, [open, mode]);

  const handleSave = () => {
    try {
      const result = createScheme(schemes, { name, colors: currentColors });
      persistAndSet(result.schemes, onSchemesChange);
      onNotify(`Saved “${result.scheme.name}”.`);
      onOpenChange(false);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save the scheme.", true);
    }
  };

  const handleRename = (scheme: PaletteScheme) => {
    try {
      const result = renameScheme(schemes, scheme.id, editingName);
      persistAndSet(result.schemes, onSchemesChange);
      setEditingId(null);
      onNotify("Scheme renamed.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not rename the scheme.", true);
    }
  };

  const handleDuplicate = (scheme: PaletteScheme) => {
    try {
      const result = duplicateScheme(schemes, scheme.id);
      persistAndSet(result.schemes, onSchemesChange);
      onNotify(`Duplicated as “${result.scheme.name}”.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not duplicate the scheme.", true);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    try {
      const result = deleteScheme(schemes, deleteTarget.id);
      persistAndSet(result.schemes, onSchemesChange);
      onNotify(`Deleted “${deleteTarget.name}”.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not delete the scheme.", true);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleExport = (scheme: PaletteScheme) => {
    const blob = new Blob([exportScheme(scheme)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = schemeExportFilename(scheme);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    onNotify("Scheme exported.");
  };

  const handleCopy = async (scheme: PaletteScheme) => {
    try {
      await navigator.clipboard.writeText(formatSchemeColorsForCopy(scheme));
      onNotify("HEX values copied.");
    } catch {
      onNotify("Clipboard access is unavailable in this browser.", true);
    }
  };

  const handleImport = async (file: File) => {
    try {
      if (file.size > 1_000_000) throw new Error("Scheme files must be smaller than 1 MB.");
      const result = importScheme(await file.text(), schemes);
      persistAndSet(result.schemes, onSchemesChange);
      onNotify(`Imported “${result.scheme.name}”.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not import that scheme.", true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-hidden border-white/10 bg-[#171616] p-0 text-white sm:max-w-2xl">
          {mode === "save" ? (
            <div className="p-6">
              <DialogHeader>
                <DialogTitle>Save color scheme</DialogTitle>
                <DialogDescription className="text-white/50">
                  Store the current ordered palette in this browser for reuse.
                </DialogDescription>
              </DialogHeader>
              <div className="my-5">
                <label htmlFor="scheme-name" className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/50">
                  Scheme name
                </label>
                <Input
                  id="scheme-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && name.trim()) handleSave();
                  }}
                  placeholder="e.g. Fall campaign"
                  maxLength={80}
                  autoFocus
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-[#CB2039]"
                />
                <div className="mt-4 flex h-12 overflow-hidden rounded-lg border border-white/10">
                  {currentColors.map((color, index) => (
                    <div
                      key={`${color}-${index}`}
                      className="h-full min-w-4 flex-1"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">{currentColors.length} ordered color{currentColors.length === 1 ? "" : "s"}</p>
              </div>
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/65 hover:bg-white/10 hover:text-white">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!name.trim() || currentColors.length === 0} className="bg-[#CB2039] hover:bg-[#b51c33]">
                  <Save aria-hidden="true" /> Save scheme
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 pr-12">
                <DialogHeader>
                  <DialogTitle>Color schemes</DialogTitle>
                  <DialogDescription className="text-white/50">
                    Apply, organize, import, or export reusable palettes.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex shrink-0 gap-2">
                  <input
                    ref={importRef}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleImport(file);
                      event.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <FileUp aria-hidden="true" /> Import
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      window.setTimeout(onRequestSave, 0);
                    }}
                    className="bg-[#CB2039] hover:bg-[#b51c33]"
                    disabled={currentColors.length === 0}
                  >
                    <Plus aria-hidden="true" /> New
                  </Button>
                </div>
              </div>

              <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4 sm:p-6">
                {schemes.map((scheme) => (
                  <article key={scheme.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        {editingId === scheme.id ? (
                          <div className="flex gap-2">
                            <Input
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") handleRename(scheme);
                                if (event.key === "Escape") setEditingId(null);
                              }}
                              maxLength={80}
                              autoFocus
                              className="h-8 border-white/15 bg-black/20 text-sm text-white focus-visible:ring-[#CB2039]"
                            />
                            <Button size="icon" variant="ghost" onClick={() => handleRename(scheme)} className="h-8 w-8 text-white hover:bg-white/10">
                              <Check aria-hidden="true" /> <span className="sr-only">Save name</span>
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-white">{scheme.name}</h3>
                            {scheme.isBuiltIn && (
                              <span className="rounded-full border border-[#CB2039]/30 bg-[#CB2039]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ef8292]">
                                Built in
                              </span>
                            )}
                          </div>
                        )}
                        <p className="mt-1 text-xs text-white/40">
                          {scheme.colors.length} color{scheme.colors.length === 1 ? "" : "s"}
                          {!scheme.isBuiltIn && ` · Updated ${new Date(scheme.updatedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onApply(scheme)}
                        disabled={currentColors.length === 0}
                        className="h-8 bg-white text-[#231F20] hover:bg-white/85"
                      >
                        <WandSparkles aria-hidden="true" /> Apply
                      </Button>
                    </div>

                    <div className="mt-3 flex h-9 overflow-hidden rounded-md border border-white/10">
                      {scheme.colors.map((color, index) => (
                        <div key={`${color}-${index}`} className="min-w-3 flex-1" style={{ backgroundColor: color }} title={color} />
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {!scheme.isBuiltIn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(scheme.id);
                            setEditingName(scheme.name);
                          }}
                          className="h-8 px-2 text-xs text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil aria-hidden="true" /> Rename
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(scheme)} className="h-8 px-2 text-xs text-white/50 hover:bg-white/10 hover:text-white">
                        <Copy aria-hidden="true" /> Duplicate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleCopy(scheme)} className="h-8 px-2 text-xs text-white/50 hover:bg-white/10 hover:text-white">
                        <Copy aria-hidden="true" /> Copy HEX
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleExport(scheme)} className="h-8 px-2 text-xs text-white/50 hover:bg-white/10 hover:text-white">
                        <Download aria-hidden="true" /> Export
                      </Button>
                      {!scheme.isBuiltIn && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(scheme)} className="ml-auto h-8 px-2 text-xs text-red-300/65 hover:bg-red-500/10 hover:text-red-200">
                          <Trash2 aria-hidden="true" /> Delete
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#171616] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this color scheme?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              “{deleteTarget?.name}” will be removed from this browser. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#CB2039] hover:bg-[#b51c33]">Delete scheme</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface PaletteMappingDialogProps {
  scheme: PaletteScheme | null;
  targetColors: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (mappedColors: string[]) => void;
}

export function PaletteMappingDialog({ scheme, targetColors, open, onOpenChange, onApply }: PaletteMappingDialogProps) {
  const [mapping, setMapping] = useState<number[]>([]);

  useEffect(() => {
    if (open && scheme) setMapping(targetColors.map((_, index) => index % scheme.colors.length));
  }, [open, scheme, targetColors]);

  if (!scheme) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden border-white/10 bg-[#171616] p-0 text-white sm:max-w-xl">
        <DialogHeader className="border-b border-white/10 px-6 py-5 pr-12">
          <DialogTitle>Map “{scheme.name}” to this animation</DialogTitle>
          <DialogDescription className="text-white/50">
            This scheme has {scheme.colors.length} colors and the animation has {targetColors.length}. Choose a replacement for each detected color.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[58vh] space-y-2 overflow-y-auto px-6 py-4">
          {targetColors.map((target, index) => {
            const mapped = scheme.colors[mapping[index] ?? 0];
            return (
              <div key={`${target}-${index}`} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1.35fr)] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-7 w-7 shrink-0 rounded-md border border-white/15" style={{ backgroundColor: target }} />
                  <span className="truncate font-mono text-xs text-white/65">{target}</span>
                </div>
                <span className="text-center text-white/25" aria-hidden="true">→</span>
                <label className="flex min-w-0 items-center gap-2">
                  <span className="h-7 w-7 shrink-0 rounded-md border border-white/15" style={{ backgroundColor: mapped }} />
                  <select
                    value={mapping[index] ?? 0}
                    onChange={(event) => {
                      const next = [...mapping];
                      next[index] = Number(event.target.value);
                      setMapping(next);
                    }}
                    aria-label={`Replacement for ${target}`}
                    className="h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-[#201f1f] px-2 font-mono text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#CB2039]"
                  >
                    {scheme.colors.map((color, colorIndex) => (
                      <option key={`${color}-${colorIndex}`} value={colorIndex}>{color}</option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2 border-t border-white/10 px-6 py-4 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/65 hover:bg-white/10 hover:text-white">Cancel</Button>
          <Button
            onClick={() => onApply(mapping.map((colorIndex) => scheme.colors[colorIndex] ?? scheme.colors[0]))}
            className="bg-[#CB2039] hover:bg-[#b51c33]"
          >
            <WandSparkles aria-hidden="true" /> Apply mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
