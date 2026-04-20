import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage, type Language } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  collapsed?: boolean;
  className?: string;
}

export default function LanguageSwitcher({ collapsed = false, className }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();
  const nextLanguage: Language = language === "en" ? "es" : "en";

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              className
            )}
            aria-label={t("language.label")}
            onClick={() => setLanguage(nextLanguage)}
          >
            <Languages size={15} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t("language.label")}: {t(`language.short.${language}`)}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/45">
        <Languages size={12} />
        {t("language.label")}
      </div>
      <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
        <SelectTrigger className="h-8 border-sidebar-border bg-sidebar-accent/40 text-xs text-sidebar-foreground focus:ring-sidebar-ring">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t("language.english")}</SelectItem>
          <SelectItem value="es">{t("language.spanish")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
