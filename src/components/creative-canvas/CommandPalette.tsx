import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, Slash } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchCommands } from "@/lib/creative-canvas/commands/registry";
import { COMMAND_CATEGORIES, type CommandCategory, type CommandDefinition } from "@/lib/creative-canvas/commands/types";

/**
 * The command palette.
 *
 * Opens on `/`, searches by name, alias, description or a mistyped trigger, and
 * shows the roadmap alongside what is built — clearly marked, and not
 * selectable. Seeing where this is going is useful; being handed a command that
 * does nothing is not.
 */
export default function CommandPalette({
  open, onOpenChange, initialQuery = "", onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onPick: (command: CommandDefinition) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<CommandCategory | "all">("all");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQuery(initialQuery); setCategory("all"); setActive(0); } }, [initialQuery, open]);

  const results = useMemo(() => {
    const found = searchCommands(query, 200);
    return category === "all" ? found : found.filter((command) => command.category === category);
  }, [category, query]);

  // Only a built command can be chosen, so the keyboard skips the rest.
  const selectable = useMemo(() => results.filter((command) => command.status === "live"), [results]);
  useEffect(() => { setActive(0); }, [query, category]);

  const choose = (command: CommandDefinition) => { if (command.status === "live") { onPick(command); onOpenChange(false); } };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!selectable.length) return;
      const next = event.key === "ArrowDown" ? active + 1 : active - 1;
      setActive((next + selectable.length) % selectable.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selectable[active]) choose(selectable[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const grouped = COMMAND_CATEGORIES
    .map((group) => ({ group, items: results.filter((command) => command.category === group.id) }))
    .filter((entry) => entry.items.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Creative commands</DialogTitle>
        <DialogDescription className="sr-only">Search the LV Creative Command System by name, task or category.</DialogDescription>

        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands — try “outfit”, “relight”, “headline”…"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          <span className="hidden shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
            <CornerDownLeft size={10} />to run
          </span>
        </div>

        <div className="flex flex-wrap gap-1 border-b px-3 py-2">
          {[{ id: "all" as const, label: "All" }, ...COMMAND_CATEGORIES].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id as CommandCategory | "all")}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] transition",
                category === item.id ? "bg-[#CB2039] text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {!results.length && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No command matches “{query}”.
            </p>
          )}

          {grouped.map(({ group, items }) => (
            <div key={group.id} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.label}</p>
              {items.map((command) => {
                const live = command.status === "live";
                const index = selectable.indexOf(command);
                const isActive = live && index === active;
                return (
                  <button
                    key={command.id}
                    type="button"
                    data-active={isActive}
                    disabled={!live}
                    onMouseEnter={() => live && setActive(index)}
                    onClick={() => choose(command)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition",
                      isActive && "bg-muted",
                      !live && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <Slash size={13} className={cn("mt-1 shrink-0", live ? "text-[#CB2039]" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium">{command.name}</span>
                        <code className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">/{command.trigger}</code>
                        {command.ugcMode === "creator" && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Creator</span>
                        )}
                        {command.ugcMode === "synthetic" && (
                          <span className="rounded bg-violet-500/15 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">Synthetic</span>
                        )}
                        {command.safety === "person_likeness" && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">Likeness</span>
                        )}
                        {command.safety === "attested_claim" && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">Claims</span>
                        )}
                        {!live && (
                          <span className="rounded border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Coming soon</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{command.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
          {selectable.length} ready · {results.length - selectable.length} on the roadmap
        </div>
      </DialogContent>
    </Dialog>
  );
}
