// ── Campaign calculator lead payload ────────────────────────────────────────────
// Turns a finished plan into a lead for the existing `submit-av-lead` endpoint.
//
// Two rules govern this file:
//   1. Only what the prospect chose to share leaves the browser, and only when
//      they submit. Nothing here runs on its own.
//   2. The payload has to arrive as a brief a person can act on without opening
//      the calculator. A sales rep should be able to call from the CRM note alone.
//
// The endpoint's columns are generic (they were built for event forms), so the
// campaign context is mapped onto them deliberately and the per-form labels in
// the edge function's FORM_CONFIGS rename them for the emails and CRM note.

import {
  AUDIENCE_BANDS, CHANNELS, DESTINATIONS, FEASIBILITY_BANDS, READINESS_BANDS,
  formatMoney, formatRange, objectiveMeta, readinessItemMeta,
} from "./config";
import type {
  CalculationResult, CalculatorAnswers, ScenarioPlan,
} from "./types";

/** The form key the edge function uses to pick labels, tags, and reply copy. */
export const LEAD_SOURCE = "campaign-calculator";

export type LeadIntent = "second-opinion" | "build-missing" | "quote" | "send-plan";

export const LEAD_INTENTS: { key: LeadIntent; label: string; hint: string }[] = [
  {
    key: "second-opinion",
    label: "A second opinion on these numbers",
    hint: "We look through the plan with you and say where we agree and where we don't.",
  },
  {
    key: "build-missing",
    label: "Help building the missing pieces",
    hint: "We scope the components your plan says are not ready yet.",
  },
  {
    key: "quote",
    label: "A quote for this scope",
    hint: "We turn the plan into a proposal with real numbers and a timeline.",
  },
  {
    key: "send-plan",
    label: "Just send me the plan for now",
    hint: "We email you a copy and leave the next move to you.",
  },
];

export const intentMeta = (key: LeadIntent) =>
  LEAD_INTENTS.find((i) => i.key === key) as (typeof LEAD_INTENTS)[number];

/**
 * The ask, worded for where the prospect actually landed. Someone told their
 * budget cannot run a campaign should not be handed the same button as someone
 * whose scope is fully funded.
 */
export const CTA_COPY: Record<
  CalculationResult["feasibility"]["status"],
  { heading: string; body: string; action: string }
> = {
  "preparation-only": {
    heading: "Want help making this first phase count?",
    body:
      "Knowing the real number before you spend it is the hard part, and you have that now. We are happy to look at what a focused preparation phase would cover for you and what it sets up next.",
    action: "Talk through the first phase",
  },
  "campaign-preparation": {
    heading: "Want help sequencing the two phases?",
    body:
      "You have enough to build the foundation now and activate media next. We can work out what belongs in each phase with you, so nothing has to get built twice.",
    action: "Map out both phases",
  },
  "focused-pilot": {
    heading: "Want a second look before you spend?",
    body:
      "A focused pilot looks workable here. We are happy to pressure-test the channel choice, the creative it needs, and the media split with you first.",
    action: "Pressure-test this pilot",
  },
  "scope-supported": {
    heading: "Ready when you are.",
    body:
      "Your investment covers the scope you selected. We would still walk through the strategy, creative requirements, and media structure with you before anything goes live.",
    action: "Start the conversation",
  },
};

export interface LeadContact {
  name:  string;
  email: string;
  phone: string;
  /** Honeypot. Real people leave it empty. */
  hp:    string;
}

/** One labelled line of the plan brief, shared by the emails and the CRM note. */
export interface PlanLine { label: string; value: string }

const labelsFor = <T extends string>(
  keys: T[],
  source: { key: T; label: string }[],
): string[] => keys.map((k) => source.find((s) => s.key === k)?.label ?? k);

/**
 * The plan brief. This is what makes the lead qualified: status, the money, the
 * gap, and which components are missing, in the order a rep would want them.
 */
export function planSummaryLines(
  answers: CalculatorAnswers,
  result: CalculationResult,
  plan: ScenarioPlan,
): PlanLine[] {
  const { feasibility, readiness } = result;
  const band = FEASIBILITY_BANDS.find((b) => b.status === feasibility.status);
  const readinessBand = READINESS_BANDS.find((b) => b.band === readiness.band);
  const lines: PlanLine[] = [];

  lines.push({
    label: "Plan status",
    value: `${band?.label ?? feasibility.status} (feasibility ${feasibility.score}/100)`,
  });

  if (feasibility.applies && feasibility.available > 0) {
    lines.push({ label: "Available investment", value: formatMoney(feasibility.available) });
  }
  lines.push({
    label: "Lean minimum",
    value: formatRange(feasibility.minimumViable.total),
  });
  lines.push({
    label: "Complete scope",
    value: formatRange(feasibility.completeScope.total),
  });

  if (feasibility.applies && feasibility.minimumFundingGap.max > 0) {
    lines.push({
      label: "Gap to the lean minimum",
      value: formatRange(feasibility.minimumFundingGap),
    });
  }
  if (feasibility.applies && feasibility.completeScopeFundingGap.max > 0) {
    lines.push({
      label: "Gap to the complete scope",
      value: formatRange(feasibility.completeScopeFundingGap),
    });
  }

  lines.push({
    label: "Plan shown",
    value:
      `${formatMoney(plan.total)} total` +
      (plan.isPreparationPhase ? " (preparation phase, no media activation)" : "") +
      (plan.mediaSpend > 0 ? ` · ${formatMoney(plan.mediaSpend)} media` : ""),
  });

  lines.push({
    label: "Starting point",
    value:
      `${readiness.score}/100 (${readinessBand?.label ?? readiness.band}) · ` +
      `${readiness.essentialReady} of ${readiness.essentialTotal} essentials ready`,
  });

  const missing = readiness.gaps.essential.map((k) => readinessItemMeta(k).label);
  if (missing.length > 0) {
    lines.push({ label: "Essentials not ready", value: missing.join(", ") });
  }
  const recommended = readiness.gaps.recommended.map((k) => readinessItemMeta(k).label);
  if (recommended.length > 0) {
    lines.push({ label: "Also missing", value: recommended.join(", ") });
  }

  // Stated against the lean scope's protected minimum, which is not the same
  // measure as the media line in the plan above. Worded so the two cannot be
  // read as contradicting each other.
  if (feasibility.applies && feasibility.selectedChannels > feasibility.supportedChannels) {
    lines.push({
      label: "Channels vs. funding",
      value:
        `${feasibility.selectedChannels} selected, ${feasibility.supportedChannels} supported ` +
        `once the lean minimum scope is paid for`,
    });
  }

  if (result.contradictions.length > 0) {
    lines.push({
      label: "Flagged in the answers",
      value: result.contradictions.map((c) => c.text).join(" · "),
    });
  }

  return lines;
}

/** The body posted to `submit-av-lead`. Field names are the endpoint's, not ours. */
export interface CampaignLeadBody {
  source:          string;
  lang:            string;
  event_type:      string;
  services:        string[];
  industry:        string | null;
  event_timeframe: string | null;
  venue:           string | null;
  attendees:       string | null;
  budget:          string | null;
  contact_name:    string;
  contact_email:   string;
  contact_phone:   string | null;
  company:         string | null;
  message:         string | null;
  plan_summary:    PlanLine[];
  /** The plan PDF, attached to both emails. Omitted if generation failed. */
  attachment?:     { filename: string; content_base64: string };
  hp:              string;
}

export function buildLeadBody(
  answers: CalculatorAnswers,
  result: CalculationResult,
  plan: ScenarioPlan,
  intent: LeadIntent,
  contact: LeadContact,
): CampaignLeadBody {
  const { profile, scope, financial } = answers;
  const objective = answers.objective ? objectiveMeta(answers.objective).label : null;
  const destination = answers.destination
    ? DESTINATIONS.find((d) => d.key === answers.destination)?.label ?? null
    : null;
  const audience = AUDIENCE_BANDS.find((b) => b.key === scope.audience);

  const budgetText =
    financial.mode === "budget" && financial.budgetTotal
      ? formatMoney(financial.budgetTotal)
      : financial.mode === "goal" && financial.goalCount
        ? `Goal-first: ${financial.goalCount.toLocaleString()} results`
        : null;

  // `message` carries what a rep reads first, so it leads with the objective
  // rather than repeating the structured lines below it.
  const message = [
    objective ? `Objective: ${objective}` : null,
    `Market: ${profile.reach ?? "not stated"} · ${profile.stage ?? "stage not stated"} · speaks to ${profile.audienceFocus ?? "not stated"}`,
    scope.timeSensitive ? "Fixed date or launch window." : "Always-on, no fixed date.",
  ].filter(Boolean).join("\n");

  return {
    source:          LEAD_SOURCE,
    lang:            "en",
    event_type:      intentMeta(intent).label,
    services:        labelsFor(scope.channels, CHANNELS),
    industry:        profile.industry || null,
    event_timeframe: `${scope.durationDays} days`,
    venue:           destination,
    attendees:       audience && audience.key !== "unknown" ? audience.label : null,
    budget:          budgetText,
    contact_name:    contact.name.trim(),
    contact_email:   contact.email.trim(),
    contact_phone:   contact.phone.trim() || null,
    company:         null,
    message,
    plan_summary:    planSummaryLines(answers, result, plan),
    hp:              contact.hp,
  };
}

/** Same check the endpoint runs, so the user hears about it before the round trip. */
export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
