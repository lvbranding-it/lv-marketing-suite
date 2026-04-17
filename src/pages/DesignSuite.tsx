import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import DesignTypeCard from "@/components/design/DesignTypeCard";
import { DESIGN_TYPES, DESIGN_CATEGORIES } from "@/data/designTypes";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = ["all", ...Object.keys(DESIGN_CATEGORIES)] as const;
type FilterCategory = (typeof ALL_CATEGORIES)[number];

export default function DesignSuite() {
  const [filter, setFilter] = useState<FilterCategory>("all");

  const visible = filter === "all"
    ? DESIGN_TYPES
    : DESIGN_TYPES.filter((t) => t.category === filter);

  return (
    <AppShell>
      <Header
        title="Design Suite"
        subtitle="Generate professional mockups, graphics, and layouts with AI."
      />

      <div className="p-3 sm:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            )}
          >
            All types
          </button>
          {Object.entries(DESIGN_CATEGORIES).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setFilter(key as FilterCategory)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                filter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              )}
            >
              {meta.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((dt) => (
            <DesignTypeCard key={dt.id} designType={dt} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
