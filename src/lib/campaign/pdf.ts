// ── Campaign Investment Calculator: PDF generation ──────────────────────────────
// Produces a real vector PDF of the plan, so it can be emailed as an attachment
// and downloaded directly rather than relying on the browser's print dialog.
//
// Why not screenshot the HTML report: a rasterised page is large, blurry when
// zoomed, and its text cannot be selected or searched. This draws the same
// content with jsPDF's text primitives instead, which keeps the file small and
// the text real. It mirrors PrintReport.tsx section for section; if one gains a
// section, so should the other.
//
// jsPDF is imported dynamically so it never lands in the initial bundle. Nothing
// here runs until the visitor asks for a PDF.

import {
  AUDIENCE_BANDS, BUSINESS_STAGES, CATEGORIES, CHANNELS, DESTINATIONS,
  LEAN_SCOPE_ASSUMPTIONS, MARKET_REACHES, PREPARATION_PHASE, READINESS_BANDS,
  READINESS_GROUPS, READINESS_ITEMS, RELEVANCE_LABELS, SCENARIOS,
  SEPARATE_SCOPE_ADDITIONS, feasibilityBand, formatMoney, formatRange,
  objectiveMeta, readinessItemMeta, readinessStateMeta, scenarioMeta,
} from "./config";
import {
  allocationAmounts, balanceNotes, displayPercents, feasibilityNarrative,
  feasibilityPaths, planLevers, readinessNarrative, recommendationSummary,
  scenarioRationale,
} from "./engine";
import type {
  CalculationResult, CalculatorAnswers, ScenarioPlan, Shares,
} from "./types";

export const PDF_TITLE = "Campaign Investment Calculator";
export const PDF_SUBTITLE = "A free planning tool by LV Branding";
export const PDF_SLOGAN = "STRATEGY FIRST. ALWAYS.";
export const PDF_SITE = "www.lvbranding.com";

// Letter, in points. 0.6in margins match the print stylesheet.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 43;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_SPACE = 34;
const BOTTOM = PAGE_H - MARGIN - FOOTER_SPACE;

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [75, 85, 99];
const BRAND: [number, number, number] = [203, 32, 57];
const RULE: [number, number, number] = [209, 213, 219];
const HAIRLINE: [number, number, number] = [237, 238, 240];

/**
 * jsPDF's built-in fonts are WinAnsi, so characters outside it render as junk.
 * The report uses a handful of typographic characters; they are mapped to
 * equivalents rather than dropped, so nothing silently disappears.
 */
function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"')
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/ /g, " ");
}

export function pdfFilename(d = new Date()): string {
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${PDF_TITLE} - ${PDF_SUBTITLE} - ${stamp}.pdf`;
}

/** Loads the brand mark as a data URL. Returns null so a failure never blocks the PDF. */
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/lv-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Chunked so a large buffer cannot blow the argument limit on String.fromCharCode. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface PlanPdf {
  blob:     Blob;
  base64:   string;
  filename: string;
  bytes:    number;
}

export async function buildPlanPdf(
  answers: CalculatorAnswers,
  result: CalculationResult,
  plan: ScenarioPlan,
  currentShares: Shares,
): Promise<PlanPdf> {
  const { jsPDF } = await import("jspdf");
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });

  let y = MARGIN;

  // ── Layout primitives ────────────────────────────────────────────────────────

  const setFont = (size: number, bold = false, color: [number, number, number] = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) newPage();
  };

  /** Wrapped paragraph. Breaks across pages line by line rather than as a block. */
  const para = (
    value: string,
    { size = 8.5, bold = false, color = MUTED as [number, number, number], gap = 5, lead = 1.38 } = {},
  ) => {
    const str = clean(value).trim();
    if (!str) return;
    setFont(size, bold, color);
    const lines = doc.splitTextToSize(str, CONTENT_W) as string[];
    const lineH = size * lead;
    for (const line of lines) {
      ensure(lineH);
      setFont(size, bold, color);
      doc.text(line, MARGIN, y + size * 0.8);
      y += lineH;
    }
    y += gap;
  };

  const bullets = (items: string[], size = 8) => {
    for (const item of items) {
      const str = clean(item).trim();
      if (!str) continue;
      setFont(size, false, MUTED);
      const lines = doc.splitTextToSize(str, CONTENT_W - 12) as string[];
      const lineH = size * 1.38;
      lines.forEach((line, i) => {
        ensure(lineH);
        setFont(size, false, MUTED);
        if (i === 0) doc.text("•", MARGIN + 2, y + size * 0.8);
        doc.text(line, MARGIN + 12, y + size * 0.8);
        y += lineH;
      });
    }
    y += 4;
  };

  const sectionHeading = (title: string) => {
    // The heading itself costs 31pt, so this reserves roughly three lines of
    // content beneath it. Without the margin a heading can land alone at the
    // foot of a page with its section starting on the next one.
    ensure(76);
    y += 8;
    setFont(11.5, true, INK);
    doc.text(clean(title), MARGIN, y + 9);
    y += 15;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 8;
  };

  const subHeading = (title: string) => {
    // Same reasoning as sectionHeading, scaled to a smaller block.
    ensure(46);
    y += 3;
    setFont(9, true, INK);
    doc.text(clean(title), MARGIN, y + 7);
    y += 13;
  };

  const eyebrow = (title: string) => {
    // An eyebrow always labels a table or list, so it must not end a page.
    ensure(44);
    y += 5;
    setFont(7, true, MUTED);
    doc.text(clean(title).toUpperCase(), MARGIN, y + 6);
    y += 12;
  };

  /** Two-column key/value grid. `wide` rows take the full width. */
  const figures = (rows: { label: string; value: string | null; wide?: boolean; flag?: boolean }[]) => {
    const live = rows.filter((r) => r.value);
    if (live.length === 0) return;
    const gutter = 22;
    const colW = (CONTENT_W - gutter) / 2;
    const rowH = 13;
    let col = 0;

    for (const row of live) {
      const spans = Boolean(row.wide);
      // A full-width row closes any half-filled row above it first.
      if (spans && col === 1) { col = 0; y += rowH; }
      // Only break pages at the start of a row, so a pair never splits.
      if (col === 0) ensure(rowH);

      const x = MARGIN + (col === 0 ? 0 : colW + gutter);
      const w = spans ? CONTENT_W : colW;

      setFont(8, false, MUTED);
      doc.text(clean(row.label), x, y + 7);
      setFont(8, true, row.flag ? BRAND : INK);
      doc.text(clean(row.value as string), x + w, y + 7, { align: "right" });

      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.5);
      doc.line(x, y + 10.5, x + w, y + 10.5);

      if (spans) { y += rowH; col = 0; }
      else if (col === 0) { col = 1; }
      else { col = 0; y += rowH; }
    }
    if (col === 1) y += rowH;
    y += 5;
  };

  interface Col { header: string; width: number; align?: "l" | "r" }

  // Gutter between columns. A right-aligned cell would otherwise end exactly
  // where the next column begins, so its text ran into the neighbour.
  const CELL_PAD = 10;
  const cellX = (x: number, c: Col) => (c.align === "r" ? x + c.width - CELL_PAD : x);
  const cellW = (c: Col) => c.width - CELL_PAD;

  const table = (cols: Col[], rows: string[][], opts: { totalRow?: string[] } = {}) => {
    const drawHeader = () => {
      ensure(20);
      setFont(7, true, MUTED);
      let x = MARGIN;
      cols.forEach((c) => {
        doc.text(clean(c.header).toUpperCase(), cellX(x, c), y + 6,
          c.align === "r" ? { align: "right" } : undefined);
        x += c.width;
      });
      y += 10;
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.9);
      doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
      y += 5;
    };

    drawHeader();

    for (const row of rows) {
      // Measure the tallest cell so a wrapped row never overlaps the next.
      const wrapped = cols.map((c, i) => {
        setFont(8, false, INK);
        return doc.splitTextToSize(clean(row[i] ?? ""), cellW(c)) as string[];
      });
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const rowH = lines * 10.5 + 4;

      if (y + rowH > BOTTOM) { newPage(); drawHeader(); }

      let x = MARGIN;
      cols.forEach((c, i) => {
        setFont(8, false, INK);
        wrapped[i].forEach((line, li) => {
          doc.text(line, cellX(x, c), y + 7 + li * 10.5,
            c.align === "r" ? { align: "right" } : undefined);
        });
        x += c.width;
      });
      y += rowH;
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y - 1, MARGIN + CONTENT_W, y - 1);
    }

    if (opts.totalRow) {
      ensure(20);
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.9);
      doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
      y += 4;
      let x = MARGIN;
      cols.forEach((c, i) => {
        setFont(8.5, true, INK);
        doc.text(clean(opts.totalRow![i] ?? ""), cellX(x, c), y + 8,
          c.align === "r" ? { align: "right" } : undefined);
        x += c.width;
      });
      y += 16;
    }
    y += 4;
  };

  /** Left-ruled callout, used for contradictions and the preparation-phase caveat. */
  const callout = (title: string | null, body: string) => {
    const str = clean(body);
    setFont(8, false, INK);
    const lines = doc.splitTextToSize(str, CONTENT_W - 22) as string[];
    const h = (title ? 12 : 0) + lines.length * 11 + 12;
    ensure(h + 6);
    const top = y;
    doc.setFillColor(253, 242, 244);
    doc.rect(MARGIN, top, CONTENT_W, h, "F");
    doc.setFillColor(...BRAND);
    doc.rect(MARGIN, top, 2.5, h, "F");
    let ty = top + 6;
    if (title) {
      setFont(8, true, INK);
      doc.text(clean(title), MARGIN + 10, ty + 6);
      ty += 12;
    }
    setFont(8, false, INK);
    lines.forEach((line) => {
      doc.text(line, MARGIN + 10, ty + 6);
      ty += 11;
    });
    y = top + h + 8;
  };

  // ── Data ─────────────────────────────────────────────────────────────────────

  const { profile, scope, financial } = answers;
  const fit = result.feasibility;
  const band = feasibilityBand(fit.status);
  const narrative = feasibilityNarrative(answers, fit);
  const paths = feasibilityPaths(answers, fit);
  const notes = balanceNotes(answers, plan, currentShares);
  // Matches ResultsDashboard: the reserve sits outside the six categories.
  const amounts = allocationAmounts(plan.total - plan.reserveAmount, currentShares);
  const pcts = displayPercents(currentShares);
  const readinessBand = READINESS_BANDS.find((b) => b.band === result.readiness.band);
  const objective = answers.objective ? objectiveMeta(answers.objective) : null;
  const be = plan.breakEven;

  const labelOf = <T extends string>(key: T | null, list: { key: T; label: string }[]) =>
    key ? list.find((i) => i.key === key)?.label ?? null : null;
  const asPct = (v: number | null) => (v === null ? null : `${Math.round(v * 1000) / 10}%`);

  // ── Masthead ─────────────────────────────────────────────────────────────────

  const logoSize = 34;
  if (logo) {
    try { doc.addImage(logo, "PNG", MARGIN, y, logoSize, logoSize); } catch { /* keep going */ }
  }
  const textX = MARGIN + (logo ? logoSize + 12 : 0);
  setFont(18, true, INK);
  doc.text(PDF_TITLE, textX, y + 15);
  setFont(9, false, MUTED);
  doc.text(PDF_SUBTITLE, textX, y + 28);

  setFont(8.5, true, INK);
  doc.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    MARGIN + CONTENT_W, y + 10, { align: "right" },
  );
  setFont(7.5, false, MUTED);
  doc.text("Planning estimate", MARGIN + CONTENT_W, y + 21, { align: "right" });
  doc.text("Not a quote", MARGIN + CONTENT_W, y + 30, { align: "right" });

  y += logoSize + 8;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 12;
  setFont(7.5, true, BRAND);
  doc.text(PDF_SLOGAN, MARGIN, y);
  y += 8;

  // ── 1. Your plan at a glance ─────────────────────────────────────────────────

  sectionHeading("Your plan at a glance");
  para(`${narrative.headline}  [${band.label}]`, { size: 10, bold: true, color: INK, gap: 4 });
  para(narrative.detail);

  figures([
    { label: "Plan shown", value: `${scenarioMeta(plan.key).label} - ${formatMoney(plan.total)}` },
    { label: "Objective", value: objective?.label ?? null },
    { label: "Campaign length", value: `${scope.durationDays} days` },
    { label: "Channels selected", value: String(scope.channels.length) },
    { label: "Campaign destination", value: labelOf(answers.destination, DESTINATIONS) },
    { label: "Audience size", value: labelOf(scope.audience, AUDIENCE_BANDS) },
    { label: "Industry", value: profile.industry || null },
    { label: "Market reach", value: labelOf(profile.reach, MARKET_REACHES) },
    { label: "Business stage", value: labelOf(profile.stage, BUSINESS_STAGES) },
    { label: "Timing", value: scope.timeSensitive ? "Fixed date or launch window" : "Always-on" },
  ]);

  if (scope.channels.length > 0) {
    para(`Channels: ${scope.channels.map((c) => CHANNELS.find((x) => x.key === c)?.label ?? c).join(", ")}`);
  }
  if (result.contradictions.length > 0) {
    callout("Worth resolving before this plan is relied on.",
      result.contradictions.map((c) => c.text).join(" "));
  }
  para(recommendationSummary(answers, result));

  // ── 2. What your budget can do ───────────────────────────────────────────────

  sectionHeading("What your budget can do");
  figures([
    { label: "Feasibility score", value: `${fit.score}/100 - ${fit.scoreLabel}`, wide: true },
    ...(fit.applies ? [{ label: "Available investment", value: formatMoney(fit.available) }] : []),
    { label: "Lean professional minimum", value: formatRange(fit.minimumViable.total) },
    { label: "Complete selected scope", value: formatRange(fit.completeScope.total) },
    ...(fit.applies && fit.minimumFundingGap.max > 0
      ? [{ label: "Minimum funding gap", value: formatRange(fit.minimumFundingGap), flag: true }] : []),
    ...(fit.applies && fit.completeScopeFundingGap.max > 0
      ? [{ label: "Complete-scope funding gap", value: formatRange(fit.completeScopeFundingGap) }] : []),
    ...(fit.applies
      ? [{ label: "Media available after protected requirements", value: formatMoney(fit.mediaAvailable), wide: true }] : []),
    ...(fit.applies
      ? [{ label: "Channels supported at that media level", value: `${fit.supportedChannels} of ${fit.selectedChannels} selected`, wide: true }] : []),
  ]);
  para("Your starting point is about what you already have. This is about what your money can realistically reach. All figures are planning estimates based on market references, not LV Branding quotes.");

  if (paths.length > 0) {
    eyebrow("Ways forward");
    for (const p of paths) {
      subHeading(p.title);
      para(p.text);
    }
  }

  // ── 3. What we would do in this phase ────────────────────────────────────────

  if (fit.applies && fit.status !== "scope-supported") {
    sectionHeading("What we would do in this phase");
    if (plan.isPreparationPhase) {
      para(`${PREPARATION_PHASE.title}. This phase gives you a plan you can act on, not a running campaign.`,
        { color: INK });
      bullets([...PREPARATION_PHASE.inclusions]);
      callout(null, "To be clear: running ads and delivering a complete campaign are not part of this phase.");
    } else {
      para(`A lean, properly run campaign on ${plan.recommendedChannels || 1} channel, reusing what already works for you. This scope assumes:`,
        { color: INK });
      bullets([...LEAN_SCOPE_ASSUMPTIONS]);
    }
    if (plan.requirements.deferred.length > 0) {
      eyebrow("Deferred from this phase");
      bullets(plan.requirements.deferred.map((d) => readinessItemMeta(d.key).label));
    }
    eyebrow("Quoted separately");
    bullets([...SEPARATE_SCOPE_ADDITIONS]);
  }

  // ── 4. Allocation ────────────────────────────────────────────────────────────

  sectionHeading("How the investment is allocated");
  table(
    [
      { header: "Category", width: 286 },
      { header: "Amount", width: 120, align: "r" },
      { header: "Share", width: 120, align: "r" },
    ],
    [
      ...CATEGORIES.map((cat) => [cat.label, formatMoney(amounts[cat.key]), `${pcts[cat.key]}%`]),
      ...(plan.reserveAmount > 0
        ? [["Campaign reserve", formatMoney(plan.reserveAmount), "held separately"]] : []),
    ],
    { totalRow: ["Total investment", formatMoney(plan.total), "100%"] },
  );
  para(scenarioRationale(answers, plan));
  para(planLevers(answers, result));

  // ── 5. Category detail ───────────────────────────────────────────────────────

  sectionHeading("What each allocation is for");
  for (const cat of CATEGORIES) {
    const influences = result.insights.find((i) => i.key === cat.key)?.influences ?? [];
    ensure(40);
    subHeading(`${cat.label}  -  ${formatMoney(amounts[cat.key])} (${pcts[cat.key]}%)`);
    para(cat.why, { gap: 3 });
    para(`Could cover: ${cat.covers}`, { gap: 3 });
    if (influences.length > 0) para(`Shaped by your answers: ${influences.join("; ")}.`);
  }
  para("Amounts describe planning capacity, not a quote; what specific deliverables cost depends on scope and market. Nothing here commits you (or LV Branding) to a price.");

  // ── 6. Starting point ────────────────────────────────────────────────────────

  sectionHeading("Your starting point");
  para(`${result.readiness.score}/100${readinessBand ? ` - ${readinessBand.label}` : ""}`,
    { size: 10, bold: true, color: INK, gap: 4 });
  para(readinessNarrative(result.readiness));
  figures([
    { label: "Essential components ready", value: `${result.readiness.essentialReady} of ${result.readiness.essentialTotal}` },
    { label: "Applicable components to review", value: String(result.readiness.needsReview) },
  ]);

  for (const group of READINESS_GROUPS) {
    const items = READINESS_ITEMS
      .filter((item) => item.group === group.key)
      .map((item) => result.readiness.assessments.find((a) => a.key === item.key))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    if (items.length === 0) continue;
    eyebrow(group.label);
    table(
      [
        { header: "Component", width: 246 },
        { header: "Matters here", width: 140 },
        { header: "Where you are", width: 140 },
      ],
      items.map((a) => [
        readinessItemMeta(a.key).label,
        RELEVANCE_LABELS[a.relevance],
        a.relevance === "not-required"
          ? "Not needed for this campaign"
          : a.state ? readinessStateMeta(a.state).label : "Not answered",
      ]),
    );
  }

  // ── 7. Break-even ────────────────────────────────────────────────────────────

  if (be) {
    sectionHeading("Break-even view");
    para(`At roughly ${formatMoney(be.grossProfitPerUnit)} gross profit per ${be.unitNoun.replace(/s$/, "")}, this plan breaks even at about ${be.breakEvenUnits.toLocaleString()} ${be.unitNoun}.`,
      { color: INK });
    figures([
      { label: `This plan's estimated ${be.unitNoun}`, value: be.goalUnits !== null ? be.goalUnits.toLocaleString() : null },
      { label: "Projected revenue", value: be.projectedRevenue !== null ? formatMoney(Math.round(be.projectedRevenue)) : null },
      { label: "Projected gross profit", value: be.projectedGrossProfit !== null ? formatMoney(Math.round(be.projectedGrossProfit)) : null },
      { label: "Plan investment", value: formatMoney(plan.total) },
    ]);
    para("Revenue is not profit: projected gross profit already subtracts direct costs at your stated margin, but not the campaign investment itself. These figures follow from your own assumptions; they are planning arithmetic, not a forecast.");
  }

  // ── 8. Things worth checking ─────────────────────────────────────────────────

  sectionHeading("A few things worth checking");
  if (notes.length === 0) {
    para("Nothing stands out as a problem here. The balance of groundwork, reach, and testing looks proportionate to what you told us.");
  } else {
    bullets(notes.map((n) => (n.tone === "attention" ? `Worth attention: ${n.text}` : n.text)));
  }

  // ── 9. Scenarios ─────────────────────────────────────────────────────────────

  sectionHeading("The other ways this could go");
  table(
    [
      { header: "Scenario", width: 116 },
      { header: "Estimated range", width: 120, align: "r" },
      { header: "What it changes", width: 290 },
    ],
    SCENARIOS.map((meta) => {
      const s = result.scenarios[meta.key];
      return [
        `${meta.label}${meta.key === plan.key ? " (shown above)" : ""}`,
        formatRange(s.totalRange),
        meta.description,
      ];
    }),
  );
  para("Scenarios change scope: reach, channel count, creative coverage, and testing depth. They are not the same plan at three price points.");

  // ── 10. Assumptions ──────────────────────────────────────────────────────────

  sectionHeading("The assumptions behind these numbers");
  figures([
    { label: "Planning mode", value: financial.mode === "budget" ? "Budget-first" : "Goal-first" },
    { label: "Stated budget", value: financial.budgetTotal !== null ? formatMoney(financial.budgetTotal) : null },
    { label: "Goal", value: financial.goalCount !== null ? `${financial.goalCount.toLocaleString()} results` : null },
    { label: "Average value per customer", value: financial.avgValue !== null ? formatMoney(financial.avgValue) : null },
    {
      label: `Conversion rate${financial.assumedConversion ? " (planning assumption)" : ""}`,
      value: asPct(financial.conversionRate), flag: financial.assumedConversion,
    },
    {
      label: `Cost per result${financial.assumedCostPerResult ? " (planning assumption)" : ""}`,
      value: financial.costPerResult !== null ? formatMoney(financial.costPerResult, "USD", { cents: true }) : null,
      flag: financial.assumedCostPerResult,
    },
    {
      label: `Target frequency${financial.assumedFrequency ? " (planning assumption)" : ""}`,
      value: financial.targetFrequency !== null ? `${financial.targetFrequency}x per person` : null,
      flag: financial.assumedFrequency,
    },
    { label: "Gross margin", value: asPct(financial.marginPct) },
    { label: "Expected revenue", value: financial.expectedRevenue !== null ? formatMoney(financial.expectedRevenue) : null },
  ]);
  if (financial.assumedConversion || financial.assumedCostPerResult || financial.assumedFrequency) {
    para("Values marked as a planning assumption were not supplied; a starting point was used instead. They are the first numbers worth replacing with your own.");
  }

  // ── 11. Disclaimer ───────────────────────────────────────────────────────────

  sectionHeading("Please read this alongside the numbers");
  para("This report contains planning estimates based on the information and assumptions entered. Actual advertising costs and campaign performance vary by industry, market, audience, platform, competition, creative quality, and execution. Results are not guaranteed. Market figures are planning references, not quotes or guaranteed prices, and nothing here commits you or LV Branding to a price. This tool is for planning purposes only and is not financial advice.");
  para("Prepared with the LV Branding Campaign Investment Calculator. We are happy to work through any of it with you.");

  // ── Footer on every page ─────────────────────────────────────────────────────

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = PAGE_H - MARGIN - 10;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, fy - 8, MARGIN + CONTENT_W, fy - 8);
    setFont(7, false, MUTED);
    doc.text(`${PDF_TITLE} - ${PDF_SUBTITLE}`, MARGIN, fy);
    doc.text(`Page ${p} of ${pages}`, MARGIN + CONTENT_W / 2, fy, { align: "center" });
    setFont(7, true, BRAND);
    doc.text(PDF_SITE, MARGIN + CONTENT_W, fy, { align: "right" });
  }

  const buffer = doc.output("arraybuffer") as ArrayBuffer;
  return {
    blob:     new Blob([buffer], { type: "application/pdf" }),
    base64:   toBase64(buffer),
    filename: pdfFilename(),
    bytes:    buffer.byteLength,
  };
}

/** Saves the PDF locally. Revokes the object URL so the blob is not retained. */
export function downloadPdf(pdf: PlanPdf): void {
  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdf.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
