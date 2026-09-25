import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Search, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  AI_SYSTEMS,
  CAPABILITIES,
  CAPABILITY_GROUPS,
  CAPABILITY_STATUS_LABELS,
  type CapabilityGroup,
  type CapabilityStatus,
} from "@/data/capabilities";

const STATUS_DOT: Record<CapabilityStatus, string> = {
  live: "bg-emerald-600",
  new: "bg-[#CB2039]",
  ready: "bg-amber-500",
};

/**
 * The internal index of what the suite can already do.
 *
 * Its job is to stop someone doing by hand a thing the system already does, so
 * every entry says when to reach for it and not just what it is. Status is
 * reported honestly: an index that calls everything ready costs the team trust
 * the first time they open a module and find it empty.
 */
export default function About() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CapabilityGroup | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, matching the Skills library, but never while someone
  // is already typing somewhere else.
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return CAPABILITIES.filter((item) => {
      if (group !== "all" && item.group !== group) return false;
      if (!term) return true;
      const copy = item[lang];
      const where = item.path ?? item.where?.[lang] ?? "";
      return `${copy.name} ${copy.what} ${copy.when} ${where}`.toLowerCase().includes(term);
    });
  }, [group, lang, query]);

  const filtering = !!query.trim() || group !== "all";
  const clear = () => {
    setQuery("");
    setGroup("all");
  };

  return (
    <AppShell>
      <Header title={t("about.title")} subtitle={t("about.subtitle", { count: CAPABILITIES.length })} />

      <div className="mx-auto max-w-5xl px-3 pb-12 sm:px-6">
        <div className="sticky top-0 z-10 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setQuery("")}
              placeholder={t("about.searchPlaceholder")}
              aria-label={t("about.searchPlaceholder")}
              className="h-10 pl-9 pr-9"
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                aria-label={t("about.clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">/</kbd>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setGroup("all")}
              aria-pressed={group === "all"}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                group === "all" ? "bg-[#CB2039] font-medium text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t("about.all")}
            </button>
            {CAPABILITY_GROUPS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setGroup(entry.id)}
                aria-pressed={group === entry.id}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  group === entry.id ? "bg-[#CB2039] font-medium text-white" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {entry.label[lang]}
              </button>
            ))}
            {filtering && (
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {t("about.resultCount", { count: results.length, total: CAPABILITIES.length })}
                <button type="button" onClick={clear} className="underline underline-offset-2 hover:text-foreground">
                  {t("about.clear")}
                </button>
              </span>
            )}
          </div>
        </div>

        {!results.length && (
          <div className="rounded-xl border border-dashed px-4 py-16 text-center">
            <p className="text-sm font-medium">{t("about.noMatch")}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={clear}>{t("about.clear")}</Button>
          </div>
        )}

        {CAPABILITY_GROUPS.map((entry) => {
          const items = results.filter((item) => item.group === entry.id);
          if (!items.length) return null;
          return (
            <section key={entry.id} className="pt-8">
              <h2 className="inline-block border-b-2 border-[#CB2039] pb-2 text-xs font-semibold uppercase tracking-[.13em]">
                {entry.label[lang]}
              </h2>
              {!filtering && <p className="mt-2.5 max-w-xl text-sm text-muted-foreground">{entry.hint[lang]}</p>}

              {/* The three AI systems sit with the tools they describe, which is
                  where the distinction actually gets used. */}
              {entry.id === "make" && !filtering && (
                <div className="mt-4 rounded-lg border bg-card p-4">
                  <p className="text-sm font-medium">{t("about.aiTitle")}</p>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("about.aiBody")}</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    {AI_SYSTEMS.map((system) => (
                      <div key={system.id}>
                        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#CB2039]">{system[lang].name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{system[lang].what}</span> {system[lang].when}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 border-t">
                {items.map((item) => {
                  const copy = item[lang];
                  return (
                    <article key={item.id} className="grid gap-x-8 gap-y-2.5 border-b py-4 sm:grid-cols-[220px_1fr]">
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold leading-tight">{copy.name}</h3>
                        {item.path ? (
                          <button
                            type="button"
                            onClick={() => navigate(item.path!)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded bg-[#CB2039]/10 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-[#CB2039]"
                          >
                            {item.path}
                            <ArrowUpRight size={11} />
                          </button>
                        ) : (
                          <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {item.where?.[lang]}
                          </span>
                        )}
                        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.07em] text-muted-foreground">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[item.status])} />
                          {CAPABILITY_STATUS_LABELS[item.status][lang]}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm leading-relaxed">{copy.what}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.07em] text-foreground">
                            {t("about.reachWhen")}
                          </span>
                          {copy.when}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="mt-10 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          {t("about.statusKey")}
        </p>
      </div>
    </AppShell>
  );
}
