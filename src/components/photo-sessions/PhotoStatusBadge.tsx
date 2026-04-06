import { Badge } from "@/components/ui/badge";
import type { PhotoStatus } from "@/integrations/supabase/types";

const STATUS_CONFIG: Record<PhotoStatus, { label: string; className: string }> = {
  not_selected: { label: "Not Selected", className: "bg-slate-100 text-slate-600 border-slate-200" },
  selected:     { label: "Selected",     className: "bg-blue-50 text-blue-600 border-blue-200" },
  editing:      { label: "Editing",      className: "bg-amber-50 text-amber-700 border-amber-200" },
  ready:        { label: "Ready",        className: "bg-green-50 text-green-700 border-green-200" },
  ready_for_download: { label: "Ready for Download", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

interface PhotoStatusBadgeProps {
  status: PhotoStatus;
}

export default function PhotoStatusBadge({ status }: PhotoStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
