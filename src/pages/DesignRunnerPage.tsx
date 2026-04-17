import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import DesignRunner from "@/components/design/DesignRunner";
import { Badge } from "@/components/ui/badge";
import { getDesignType, DESIGN_CATEGORIES } from "@/data/designTypes";
import { cn } from "@/lib/utils";

export default function DesignRunnerPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const navigate = useNavigate();

  const designType = typeId ? getDesignType(typeId) : undefined;

  if (!designType) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <p className="text-4xl mb-3">🎨</p>
          <p className="text-muted-foreground text-sm mb-4">Design type not found.</p>
          <Link to="/design" className="text-primary text-sm underline">
            Back to Design Suite
          </Link>
        </div>
      </AppShell>
    );
  }

  const category = DESIGN_CATEGORIES[designType.category];

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex items-center flex-wrap gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b bg-background shrink-0">
          <button
            onClick={() => navigate("/design")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            Design Suite
          </button>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{designType.icon}</span>
            <span className="text-sm font-medium">{designType.name}</span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", category.color)}>
              {category.label}
            </Badge>
          </div>
        </div>

        {/* Runner — takes remaining height */}
        <div className="flex-1 min-h-0">
          <DesignRunner designType={designType} />
        </div>
      </div>
    </AppShell>
  );
}
