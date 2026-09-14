/**
 * Branded documents from agent output.
 *
 * The run output already exported to PDF and Word; the conversation and the
 * brand snapshot did not. Rather than copy the builder a third and fourth time,
 * it lives here — so a transcript, a context sheet and a run result all come out
 * on the same letterhead, and a change to the letterhead is one change.
 *
 * PDF goes through the browser's own print pipeline. That is deliberate: it
 * gives real text selection, real pagination and the user's own page settings,
 * which a canvas-rasterised PDF does not.
 */

const LV_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250.1 250.1" width="48" height="48"><circle cx="125.05" cy="125.05" r="125.05" fill="#fff"/><path fill="#CB2039" d="M125.05,16.67c-27.38,0-52.38,10.15-71.46,26.9v75.86c0,2.73,2.21,4.95,4.95,4.95h35.88c3.7.03,4.58,2.56,4.9,5.59.33,3.2.57,6.07,1.06,10.21.55,4.71-1.97,6.04-5.85,6.04h-57.49c-2.73,0-4.95-2.21-4.95-4.95v-71.95c-9.79,16.29-15.41,35.35-15.41,55.74,0,59.86,48.52,108.38,108.38,108.38.39,0,.77,0,1.16,0-3.84-30.87-11.01-75.15-14.66-104.58-.29-2.39,1.07-4.62,3.48-4.62h11.07c1.68,0,3.13,1.16,3.51,2.79,0,0,6.42,51,9.08,72.65.52,4.22,4.49,8.51,9.26-.05,12.67-22.75,28.78-51.64,41-72.55.86-1.47,2.4-2.72,4.1-2.7,5.12.07,12.08,0,15.73,0,3.37,0,4.57,2.3,3.48,4.45-15.39,30.22-42.66,69.2-59.08,100.94,46.23-12.38,80.27-54.56,80.27-104.7,0-59.86-48.52-108.38-108.38-108.38Z"/></svg>`;

/** Anything interpolated into the document has to survive being HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The subset of Markdown agent output actually uses.
 *
 * Escaping runs first so a stray `<` in the copy cannot become markup, and the
 * tags this function adds are its own.
 */
export function markdownToHtml(content: string): string {
  let html = escapeHtml(content)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr/>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");

  html = html.replace(/(\|.+\|[\r\n]+\|[\s:|-]+\|[\r\n]+((?:\|.+\|[\r\n]*)+))/g, (match) => {
    const lines = match.trim().split("\n").filter((row) => row.trim());
    if (lines.length < 2) return match;
    const parseRow = (line: string) =>
      line.split("|").filter((_, index, all) => index > 0 && index < all.length - 1).map((cell) => cell.trim());
    const headers = parseRow(lines[0]);
    let table = "<table><thead><tr>";
    headers.forEach((header) => { table += `<th>${header}</th>`; });
    table += "</tr></thead><tbody>";
    lines.slice(2).forEach((row) => {
      table += "<tr>";
      parseRow(row).forEach((cell) => { table += `<td>${cell}</td>`; });
      table += "</tr>";
    });
    return `${table}</tbody></table>`;
  });

  return html
    .split("\n")
    .map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return "";
      return trimmed.startsWith("<") ? trimmed : `<p>${trimmed}</p>`;
    })
    .join("\n");
}

export interface BrandedDocument {
  /** Shown in the browser tab and used by Word as the document title. */
  title: string;
  /** The line under the brand mark — what this document is and when. */
  meta: string;
  /** Body HTML, already converted from Markdown. */
  bodyHtml: string;
  /** Link encoded into the corner QR code, when there is somewhere to point. */
  qrTarget?: string;
}

export function buildBrandedDocument({ title, meta, bodyHtml, qrTarget }: BrandedDocument): string {
  const qr = qrTarget
    ? `<div class="header-qr">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrTarget)}&bgcolor=FFFFFF&color=231F20&margin=4" alt="Project QR" />
  <div class="header-qr-label">Scan to open project</div>
</div>`
    : "";

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;600;700&display=swap');
  @page { margin:0.75in 1in;size:letter; }
  body { font-family:'Fira Sans','Segoe UI',system-ui,sans-serif;font-size:11pt;line-height:1.6;color:#231F20;max-width:100%; }
  h1 { font-size:18pt;margin:0 0 2pt;color:#231F20;font-weight:700; }
  h2 { font-size:14pt;margin:16pt 0 6pt;color:#231F20;border-left:3px solid #CB2039;padding-left:8px; }
  h3 { font-size:12pt;margin:12pt 0 4pt;color:#231F20; }
  p { margin:4pt 0; }
  strong { font-weight:600; }
  table { border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt; }
  th,td { border:1px solid #ddd;padding:6px 10px;text-align:left; }
  th { background:#231F20;color:#fff;font-weight:600; }
  tr:nth-child(even) td { background:#f9f9f9; }
  li { margin:2pt 0; }
  hr { border:none;border-top:1px solid #ddd;margin:12pt 0; }
  .header-bar { display:flex;align-items:center;gap:16px;border-bottom:3px solid #CB2039;padding-bottom:12pt;margin-bottom:20pt; }
  .header-logo { flex-shrink:0;width:48px;height:48px;background:#231F20;border-radius:8px;padding:4px; }
  .header-text { flex:1; }
  .header-brand { font-size:16pt;font-weight:700;color:#231F20;margin:0; }
  .header-slogan { font-size:9pt;color:#CB2039;font-weight:600;letter-spacing:.5px;margin:2pt 0 0;text-transform:uppercase; }
  .header-meta { font-size:9pt;color:#888;margin-top:4pt; }
  .header-qr { flex-shrink:0;text-align:center; }
  .header-qr img { width:80px;height:80px;border:1px solid #eee;border-radius:4px; }
  .header-qr-label { font-size:7pt;color:#999;margin-top:2pt; }
  /* One exchange of a transcript, kept together across a page break. */
  .turn { margin:0 0 14pt;page-break-inside:avoid; }
  .turn-who { font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#CB2039;margin:0 0 3pt; }
  .turn-who.is-user { color:#231F20; }
  .turn-body { padding-left:10px;border-left:2px solid #eee; }
  .turn-meta { font-size:8pt;color:#aaa;font-weight:400;text-transform:none;letter-spacing:0; }
  .confidential { margin-top:32pt;padding-top:12pt;border-top:1px solid #ddd;font-size:8pt;color:#999;text-align:center;line-height:1.4; }
  .confidential strong { color:#CB2039; }
  @media print {
    .header-logo,.header-qr img { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
    th { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
  }
</style></head><body>
<div class="header-bar">
  <div class="header-logo">${LV_LOGO_SVG}</div>
  <div class="header-text">
    <div class="header-brand">LV Branding</div>
    <div class="header-slogan">Strategy that works. Creativity that moves.</div>
    <div class="header-meta">${escapeHtml(meta)}</div>
  </div>
  ${qr}
</div>
${bodyHtml}
<div class="confidential">
  <strong>CONFIDENTIAL</strong><br/>
  This document is the property of LV Branding and is intended solely for the use of the individual or entity to whom it is addressed.
  Unauthorized reproduction, distribution, or disclosure is strictly prohibited.
  © ${new Date().getFullYear()} LV Branding. All rights reserved.
</div>
</body></html>`;
}

/** One turn of a conversation, as it appears in a transcript. */
export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
  /** Agent name, timestamp — whatever is worth recording beside the speaker. */
  meta?: string;
}

/** Renders a conversation as labelled turns rather than one undifferentiated wall. */
export function transcriptToHtml(turns: TranscriptTurn[]): string {
  return turns
    .filter((turn) => turn.content.trim())
    .map((turn) => {
      const who = turn.role === "user" ? "You" : "LV Intelligence";
      const meta = turn.meta ? ` <span class="turn-meta">${escapeHtml(turn.meta)}</span>` : "";
      return `<div class="turn">
  <p class="turn-who${turn.role === "user" ? " is-user" : ""}">${who}${meta}</p>
  <div class="turn-body">${markdownToHtml(turn.content)}</div>
</div>`;
    })
    .join("\n");
}

/** A file name that survives a file system, with the date for filing. */
export function documentFileName(label: string, extension: string): string {
  const safe = label
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[\s.]+$/, "") || "document";
  return `${safe} ${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Hands the document to the browser's print dialog, where "Save as PDF" lives.
 *
 * Printing needs the iframe to have laid out, and `onload` does not always fire
 * for a document written this way, so a timer backs it up — and both paths
 * guard against printing or removing twice.
 */
export function printAsPdf(html: string): boolean {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return false; }

  doc.open(); doc.write(html); doc.close();

  let printed = false;
  const send = () => {
    if (printed) return;
    printed = true;
    try { frame.contentWindow?.print(); } catch { /* the dialog was refused */ }
    setTimeout(() => { try { frame.remove(); } catch { /* already gone */ } }, 1000);
  };
  frame.onload = () => setTimeout(send, 250);
  setTimeout(send, 500);
  return true;
}

/** Word opens HTML natively; the BOM is what makes it read the UTF-8 correctly. */
export function downloadAsWord(html: string, filename: string) {
  download(new Blob(["﻿", html], { type: "application/msword" }), filename);
}

export function downloadAsMarkdown(content: string, filename: string) {
  download(new Blob([content], { type: "text/markdown" }), filename);
}

export function downloadAsText(content: string, filename: string) {
  download(new Blob([content], { type: "text/plain" }), filename);
}
