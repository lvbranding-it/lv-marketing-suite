import { cn } from "@/lib/utils";
import { REQUEST_STATUS_META } from "./ccsMeta";
import type { CcsRequestStatus } from "@/hooks/useCcs";

export default function CcsStatusBadge({ status, className }: { status: CcsRequestStatus; className?: string }) {
  const meta = REQUEST_STATUS_META[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", meta.className, className)}>
      {meta.label}
    </span>
  );
}
