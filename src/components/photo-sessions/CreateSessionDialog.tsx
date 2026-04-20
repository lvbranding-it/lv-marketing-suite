import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCreateSession } from "@/hooks/usePhotoSessions";
import BranchSelect from "@/components/branches/BranchSelect";

const emailSchema = z.string().email("Invalid email").or(z.literal(""));

const schema = z.object({
  name:               z.string().min(1, "Session name is required"),
  branch_id:          z.string().optional(),
  client_name:        z.string().min(1, "Client name is required"),
  client_email:       emailSchema.optional(),
  photo_limit:        z.coerce.number().min(0).default(0),
  extra_photo_price:  z.coerce.number().min(0).default(0),
  allow_zip_download: z.boolean().default(false),
  invoice_type:       z.enum(["none", "session", "manual"]).default("none"),
  session_fee:        z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof schema>;

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateSessionDialog({ open, onClose }: CreateSessionDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const createSession = useCreateSession();

  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccErrors, setCcErrors] = useState<(string | null)[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      photo_limit: 0,
      branch_id: "unassigned",
      extra_photo_price: 0,
      allow_zip_download: false,
      invoice_type: "none",
      session_fee: 0,
    },
  });

  const invoiceType = watch("invoice_type");

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

  const handleClose = () => {
    reset();
    setCcEmails([]);
    setCcErrors([]);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    const newErrs = ccEmails.map((e) =>
      e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? "Invalid email" : null
    );
    if (newErrs.some(Boolean)) { setCcErrors(newErrs); return; }

    try {
      const session = await createSession.mutateAsync({
        name: values.name,
        branch_id: values.branch_id === "unassigned" ? null : values.branch_id,
        client_name: values.client_name,
        client_email: values.client_email || undefined,
        cc_emails: ccEmails.filter(Boolean),
        photo_limit: values.photo_limit,
        extra_photo_price: values.extra_photo_price,
        allow_zip_download: values.allow_zip_download,
        invoice_type: values.invoice_type,
        session_fee: values.invoice_type === "session" ? values.session_fee : 0,
      });
      toast({ description: "Session created!" });
      handleClose();
      navigate(`/photo-sessions/${session.id}`);
    } catch {
      toast({ description: "Failed to create session.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Photo Session</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* ── Client details ── */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Session Name <span className="text-destructive">*</span></Label>
            <Input id="name" placeholder="e.g. Smith Wedding — June 2026" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client_name">Client Name <span className="text-destructive">*</span></Label>
            <Input id="client_name" placeholder="Jane Smith" {...register("client_name")} />
            {errors.client_name && <p className="text-xs text-destructive">{errors.client_name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client_email">Client Email</Label>
            <Input id="client_email" type="email" placeholder="jane@example.com" {...register("client_email")} />
            {errors.client_email && <p className="text-xs text-destructive">{errors.client_email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Branch</Label>
            <BranchSelect
              mode="assign"
              value={watch("branch_id") ?? "unassigned"}
              onValueChange={(value) => setValue("branch_id", value)}
            />
          </div>

          {ccEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">CC Recipients</Label>
              {ccEmails.map((email, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-0.5">
                    <Input type="email" placeholder={`cc${idx + 1}@example.com`} value={email} onChange={(e) => updateCc(idx, e.target.value)} />
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
              <Plus size={12} /> Add CC recipient
            </Button>
          )}

          <Separator />

          {/* ── Photo selection settings ── */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photo Selection</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="photo_limit">Photo Limit</Label>
              <Input id="photo_limit" type="number" min={0} placeholder="0 = unlimited" {...register("photo_limit")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extra_photo_price">Extra Photo Price ($)</Label>
              <Input id="extra_photo_price" type="number" min={0} step="0.01" placeholder="0.00" {...register("extra_photo_price")} />
            </div>
          </div>

          <Separator />

          {/* ── Invoice settings ── */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice</p>
          <div className="space-y-1.5">
            <Label htmlFor="invoice_type">Invoice Type</Label>
            <select
              id="invoice_type"
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
              <Label htmlFor="session_fee">Session Fee ($)</Label>
              <Input id="session_fee" type="number" min={0} step="0.01" placeholder="0.00" {...register("session_fee")} />
              <p className="text-xs text-muted-foreground">
                A Wave invoice for this amount will be created when you click "Send Invoice" on the session page. Any extra photo top-ups are added automatically.
              </p>
            </div>
          )}

          {invoiceType === "manual" && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              You'll create and send the invoice manually in Wave. The session page will show a field to paste the invoice link for tracking.
            </p>
          )}

          <Separator />

          {/* ── Delivery settings ── */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery</p>
          <div className="flex items-center gap-2">
            <input id="allow_zip_download" type="checkbox" className="h-4 w-4 rounded" {...register("allow_zip_download")} />
            <Label htmlFor="allow_zip_download" className="cursor-pointer">Allow client to download edited photos (ZIP)</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={createSession.isPending}>
              {createSession.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Create Session
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
