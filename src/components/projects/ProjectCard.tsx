import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Archive, Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Project } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";

interface ProjectCardProps {
  project: Project;
  outputCount?: number;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-slate-50 text-slate-600 border-slate-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: null,
  paused: <Pause size={10} className="mr-1" />,
  archived: <Archive size={10} className="mr-1" />,
};

export default function ProjectCard({ project, outputCount = 0 }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/projects/${project.id}`)}
      className="group text-left w-full bg-card border border-border rounded-lg p-3 sm:p-4 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
            {project.name}
          </h3>
          {project.client_name && (
            <p className="text-xs text-muted-foreground truncate">{project.client_name}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] flex items-center shrink-0",
            STATUS_STYLES[project.status] ?? STATUS_STYLES.active
          )}
        >
          {STATUS_ICONS[project.status]}
          {project.status}
        </Badge>
      </div>

      {project.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-1 mb-3">
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 sm:mt-3">
        <div className="flex items-center gap-1.5">
          {project.context_complete ? (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 size={11} />
              Context ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-amber-600">
              <AlertCircle size={11} />
              No context
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{outputCount} output{outputCount !== 1 ? "s" : ""}</span>
          <span>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
        </div>
      </div>
    </button>
  );
}
