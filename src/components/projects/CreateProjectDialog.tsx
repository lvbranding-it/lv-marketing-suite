import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCreateProject } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import BranchSelect from "@/components/branches/BranchSelect";

const schema = z.object({
  name: z.string().min(1, "Project name is required"),
  branch_id: z.string().optional(),
  client_name: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createProject = useCreateProject();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", branch_id: "unassigned", client_name: "", description: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const project = await createProject.mutateAsync({
        ...values,
        branch_id: values.branch_id === "unassigned" ? null : values.branch_id,
      });
      form.reset();
      onClose();
      toast({ description: "Project created!" });
      // Redirect to project detail with context setup prompt
      navigate(`/projects/${project.id}?setup=context`);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to create project",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Summer Campaign 2025"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Branch</Label>
            <BranchSelect
              mode="assign"
              value={form.watch("branch_id") ?? "unassigned"}
              onValueChange={(value) => form.setValue("branch_id", value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client_name">Client Name</Label>
            <Input
              id="client_name"
              placeholder="e.g. Acme Corp (optional)"
              {...form.register("client_name")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief project description..."
              rows={2}
              className="resize-none"
              {...form.register("description")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : null}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
