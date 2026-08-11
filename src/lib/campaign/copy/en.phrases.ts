// ── English: composed fragments, CTA, and the CRM brief ─────────────────────────
// Mirrors es.phrases.ts. These are the strings the calculator already produced;
// they live here so both languages resolve through one interface.

import { CTA_COPY, LEAD_INTENTS } from "../lead";
import type { CalcCopy } from "./types";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const enPhrases: CalcCopy["phrases"] = {
  essentialsReady:    (ready, total) => `${ready} of ${total} essentials ready`,
  componentsToReview: (n) => `${n} ${plural(n, "component", "components")} to review`,
  channelCount:       (n) => `${n} ${plural(n, "channel", "channels")}`,
  dayCount:           (n) => `${n} ${plural(n, "day", "days")}`,
  monthCount:         (n) => `${n} ${plural(n, "month", "months")}`,
  channelsSupported:  (supported, selected) => `${supported} of ${selected} selected`,
  feasibilityScore:   (score, label) => `${score}/100 · ${label}`,
  readinessScore:     (score, band) => `${score}/100 · ${band}`,
  planShown:          (scenario, total) => `${scenario} · ${total}`,
  scenarioShownHere:  "(shown above)",
  heldSeparately:     "held separately",
  notAnswered:        "Not answered",
  notNeeded:          "Not needed for this campaign",
  planningAssumption: "planning assumption",
  perPerson:          (n) => `${n}x per person`,
  resultsGoal:        (n) => `${n.toLocaleString()} results`,
  goalFirst:          (n) => `Goal-first: ${n.toLocaleString()} results`,
  alwaysOn:           "Always-on",
  fixedDate:          "Fixed date or launch window",
};

export const enCta: CalcCopy["cta"] = {
  byStatus: CTA_COPY,
  intents:  LEAD_INTENTS,
  name: "Your name",
  email: "Email",
  phone: "Phone",
  optional: "(optional)",
  intentQuestion: "What would help most right now?",
  disclosure: "Your plan goes with this as a PDF. See exactly what we receive.",
  plusLine: "your objective, channels, market, and the answers behind the plan.",
  submitting: "Preparing your plan",
  reassurance: "We email you the PDF and you can download it here too. No obligation, and the plan stays yours either way.",
  errorName: "Please add your name.",
  errorEmail: "Please add your email.",
  errorEmailInvalid: "That email does not look right.",
  submitFailed: "That did not go through. Please try again, or email us at",
  successHeading: (firstName) => `Got it, ${firstName}. Your plan is on its way.`,
  successEmailed: (email) =>
    `Your plan is heading to ${email} as a PDF, and it reached our team with everything you worked out here.`,
  successNotEmailed:
    "It reached our team with everything you worked out here. The PDF was too large to email, so grab it below and it is yours.",
  successFollowUp: "Someone will follow up within one business day, and they will have read the plan first.",
  successUnchanged: "Nothing on this page changed. Print it or copy the summary any time.",
  download: "Download your plan (PDF)",
};

export const enBrief: CalcCopy["brief"] = {
  planStatus:         "Plan status",
  available:          "Available investment",
  leanMinimum:        "Lean minimum",
  completeScope:      "Complete scope",
  gapMinimum:         "Gap to the lean minimum",
  gapComplete:        "Gap to the complete scope",
  planShown:          "Plan shown",
  startingPoint:      "Starting point",
  essentialsNotReady: "Essentials not ready",
  alsoMissing:        "Also missing",
  channelsVsFunding:  "Channels vs. funding",
  flagged:            "Flagged in the answers",
  noMediaActivation:  "preparation phase, no media activation",
  mediaSuffix:        (amount) => `${amount} media`,
  channelsVsFundingValue: (selected, supported) =>
    `${selected} selected, ${supported} supported once the lean minimum scope is paid for`,
};
