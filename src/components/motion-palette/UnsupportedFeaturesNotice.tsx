import { AlertTriangle, ChevronDown } from "lucide-react";

export interface UnsupportedNoticeItem {
  type: string;
  message: string;
  count?: number;
}

export default function UnsupportedFeaturesNotice({ issues }: { issues: UnsupportedNoticeItem[] }) {
  if (issues.length === 0) return null;

  const total = issues.reduce((sum, issue) => sum + (issue.count ?? 1), 0);

  return (
    <details className="group rounded-lg border border-amber-400/20 bg-amber-300/[0.06] text-amber-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/60">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <span className="flex-1">
          {total} unsupported propert{total === 1 ? "y" : "ies"} left unchanged
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 border-t border-amber-400/15 px-3 py-3">
        {issues.map((issue, index) => (
          <div key={`${issue.type}-${index}`} className="text-xs leading-5 text-amber-50/70">
            <span className="font-semibold text-amber-100">{issue.count && issue.count > 1 ? `${issue.count}× ` : ""}{issue.type}:</span>{" "}
            {issue.message}
          </div>
        ))}
        <p className="text-[11px] leading-4 text-amber-100/45">
          Motion Palette reports these properties but never edits them.
        </p>
      </div>
    </details>
  );
}
