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

function getSafeOutputBasename(output: SkillOutputRow) {
  const rawTitle = output.title ?? output.skill_name ?? "output";
  return rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "output";
}

export function getOutputWordFilename(output: SkillOutputRow) {
  return `${getSafeOutputBasename(output)}.doc`;
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

export function downloadOutputWordDocument(output: SkillOutputRow) {
  const printable = document.querySelector<HTMLElement>(`[data-printable-output-id="${output.id}"]`);
  if (!printable) return;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Fira Sans", Arial, sans-serif; color: #111827; line-height: 1.5; }
    .printable-output__header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; margin-bottom: 22px; border-bottom: 2px solid #111827; }
    .printable-output__eyebrow { margin: 0 0 8px; color: #cb2039; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 0; font-size: 26px; line-height: 1.15; }
    h2 { border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
    .printable-output__meta { min-width: 150px; color: #4b5563; font-size: 11px; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border-bottom: 1px solid #d1d5db; padding: 6px; text-align: left; }
    blockquote { border-left: 4px solid #cb2039; margin-left: 0; padding-left: 14px; color: #4b5563; }
    code { background: #f3f4f6; padding: 1px 4px; }
    pre { background: #111827; color: #f9fafb; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>${printable.outerHTML}</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getOutputWordFilename(output);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PrintableOutput({ output }: PrintableOutputProps) {
  const skill = getSkill(output.skill_id);
  const title = output.title ?? output.skill_name ?? "Output";
  const createdAt = output.created_at
    ? format(new Date(output.created_at), "MMMM d, yyyy")
    : null;

  return (
    <article className="printable-output" data-printable-output-id={output.id}>
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
