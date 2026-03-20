import { useState } from "react";
import { Search, AlertCircle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import SkillGrid from "@/components/skills/SkillGrid";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjects } from "@/hooks/useProjects";
import { SKILL_CATEGORIES, type SkillCategory } from "@/data/skills";
import { useNavigate } from "react-router-dom";

const ALL_CATEGORIES: Array<{ value: "all" | SkillCategory; label: string }> = [
  { value: "all", label: "All" },
  ...Object.entries(SKILL_CATEGORIES).map(([key, meta]) => ({
    value: key as SkillCategory,
    label: meta.label,
  })),
];

export default function SkillsLibrary() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | SkillCategory>("all");
  const { data: projects = [] } = useProjects();

  const hasContext = projects.some((p) => p.context_complete);

  return (
    <AppShell>
      <Header title="Skills Library" subtitle="33 AI-powered marketing skills" />

      <div className="p-6 max-w-6xl mx-auto space-y-4">
        {/* Context warning banner */}
        {!hasContext && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Tip:</span> Set up a{" "}
              <button
                className="underline font-medium"
                onClick={() => navigate("/projects")}
              >
                Project Marketing Context
              </button>{" "}
              to get better, more personalized outputs from every skill.
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="pl-9 h-9"
          />
        </div>

        {/* Category tabs */}
        <Tabs
          value={activeCategory}
          onValueChange={(v) => setActiveCategory(v as "all" | SkillCategory)}
        >
          <TabsList className="flex-wrap h-auto gap-1 bg-muted p-1">
            {ALL_CATEGORIES.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="text-xs px-2.5 py-1 h-auto"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Skills grid */}
        <SkillGrid
          searchQuery={searchQuery}
          activeCategory={activeCategory}
          hasContext={hasContext}
        />
      </div>
    </AppShell>
  );
}
