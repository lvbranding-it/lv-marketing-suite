import LVLogo from "@/components/LVLogo";
import { cn } from "@/lib/utils";
import type { LegalBlock } from "@/lib/legal/templates";

/**
 * A document's text as the recipient reads it and the PDF prints it: a sheet
 * of paper in either theme, since that is what a signer expects to see.
 */
export default function LegalDocumentView({ blocks, className }: { blocks: LegalBlock[]; className?: string }) {
  const meta = blocks.filter((block) => block.kind === "meta");
  const firstMeta = blocks.findIndex((block) => block.kind === "meta");

  return (
    <article className={cn("rounded-lg border border-neutral-200 bg-white px-5 py-7 text-[#1c1a1b] shadow-sm sm:px-10 sm:py-10", className)}>
      <div className="mb-7 flex items-center gap-2.5">
        <LVLogo size={36} className="shrink-0" />
        <span className="text-xs font-semibold tracking-[0.12em] text-[#cb2039]">LV BRANDING</span>
      </div>
      {blocks.map((block, index) => {
        if (block.kind === "title") {
          return <h2 key={index} className="mb-5 text-balance text-xl font-bold uppercase tracking-wide sm:text-2xl">{block.text}</h2>;
        }
        if (block.kind === "meta") {
          // The meta lines print together as one list.
          if (index !== firstMeta) return null;
          return (
            <dl key={index} className="mb-5 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
              {meta.map((line, metaIndex) => (
                <div key={metaIndex} className="contents">
                  <dt className="font-semibold">{line.kind === "meta" ? line.label : ""}</dt>
                  <dd className="mb-1.5 break-words sm:mb-0">{line.text}</dd>
                </div>
              ))}
            </dl>
          );
        }
        if (block.kind === "heading") return <h3 key={index} className="mb-1.5 mt-5 text-sm font-bold">{block.text}</h3>;
        return <p key={index} className="mb-3.5 whitespace-pre-line text-[15px] leading-relaxed">{block.text}</p>;
      })}
    </article>
  );
}
