import { format } from "date-fns";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { getSkill } from "@/data/skills";
import type { SkillOutputRow } from "@/integrations/supabase/types";

interface PrintableOutputProps {
  output: SkillOutputRow;
}

export function getOutputPdfFilename(output: SkillOutputRow) {
  const rawTitle = output.title ?? output.skill_name ?? "output";
  const safeTitle = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${safeTitle || "output"}-print-ready.pdf`;
}

export function prepareOutputPdfDownload(output: SkillOutputRow) {
  const previousTitle = document.title;
  document.title = getOutputPdfFilename(output).replace(/\.pdf$/i, "");

  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  window.setTimeout(restore, 1500);
  window.print();
}

export default function PrintableOutput({ output }: PrintableOutputProps) {
  const skill = getSkill(output.skill_id);
  const title = output.title ?? output.skill_name ?? "Output";
  const createdAt = output.created_at
    ? format(new Date(output.created_at), "MMMM d, yyyy")
    : null;

  return (
    <article className="printable-output">
      <header className="printable-output__header">
        <div>
          <p className="printable-output__eyebrow">LV Branding Marketing Suite</p>
          <h1>{title}</h1>
        </div>
        <div className="printable-output__meta">
          <p>{skill?.name ?? output.skill_name}</p>
          {createdAt && <p>{createdAt}</p>}
        </div>
      </header>

      <MarkdownContent className="printable-output__body" size="base">
        {output.output_text}
      </MarkdownContent>
    </article>
  );
}
