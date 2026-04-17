import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { type DesignType, DESIGN_CATEGORIES } from "@/data/designTypes";
import { cn } from "@/lib/utils";

interface DesignTypeCardProps {
  designType: DesignType;
}

export default function DesignTypeCard({ designType }: DesignTypeCardProps) {
  const navigate = useNavigate();
  const category = DESIGN_CATEGORIES[designType.category];

  return (
    <button
      onClick={() => navigate(`/design/${designType.id}`)}
      className={cn(
        "group text-left w-full bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-primary/30 transition-all duration-200",
        "flex flex-col gap-3"
      )}
    >
      {/* Preview thumbnail */}
      <div
        className="w-full bg-muted/60 rounded-lg overflow-hidden flex items-center justify-center text-4xl border border-border/50"
        style={{ aspectRatio: designType.previewAspect, maxHeight: "140px" }}
      >
        {designType.icon}
      </div>

      {/* Info */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
            {designType.name}
          </h3>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", category.color)}>
            {category.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {designType.description}
        </p>
      </div>
    </button>
  );
}
