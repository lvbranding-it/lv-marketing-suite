import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportedContact } from "@/hooks/useContacts";
import BranchSelect from "@/components/branches/BranchSelect";

const INDUSTRIES = [
  { value: "re",     label: "Real Estate" },
  { value: "con",    label: "Construction" },
  { value: "law",    label: "Legal" },
  { value: "fin",    label: "Finance" },
  { value: "food",   label: "Food & Bev" },
  { value: "np",     label: "Nonprofit" },
  { value: "hos",    label: "Hospitality" },
  { value: "biz",    label: "Consulting" },
  { value: "events", label: "Events" },
  { value: "other",  label: "Other" },
];

const EMP_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

const schema = z.object({
  first_name:      z.string().min(1, "First name is required"),
  branch_id:       z.string().optional(),
  last_name:       z.string().min(1, "Last name is required"),
  title:           z.string().optional(),
  company:         z.string().optional(),
  email:           z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  phone:           z.string().optional(),
  linkedin_url:    z.string().optional(),
  website:         z.string().optional(),
  city:            z.string().optional(),
  state:           z.string().optional(),
  industry:        z.string().optional(),
  employees_range: z.string().optional(),
  fit_score:       z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  contact?: ImportedContact | null;   // null/undefined = add mode
  onClose: () => void;
  onSave: (values: Partial<ImportedContact>) => Promise<void>;
  saving?: boolean;
}

export default function ContactFormModal({ open, contact, onClose, onSave, saving }: Props) {
  const isEdit = !!contact;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      branch_id: "unassigned",
      last_name: "",
      title: "",
      company: "",
      email: "",
      phone: "",
      linkedin_url: "",
      website: "",
      city: "",
      state: "",
      industry: "",
      employees_range: "",
      fit_score: "",
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (contact) {
      form.reset({
        first_name:      contact.first_name ?? "",
        branch_id:       contact.branch_id ?? "unassigned",
        last_name:       contact.last_name ?? "",
        title:           contact.title ?? "",
        company:         contact.company ?? "",
        email:           contact.email ?? "",
        phone:           contact.phone ?? "",
        linkedin_url:    contact.linkedin_url ?? "",
        website:         contact.website ?? "",
        city:            contact.city ?? "",
        state:           contact.state ?? "",
        industry:        contact.industry ?? "",
        employees_range: contact.employees_range ?? "",
        fit_score:       contact.fit_score != null ? String(contact.fit_score) : "",
      });
    } else {
      form.reset({
      first_name: "", branch_id: "unassigned", last_name: "", title: "", company: "",
        email: "", phone: "", linkedin_url: "", website: "",
        city: "", state: "", industry: "", employees_range: "", fit_score: "",
      });
    }
  }, [contact, open]);

  const onSubmit = async (values: FormValues) => {
    const score = values.fit_score ? parseInt(values.fit_score, 10) : null;
    await onSave({
      first_name:      values.first_name,
      branch_id:       values.branch_id === "unassigned" ? null : values.branch_id,
      last_name:       values.last_name,
      title:           values.title || null,
      company:         values.company || null,
      email:           values.email || null,
      phone:           values.phone || null,
      linkedin_url:    values.linkedin_url || null,
      website:         values.website || null,
      city:            values.city || null,
      state:           values.state || null,
      industry:        values.industry || null,
      employees_range: values.employees_range || null,
      fit_score:       !isNaN(score as number) ? score : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "New Contact"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *" error={form.formState.errors.first_name?.message}>
              <Input {...form.register("first_name")} className="h-9 text-sm" placeholder="Jane" />
            </Field>
            <Field label="Last name *" error={form.formState.errors.last_name?.message}>
              <Input {...form.register("last_name")} className="h-9 text-sm" placeholder="Smith" />
            </Field>
          </div>

          <Field label="Branch">
            <BranchSelect
              mode="assign"
              value={form.watch("branch_id") ?? "unassigned"}
              onValueChange={(value) => form.setValue("branch_id", value)}
            />
          </Field>

          {/* Title + Company */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <Input {...form.register("title")} className="h-9 text-sm" placeholder="CEO" />
            </Field>
            <Field label="Company">
              <Input {...form.register("company")} className="h-9 text-sm" placeholder="Acme Corp" />
            </Field>
          </div>

          <Separator />

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input {...form.register("email")} type="email" className="h-9 text-sm" placeholder="jane@acme.com" />
            </Field>
            <Field label="Phone">
              <Input {...form.register("phone")} className="h-9 text-sm" placeholder="+1 713-000-0000" />
            </Field>
          </div>

          {/* LinkedIn + Website */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="LinkedIn URL">
              <Input {...form.register("linkedin_url")} className="h-9 text-sm" placeholder="linkedin.com/in/..." />
            </Field>
            <Field label="Website">
              <Input {...form.register("website")} className="h-9 text-sm" placeholder="acme.com" />
            </Field>
          </div>

          <Separator />

          {/* City + State */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input {...form.register("city")} className="h-9 text-sm" placeholder="Houston" />
            </Field>
            <Field label="State">
              <Input {...form.register("state")} className="h-9 text-sm" placeholder="TX" />
            </Field>
          </div>

          {/* Industry + Employees */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry">
              <Select
                value={form.watch("industry") ?? ""}
                onValueChange={(v) => form.setValue("industry", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Employees">
              <Select
                value={form.watch("employees_range") ?? ""}
                onValueChange={(v) => form.setValue("employees_range", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EMP_RANGES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Fit score */}
          <Field label="Fit score (0–100)" error={form.formState.errors.fit_score?.message}>
            <Input
              {...form.register("fit_score")}
              type="number"
              min={0}
              max={100}
              className="h-9 text-sm w-32"
              placeholder="e.g. 85"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
