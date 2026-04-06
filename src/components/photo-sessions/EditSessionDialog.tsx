import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Archive, Trash2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateSession, useArchiveSession, useDeleteSession } from "@/hooks/usePhotoSessions";
import type { PhotoSession } from "@/integrations/supabase/types";

const schema = z.object({
  name:               z.string().min(1, "Session name is required"),
  client_name:        z.string().min(1, "Client name is required"),
  client_email:       z.string().email("Invalid email").optional().or(z.literal("")),
  photo_limit:        z.coerce.number().min(0).default(0),
  extra_photo_price:  z.coerce.number().min(0).default(0),
  allow_zip_download: z.boolean().default(false),
  invoice_type:       z.enum(["none", "session", "manual"]).default("none"),
  session_fee:        z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof schema>;

interface EditSessionDialogProps {
  session: PhotoSession;
  open: boolean;
  onClose: () => void;
}

export default function EditSessionDialog({ session, open, onClose }: EditSessionDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const updateSession  = useUpdateSession();
  const archiveSession = useArchiveSession();
  const deleteSession  = useDeleteSession();

  // CC email slots — up to 3
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccErrors, setCcErrors] = useState<(string | null)[]>([]);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
  });

  const invoiceType = watch("invoice_type");

  useEffect(() => {
    if (open) {
      reset({
        name:               session.name,
        client_name:        session.client_name,
        client_email:       session.client_email ?? "",
        photo_limit:        session.photo_limit,
        extra_photo_price:  Number(session.extra_photo_price),
        allow_zip_download: session.allow_zip_download,
        invoice_type:       session.invoice_type ?? "none",
        session_fee:        Number(session.session_fee ?? 0),
      });
      const existing = session.cc_emails ?? [];
      setCcEmails(existing);
      setCcErrors(existing.map(() => null));
    }
  }, [open, session, reset]);

  const addCc = () => {
    if (ccEmails.length < 3) {
      setCcEmails((p) => [...p, ""]);
      setCcErrors((p) => [...p, null]);
    }
  };

  const removeCc = (idx: number) => {
    setCcEmails((p) => p.filter((_, i) => i !== idx));
    setCcErrors((p) => p.filter((_, i) => i !== idx));
  };

  const updateCc = (idx: number, val: string) => {
    setCcEmails((p) => p.map((v, i) => (i === idx ? val : v)));
    setCcErrors((p) =>
      p.map((e, i) => {
        if (i !== idx) return e;
        if (!val) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : "Invalid email";
      })
    );
  };

  const onSubmit = async (values: FormValues) => {
    const newErrs = ccEmails.map((e) =>
      e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? "Invalid email" : null
    );
    if (newErrs.some(Boolean)) {
      setCcErrors(newErrs);
      return;
    }

    try {
      await updateSession.mutateAsync({
        id: session.id,
        name: values.name,
        client_name: values.client_name,
        client_email: values.client_email || null,
        cc_emails: ccEmails.filter(Boolean),
        photo_limit: values.photo_limit,
        extra_photo_price: values.extra_photo_price,
        allow_zip_download: values.allow_zip_download,
        invoice_type: values.invoice_type,
        session_fee: values.invoice_type === "session" ? values.session_fee : 0,
      });
      toast({ description: "Session updated!" });
      onClose();
    } catch {
      toast({ description: "Failed to update session.", variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    await archiveSession.mutateAsync(session.id);
    toast({ description: "Session archived." });
    onClose();
  };

  const handleDelete = async () => {
    await deleteSession.mutateAsync(session.id);
    toast({ description: "Session deleted." });
    onClose();
    navigate("/photo-sessions");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Session Name <span className="text-destructive">*</span></Label>
            <Input id="edit-name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-client-name">Client Name <span className="text-destructive">*</span></Label>
            <Input id="edit-client-name" {...register("client_name")} />
            {errors.client_name && <p className="text-xs text-destructive">{errors.client_name.message}</p>}
          </div>

          {/* Primary email */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-client-email">Client Email</Label>
            <Input id="edit-client-email" type="email" {...register("client_email")} />
          </div>

          {/* CC emails */}
          {ccEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">CC Recipients</Label>
              {ccEmails.map((email, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-0.5">
                    <Input
                      type="email"
                      placeholder={`cc${idx + 1}@example.com`}
                      value={email}
                      onChange={(e) => updateCc(idx, e.target.value)}
                    />
                    {ccErrors[idx] && <p className="text-xs text-destructive">{ccErrors[idx]}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeCc(idx)}>
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {ccEmails.length < 3 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={addCc}>
              <Plus size={12} />
              Add CC recipient
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-photo-limit">Photo Limit</Label>
              <Input id="edit-photo-limit" type="number" min={0} {...register("photo_limit")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-extra-price">Extra Photo Price ($)</Label>
              <Input id="edit-extra-price" type="number" min={0} step="0.01" {...register("extra_photo_price")} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="edit-zip" type="checkbox" className="h-4 w-4 rounded" {...register("allow_zip_download")} />
            <Label htmlFor="edit-zip" className="cursor-pointer">Allow client to download edited photos (ZIP)</Label>
          </div>

          <Separator />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice</p>

          <div className="space-y-1.5">
            <Label htmlFor="edit-invoice-type">Invoice Type</Label>
            <select
              id="edit-invoice-type"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...register("invoice_type")}
            >
              <option value="none">No invoice</option>
              <option value="session">Session fee (auto-created via Wave)</option>
              <option value="manual">Manual — I'll handle it in Wave</option>
            </select>
          </div>

          {invoiceType === "session" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-session-fee">Session Fee ($)</Label>
              <Input id="edit-session-fee" type="number" min={0} step="0.01" {...register("session_fee")} />
              <p className="text-xs text-muted-foreground">
                Extra photo top-ups are added automatically when the client confirms their selection.
              </p>
            </div>
          )}

          {invoiceType === "manual" && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              You'll create and send the invoice manually in Wave. Use the Invoice panel on the session page to paste the link for tracking.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateSession.isPending}>
              {updateSession.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>

        <Separator />

        {/* Danger zone */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Danger Zone</p>
          <div className="flex gap-2">
            {session.status === "active" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Archive size={14} className="mr-1.5" />
                    Archive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The session will be archived. Photos and comments are preserved but the client link will still work.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="flex-1">
                  <Trash2 size={14} className="mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{session.name}</strong>, all photos, and all comments. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Delete Session
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
