import type { SessionPhoto } from "@/integrations/supabase/types";

interface SessionStatsBarProps {
  photos: SessionPhoto[];
}

export default function SessionStatsBar({ photos }: SessionStatsBarProps) {
  const total            = photos.length;
  const notSelected      = photos.filter((p) => p.status === "not_selected").length;
  const selected         = photos.filter((p) => p.status === "selected").length;
  const editing          = photos.filter((p) => p.status === "editing").length;
  const ready            = photos.filter((p) => p.status === "ready").length;
  const readyForDownload = photos.filter((p) => p.status === "ready_for_download").length;

  const stats = [
    { label: "Total", value: total,            color: "text-foreground" },
    { label: "Not Selected", value: notSelected, color: "text-slate-500" },
    { label: "Selected", value: selected,       color: "text-blue-600" },
    { label: "Editing", value: editing,         color: "text-amber-600" },
    { label: "Ready", value: ready,             color: "text-green-600" },
    { label: "For Download", value: readyForDownload, color: "text-purple-600" },
  ];

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`font-semibold text-base ${color}`}>{value}</span>
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
