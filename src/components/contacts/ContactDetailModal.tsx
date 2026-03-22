import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Contact } from "@/data/contacts";
import { IND_META, SIGNALS } from "@/data/contacts";
import { cn } from "@/lib/utils";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
}

export default function ContactDetailModal({ contact, onClose }: ContactDetailModalProps) {
  if (!contact) return null;
  const ind = IND_META[contact.ind] ?? IND_META.biz;
  const signalMetas = SIGNALS.filter((s) => contact.signals.includes(s.id));

  const scoreColor =
    contact.score >= 85 ? "text-emerald-500" :
    contact.score >= 70 ? "text-amber-500" :
    "text-muted-foreground";

  return (
    <Dialog open={!!contact} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-0">
          {/* pr-10 keeps content clear of the Radix auto-close button (absolute right-4 top-4) */}
          <div className="flex items-start gap-4 pr-10">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold text-foreground">
                {contact.first} {contact.last}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                {contact.title}
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-sm border",
                    ind.bgClass, ind.textClass, ind.borderClass
                  )}
                >
                  {ind.label}
                </span>
                <span className="text-xs text-muted-foreground truncate">{contact.company}</span>
              </div>
            </div>
            {/* Fit score pushed left of the X button */}
            <div className="text-right shrink-0">
              <p className={cn("text-2xl font-bold font-mono", scoreColor)}>{contact.score}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">fit score</p>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Field label="Email">
            {contact.email !== '—'
              ? <a href={`mailto:${contact.email}`} className="text-primary hover:underline text-xs break-all">{contact.email}</a>
              : <Dash />}
          </Field>
          <Field label="Phone">
            {contact.phone !== '—'
              ? <span className="text-xs font-mono">{contact.phone}</span>
              : <Dash />}
          </Field>
          <Field label="City">
            <span className="text-xs">{contact.city}, TX</span>
          </Field>
          <Field label="Employees">
            <span className="text-xs">{contact.employees}</span>
          </Field>
          <Field label="Website">
            {contact.website !== '—'
              ? (
                <a
                  href={`https://${contact.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs flex items-center gap-1"
                >
                  {contact.website} <ExternalLink size={10} />
                </a>
              )
              : <Dash />}
          </Field>
          <Field label="LinkedIn">
            {contact.linkedin !== '—'
              ? (
                <a
                  href={`https://${contact.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs flex items-center gap-1"
                >
                  View profile <ExternalLink size={10} />
                </a>
              )
              : <Dash />}
          </Field>
        </div>

        <Separator />

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Growth Signals
          </p>
          {signalMetas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {signalMetas.map((s) => (
                <span
                  key={s.id}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border"
                  style={{
                    borderColor: `${s.color}50`,
                    color: s.color,
                    background: `${s.color}12`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No signals detected in 90-day window
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="text-xs text-muted-foreground/40">—</span>;
}
