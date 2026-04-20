import { ReactNode } from "react";
import { useLanguage } from "@/hooks/useLanguage";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { translateLiteral } = useLanguage();
  const displayTitle = translateLiteral(title);
  const displaySubtitle = translateLiteral(subtitle);

  return (
    <div className="flex items-center justify-between flex-wrap px-3 sm:px-6 py-3 sm:py-4 border-b bg-background">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-foreground">{displayTitle}</h1>
        {displaySubtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{displaySubtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
