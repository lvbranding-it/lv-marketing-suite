import { useMemo, useState } from "react";
import { Grid3x3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { estimateSeriesCost, planSeries, type SeriesAxis, type SeriesPlan } from "@/lib/creative-canvas/series";
import type { CreativeAspect } from "@/lib/creative-canvas/types";

export interface SeriesCandidate extends SeriesAxis {}

const ASPECTS: Array<{ value: CreativeAspect; label: string }> = [
  { value: "square", label: "Square · Instagram post" },
  { value: "portrait", label: "Portrait · feed / Story" },
  { value: "landscape", label: "Landscape · web / video" },
];

/**
 * Builds a matrix of posts from elements already on the canvas.
 *
 * Both axes are optional in the sense that one is enough — a single axis is just
 * a series that varies along one dimension. The count and the estimated spend
 * are shown before the run starts, because each cell is a paid generation and
 * finding that out afterwards is the wrong order.
 */
export default function SeriesDialog({
  open, onOpenChange, candidates, running, progress, onRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: SeriesCandidate[];
  running: boolean;
  progress: { done: number; total: number } | null;
  onRun: (plan: SeriesPlan) => void;
}) {
  const [brief, setBrief] = useState("");
  const [aspect, setAspect] = useState<CreativeAspect>("square");
  const [columnIds, setColumnIds] = useState<string[]>([]);
  const [rowIds, setRowIds] = useState<string[]>([]);

  const pick = (ids: string[]) => candidates.filter((item) => ids.includes(item.id));
  const plan = useMemo(
    () => planSeries(brief, pick(columnIds), pick(rowIds), aspect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brief, columnIds, rowIds, aspect, candidates],
  );
  const total = plan.cells.length;

  const toggle = (list: string[], setList: (next: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const Column = ({ title, hint, ids, setIds, disabledIds }: { title: string; hint: string; ids: string[]; setIds: (next: string[]) => void; disabledIds: string[] }) => (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
        {candidates.length === 0 && <p className="p-3 text-center text-[11px] text-muted-foreground">Select objects on the canvas first.</p>}
        {candidates.map((item) => {
          const checked = ids.includes(item.id);
          const blocked = disabledIds.includes(item.id) && !checked;
          return (
            <button
              key={item.id}
              type="button"
              disabled={blocked}
              onClick={() => toggle(ids, setIds, item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition",
                checked ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                blocked && "cursor-not-allowed opacity-40",
              )}
            >
              <span className={cn("h-3 w-3 shrink-0 rounded-sm border", checked && "border-primary bg-primary")} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Grid3x3 size={17} className="text-primary" />Generate a series</DialogTitle>
          <DialogDescription>
            Every direction is applied to every subject, so a grid of posts stays deliberate rather than accidental.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="series-brief">Shared brief</Label>
            <Textarea id="series-brief" value={brief} onChange={(event) => setBrief(event.target.value)} className="min-h-20"
              placeholder="What every post in this series must do. Client brand context is added automatically." />
          </div>

          <div className="flex gap-4">
            <Column title="Directions" hint="Varies across the columns." ids={columnIds} setIds={setColumnIds} disabledIds={rowIds} />
            <Column title="Subjects (optional)" hint="Varies down the rows. Leave empty for a single row." ids={rowIds} setIds={setRowIds} disabledIds={columnIds} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="series-aspect">Shape</Label>
            <Select value={aspect} onValueChange={(value) => setAspect(value as CreativeAspect)}>
              <SelectTrigger id="series-aspect"><SelectValue /></SelectTrigger>
              <SelectContent>{ASPECTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Artwork is generated at this shape rather than cropped to it afterwards.</p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            {total === 0
              ? <span className="text-muted-foreground">Choose at least one direction to build a series.</span>
              : <span>
                  <strong>{total} post{total === 1 ? "" : "s"}</strong>
                  {plan.rows > 1 ? ` · ${plan.columns} × ${plan.rows} grid` : ""} · about <strong>${estimateSeriesCost(total).toFixed(2)}</strong> of image generation
                  {total > 4 ? <span className="text-muted-foreground"> · paced to stay inside the rate limit, roughly {Math.ceil(total * 6.5 / 60)} min</span> : null}
                </span>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={total === 0 || running || !brief.trim()} onClick={() => onRun(plan)}>
            {running && <Loader2 size={14} className="mr-2 animate-spin" />}
            {running && progress ? `Generating ${progress.done} of ${progress.total}…` : `Generate ${total || ""} post${total === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
