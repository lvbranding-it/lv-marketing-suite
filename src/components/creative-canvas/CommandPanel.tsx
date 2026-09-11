import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleDollarSign, Loader2, ShieldCheck, Slash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { checkCommand, consentRequirement, defaultValues, estimateCommandCost, type CommandSelectionItem } from "@/lib/creative-canvas/commands/registry";
import { commandRuns } from "@/lib/creative-canvas/commands/catalog";
import { ASPECTS, type CommandDefinition, type CommandValues } from "@/lib/creative-canvas/commands/types";
import type { CreativeProvider } from "@/lib/creative-canvas/types";

const PROVIDER_LABELS: Record<string, string> = { auto: "Auto", openai: "OpenAI", anthropic: "Claude", google: "Google" };

/**
 * What stands between a command and someone's money.
 *
 * A command never runs on being chosen. This panel says what it has, what it is
 * missing, what it will cost and — for anything depicting a person — asks for
 * confirmation that the image may be used, before the button will do anything.
 */
export default function CommandPanel({
  command, open, onOpenChange, selection, running, progress, onRun,
}: {
  command: CommandDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: CommandSelectionItem[];
  running: boolean;
  progress: { done: number; total: number } | null;
  onRun: (values: CommandValues, provider: CreativeProvider, permissionConfirmed: boolean) => void;
}) {
  const [values, setValues] = useState<CommandValues>({});
  const [provider, setProvider] = useState<CreativeProvider>("auto");
  const [permission, setPermission] = useState(false);

  useEffect(() => {
    if (!command || !open) return;
    setValues(defaultValues(command));
    setProvider(command.providers[0] ?? "auto");
    setPermission(false);
  }, [command, open]);

  const consent = command ? consentRequirement(command) : null;
  const readiness = useMemo(
    () => (command ? checkCommand(command, values, selection, { permissionConfirmed: permission }) : null),
    [command, permission, selection, values],
  );

  if (!command) return null;

  const set = (key: string, value: string | number | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const runs = commandRuns(command, values);
  const cost = estimateCommandCost(command, values);
  const rule = command.selection;
  const matched = rule ? selection.filter((item) => !rule.types.length || rule.types.includes(item.nodeType)) : selection;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 sm:max-w-lg">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <Slash size={15} className="text-[#CB2039]" />{command.name}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">/{command.trigger}</code>
          </DialogTitle>
          <DialogDescription>{command.description}</DialogDescription>
          {command.ugcMode && command.ugcMode !== "either" && (
            <p className="pt-1 text-[11px] leading-4 text-muted-foreground">
              {command.ugcMode === "creator"
                ? "Creator UGC — content from a real person. This shapes what you supply and will not invent it."
                : "Synthetic UGC — generated content, disclosed as AI-made and never presented as a real customer."}
            </p>
          )}
        </DialogHeader>

        <div className="max-h-[58vh] space-y-4 overflow-y-auto py-4">

          {rule && (
            <div className="rounded-lg border p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{rule.label}</p>
              <div className="mt-2 space-y-1">
                {(rule.roles ?? [rule.label]).map((role, index) => {
                  const item = matched[index];
                  return (
                    <p key={role} className="flex items-baseline gap-2 text-xs">
                      <span className={cn("h-1.5 w-1.5 shrink-0 translate-y-1 rounded-full", item ? "bg-[#CB2039]" : "bg-muted-foreground/40")} />
                      <span className="min-w-0 flex-1 truncate">{item ? item.title || "Untitled" : <span className="text-muted-foreground">{role}</span>}</span>
                    </p>
                  );
                })}
                {matched.length > (rule.roles?.length ?? 1) && (
                  <p className="pl-3.5 text-[11px] text-muted-foreground">+{matched.length - (rule.roles?.length ?? 1)} more selected</p>
                )}
              </div>
              {rule.roles && rule.roles.length > 1 && (
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  Order comes from when each card was added to the canvas, not the order you clicked.
                </p>
              )}
            </div>
          )}

          {command.inputs.map((input) => (
            <div key={input.key} className="space-y-1.5">
              <Label htmlFor={`command-${input.key}`} className="text-xs">
                {input.label}{input.required && <span className="ml-1 text-[#CB2039]">*</span>}
              </Label>

              {input.type === "textarea" && (
                <Textarea id={`command-${input.key}`} className="min-h-20 text-sm" placeholder={input.placeholder}
                  value={String(values[input.key] ?? "")} onChange={(event) => set(input.key, event.target.value)} />
              )}
              {input.type === "text" && (
                <Input id={`command-${input.key}`} className="text-sm" placeholder={input.placeholder}
                  value={String(values[input.key] ?? "")} onChange={(event) => set(input.key, event.target.value)} />
              )}
              {input.type === "select" && (
                <Select value={String(values[input.key] ?? "")} onValueChange={(value) => set(input.key, value)}>
                  <SelectTrigger id={`command-${input.key}`} className="text-sm"><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{input.options?.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {input.type === "aspect" && (
                <Select value={String(values[input.key] ?? "square")} onValueChange={(value) => set(input.key, value)}>
                  <SelectTrigger id={`command-${input.key}`} className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASPECTS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {input.type === "count" && (
                <Input id={`command-${input.key}`} type="number" className="w-24 text-sm"
                  min={input.min ?? 1} max={input.max ?? 6}
                  value={Number(values[input.key] ?? input.defaultValue ?? 1)}
                  onChange={(event) => set(input.key, Math.max(input.min ?? 1, Math.min(input.max ?? 6, Number(event.target.value) || 1)))} />
              )}
              {input.type === "toggle" && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={values[input.key] !== false} onChange={(event) => set(input.key, event.target.checked)} />
                  <span className="text-muted-foreground">{input.help ?? "Enabled"}</span>
                </label>
              )}
              {input.help && input.type !== "toggle" && <p className="text-[10px] leading-4 text-muted-foreground">{input.help}</p>}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="command-provider" className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as CreativeProvider)}>
              <SelectTrigger id="command-provider" className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{command.providers.map((item) => <SelectItem key={item} value={item}>{PROVIDER_LABELS[item] ?? item}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {consent && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium"><ShieldCheck size={13} className="text-amber-600 dark:text-amber-400" />{consent.title}</p>
              <label className="mt-2 flex items-start gap-2 text-[11px] leading-4">
                <input type="checkbox" className="mt-0.5" checked={permission} onChange={(event) => setPermission(event.target.checked)} />
                <span>{consent.confirmation}</span>
              </label>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{consent.note}</p>
              {command.disclosure && (
                <p className="mt-2 rounded bg-background/60 px-2 py-1.5 text-[10px] leading-4">
                  <span className="font-medium">Travels with the result:</span> “{command.disclosure}”
                </p>
              )}
            </div>
          )}

          {readiness && !readiness.ok && (
            <ul className="space-y-1 rounded-lg border border-[#CB2039]/40 bg-[#CB2039]/5 p-3">
              {readiness.problems.map((problem) => (
                <li key={problem} className="flex items-start gap-2 text-[11px] leading-4">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#CB2039]" />{problem}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="items-center gap-2 border-t pt-4 sm:justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleDollarSign size={13} />
            {cost > 0
              ? <>about <strong className="font-medium text-foreground">${cost.toFixed(2)}</strong> · {runs} generation{runs === 1 ? "" : "s"}</>
              : <>text only · negligible cost</>}
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" size="sm" className="bg-[#CB2039]" disabled={!readiness?.ok || running}
              onClick={() => onRun(values, provider, permission)}>
              {running && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              {running && progress ? `${progress.done} of ${progress.total}…` : `Run ${command.name}`}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
