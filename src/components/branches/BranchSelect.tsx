import { useEffect } from "react";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccessibleBranches,
  type BranchFilterValue,
} from "@/hooks/useBranches";
import { cn } from "@/lib/utils";

interface BranchSelectProps {
  value: BranchFilterValue;
  onValueChange: (value: BranchFilterValue) => void;
  mode?: "filter" | "assign";
  className?: string;
  triggerClassName?: string;
}

export default function BranchSelect({
  value,
  onValueChange,
  mode = "filter",
  className,
  triggerClassName,
}: BranchSelectProps) {
  const { data: branches = [], isBranchRestricted } = useAccessibleBranches();
  const showFilterOptions = mode === "filter";
  const allowGlobalFilterOptions = showFilterOptions && !isBranchRestricted;

  useEffect(() => {
    if (!isBranchRestricted) return;
    if (branches.length === 0) return;
    if (branches.some((branch) => branch.id === value)) return;

    onValueChange(branches[0].id);
  }, [branches, isBranchRestricted, onValueChange, value]);

  return (
    <div className={cn("min-w-[180px]", className)}>
      <Select value={value} onValueChange={(next) => onValueChange(next as BranchFilterValue)}>
        <SelectTrigger className={cn("h-9 text-sm", triggerClassName)} aria-label="Branch">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 size={14} className="shrink-0 text-muted-foreground" />
            <SelectValue placeholder={mode === "filter" ? "All branches" : "Assign branch"} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {allowGlobalFilterOptions ? (
            <>
              <SelectItem value="all">All branches</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </>
          ) : !showFilterOptions ? (
            <SelectItem value="unassigned">No branch</SelectItem>
          ) : null}
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
              {branch.code ? ` (${branch.code})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
