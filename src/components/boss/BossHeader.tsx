import { useEffect } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { Bot, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";

// Skills and Agents are the two sides of BOSS: one sidebar entry opens
// whichever was used last. Remembered per browser; nothing depends on it.
const LAST_TAB_KEY = "lv:boss-tab";
type BossTab = "skills" | "agents";

function rememberTab(tab: BossTab) {
  try {
    window.localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Private windows can refuse storage; the default tab is fine then.
  }
}

function lastTab(): BossTab | null {
  try {
    const tab = window.localStorage.getItem(LAST_TAB_KEY);
    return tab === "skills" || tab === "agents" ? tab : null;
  } catch {
    return null;
  }
}

/** /boss: the tab used last, or Skills, or Agents for someone without Skills. */
export function BossRedirect() {
  const perms = usePermissions();
  const tab = perms.canAccessSkills ? lastTab() ?? "skills" : "agents";
  return <Navigate to={`/${tab}`} replace />;
}

/**
 * The top of both BOSS pages: who BOSS is, and the Skills and Agents tabs.
 * One row, so the Agents chat keeps its height on a phone.
 */
export default function BossHeader({ active }: { active: BossTab }) {
  const { t } = useLanguage();
  const perms = usePermissions();

  useEffect(() => {
    rememberTab(active);
  }, [active]);

  const tabs = [
    ...(perms.canAccessSkills ? [{ tab: "skills" as const, label: t("nav.skills"), icon: Zap }] : []),
    { tab: "agents" as const, label: t("nav.agents"), icon: Bot },
  ];

  return (
    <div className="shrink-0 flex items-center gap-3 border-b bg-background px-3 py-2 sm:px-6 sm:py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600" aria-hidden>
        <Bot size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold leading-tight tracking-wide sm:text-lg">BOSS</h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{t("boss.tagline")}</p>
      </div>
      {tabs.length > 1 && (
        <nav aria-label={t("boss.sections")} className="flex shrink-0 rounded-lg bg-muted p-0.5">
          {tabs.map(({ tab, label, icon: Icon }) => (
            <NavLink
              key={tab}
              to={`/${tab}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={tab === active ? "page" : undefined}
            >
              <Icon size={14} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
