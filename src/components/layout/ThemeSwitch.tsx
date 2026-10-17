import { Moon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSuiteTheme } from "@/components/layout/SuiteTheme";
import { cn } from "@/lib/utils";

export default function ThemeSwitch({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  const { dark, setDark } = useSuiteTheme();

  return (
    <div className={cn("flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/70", collapsed && "justify-center px-0", className)}>
      {!collapsed && <Moon size={16} aria-hidden="true" />}
      {!collapsed && <span className="flex-1">Dark mode</span>}
      <Switch aria-label="Dark mode" checked={dark} onCheckedChange={setDark} />
    </div>
  );
}
