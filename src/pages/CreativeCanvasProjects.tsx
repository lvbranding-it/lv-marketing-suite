import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers3, Plus, Sparkles } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CreateCanvasProjectDialog from "@/components/creative-canvas/CreateCanvasProjectDialog";
import { useCreativeProjects } from "@/hooks/useCreativeCanvas";

export default function CreativeCanvasProjects() {
  const [open, setOpen] = useState(false); const { data: projects = [], isLoading, isError } = useCreativeProjects();
  const canvasProjects = projects.filter((project: any) => project.creative_canvases?.length);
  return (
    <AppShell>
      <Header title="LV Creative Canvas™" subtitle="From strategic direction to finished creative, in one intelligent workspace." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus size={15} className="mr-1.5" />New project</Button>} />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <section className="overflow-hidden rounded-2xl bg-[#231F20] text-white">
          <div className="relative px-6 py-8 sm:px-10 sm:py-10">
            <div className="absolute inset-0 creative-dot-grid opacity-40" />
            <div className="relative max-w-2xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70"><Sparkles size={13} className="text-[#CB2039]" />Strategy first. Always.</div><h2 className="text-2xl font-semibold sm:text-3xl">Build the thinking and the work together.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Briefs, brand context, references, creative directions, copy, generated imagery, decisions, and final assets stay connected to one project.</p></div>
          </div>
        </section>
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Canvas projects</h2><p className="text-sm text-muted-foreground">{canvasProjects.length} active workspace{canvasProjects.length === 1 ? "" : "s"}</p></div></div>
        {isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>
          : isError ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><p className="font-medium">Creative Canvas is not available yet.</p><p className="mt-1 text-sm text-muted-foreground">Apply the Canvas migration in this environment, then refresh.</p></div>
          : canvasProjects.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center"><Layers3 className="mx-auto text-muted-foreground" /><h3 className="mt-4 font-semibold">Start with the strategic brief</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create a project, define the brand context, add references, and develop your first creative direction.</p><Button className="mt-5" onClick={() => setOpen(true)}><Plus size={15} className="mr-2" />Create first project</Button></div>
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{canvasProjects.map((project: any) => {
              // A client can hold several canvases, so the card lists them all
              // rather than silently linking to whichever happens to be first.
              const canvases = [...project.creative_canvases].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
              return (
                <Card key={project.id} className="flex h-full flex-col overflow-hidden">
                  <div className="h-20 creative-dot-grid bg-[#231F20] p-4">
                    <div className="inline-flex rounded-md bg-[#CB2039] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Creative Canvas</div>
                  </div>
                  <CardContent className="flex flex-1 flex-col p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{project.client_name || "Internal project"}</p>
                    <h3 className="mt-1 font-semibold">{project.name}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.description || "Strategic workspace ready for creative direction."}</p>
                    <ul className="mt-4 space-y-1 border-t pt-3">
                      {canvases.map((canvas: any) => (
                        <li key={canvas.id}>
                          <Link to={`/dashboard/creative-canvas/${canvas.id}`} className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition hover:bg-muted">
                            <span className="truncate">{canvas.name}</span>
                            <ArrowRight size={14} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#CB2039]" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}</div>}
      </main>
      <CreateCanvasProjectDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
