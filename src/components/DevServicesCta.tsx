import { Code2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Discrete cross-sell used on the public in-browser tools (QR Generator, Image
 * Studio). Points at the web-solutions discovery wizard rather than the marketing
 * site, so clicks land in the CRM as leads.
 */
export default function DevServicesCta({ className }: { className?: string }) {
  return (
    <a
      href="/industry-web-solutions-web-app-development"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 sm:px-5 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <Code2 size={16} className="shrink-0 text-primary" />
      <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">We built this tool in-house.</span>{" "}
        We design and develop custom web apps, client portals, and internal tools for teams that
        have outgrown off-the-shelf software.
      </p>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
        Explore web development
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
