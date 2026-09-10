import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCreativeProject, useCreativeProjects, useOpenCanvasForProject } from "@/hooks/useCreativeCanvas";
import { toast } from "@/hooks/use-toast";

export default function CreateCanvasProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [canvasName, setCanvasName] = useState("");
  const create = useCreateCreativeProject();
  const openForProject = useOpenCanvasForProject();
  const { data: projects = [] } = useCreativeProjects();
  const navigate = useNavigate();

  // Newest first, and labelled by client so the list reads the way the pipeline
  // does rather than by internal project name alone.
  const clientProjects = useMemo(
    () => (projects as Array<Record<string, any>>).map((project) => ({
      id: project.id as string,
      label: project.client_name ? `${project.client_name} · ${project.name}` : (project.name as string),
      canvases: (project.creative_canvases?.length ?? 0) as number,
    })),
    [projects],
  );

  const close = () => {
    onOpenChange(false);
    setName(""); setClientName(""); setDescription(""); setProjectId(""); setCanvasName("");
  };

  const openExisting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    try {
      const result = await openForProject.mutateAsync({ projectId, canvasName });
      close();
      navigate(`/dashboard/creative-canvas/${result.canvasId}`);
    } catch (error) {
      toast({ title: "Canvas was not opened", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const createNew = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const result = await create.mutateAsync({ name: name.trim(), clientName: clientName.trim(), description: description.trim() });
      close();
      navigate(`/dashboard/creative-canvas/${result.canvas.id}`);
    } catch (error) {
      toast({ title: "Project was not created", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open a Creative Canvas</DialogTitle>
          <DialogDescription>
            Start on a client already in your pipeline to inherit their brief and brand, or begin something new.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="existing">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing client</TabsTrigger>
            <TabsTrigger value="new">New project</TabsTrigger>
          </TabsList>

          <TabsContent value="existing">
            <form onSubmit={openExisting} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="canvas-existing-project">Client project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="canvas-existing-project"><SelectValue placeholder="Choose a client project" /></SelectTrigger>
                  <SelectContent>
                    {clientProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.label}{project.canvases > 0 ? ` · ${project.canvases} canvas${project.canvases === 1 ? "" : "es"}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="canvas-name">Canvas name</Label>
                <Input id="canvas-name" value={canvasName} onChange={(event) => setCanvasName(event.target.value)} placeholder="Spring campaign" />
                <p className="text-xs text-muted-foreground">A client can hold several canvases. They share one brand context and asset library.</p>
              </div>
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                <Sparkles size={15} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  The brief and brand snapshot already on this client are inherited into the Brand tab, and every AI action reads them directly.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={!projectId || openForProject.isPending}>
                  {openForProject.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}Open canvas
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="new">
            <form onSubmit={createNew} className="space-y-4 pt-2">
              <div className="space-y-1.5"><Label htmlFor="canvas-project-name">Project name</Label><Input id="canvas-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bilingual launch campaign" /></div>
              <div className="space-y-1.5"><Label htmlFor="canvas-client-name">Brand or client</Label><Input id="canvas-client-name" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Fictional or approved client name" /></div>
              <div className="space-y-1.5"><Label htmlFor="canvas-project-description">Strategic objective</Label><Textarea id="canvas-project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What must this creative work accomplish?" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}Create workspace
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
