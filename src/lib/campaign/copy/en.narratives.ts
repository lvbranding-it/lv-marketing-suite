// ── English narratives ──────────────────────────────────────────────────────────
// The exact prose the calculator has always produced, moved out of engine.ts so
// both languages sit behind one interface. The wording is unchanged on purpose:
// engine.test.ts asserts several of these strings, so a regression here fails
// the build rather than shipping quietly.

import {
  READINESS_BANDS, audienceBandMeta, formatMoney, formatRange, objectiveMeta,
  readinessItemMeta, scenarioMeta,
} from "../config";
import type { Narratives } from "./narratives";
import type { ChannelKey, ReadinessKey } from "../types";

const channelLabel = (c: ChannelKey) =>
  ({
    "google-search": "Google Search", "google-display": "Google Display",
    youtube: "YouTube", "meta-facebook": "Meta (Facebook)", instagram: "Instagram",
    linkedin: "LinkedIn", tiktok: "TikTok", programmatic: "Programmatic",
    email: "Email", other: "Other",
  }[c] ?? c);

function joinList(items: string[], conjunction: "and" | "or" = "and"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  // A pair normally reads "A and B", but when an item already contains its own
  // conjunction ("the reach or frequency") the comma keeps the split clear.
  if (items.length === 2) {
    const needsComma = items.some((i) => / (and|or) /.test(i));
    return `${items[0]}${needsComma ? "," : ""} ${conjunction} ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const campaignMonths = (days: number) => days / 30;

export const enNarratives: Narratives = {
  feasibility: (answers, fit) => {
    const months = Math.round(campaignMonths(answers.scope.durationDays));
    const duration = months >= 2 ? `${months} months` : `${answers.scope.durationDays} days`;
    const channels = fit.selectedChannels;
    const lean = fit.minimumViable;
    const full = fit.completeScope;

    if (!fit.applies) {
      return {
        headline: "Here is what your goal would take.",
        detail: `You told us the outcome you want, so we worked backwards from it. The full scope you selected estimates at ${formatRange(full.total)}, of which ${formatRange(full.protectedTotal)} is the protected campaign investment that makes the media worth buying.`,
      };
    }
    if (fit.status === "scope-supported") {
      return {
        headline: "Good news: your investment covers the scope you selected.",
        detail: `It supports the estimated ${formatRange(full.total)} for ${channels} channel${channels === 1 ? "" : "s"} over ${duration}. We would still walk through the details with you before anything goes live, because a plan on paper and a plan in market are not quite the same thing.`,
      };
    }
    if (fit.status === "focused-pilot") {
      return {
        headline: "You can start with a focused, one-channel campaign.",
        detail: `A lean professional campaign runs around ${formatRange(lean.total)}, while the full scope you selected is closer to ${formatRange(full.total)}. Starting focused is a perfectly good way in, and the plan below sets out exactly what it includes, what it reuses, and what waits for later.`,
      };
    }
    if (fit.status === "campaign-preparation") {
      return {
        headline: "You can build the foundation now and activate media next.",
        detail: `Your investment can cover the groundwork, but what is left does not yet reach the ${formatRange(lean.media)} a single channel needs over ${duration} to run properly. Splitting the work into two phases is a sensible way to do this well rather than thinly.`,
      };
    }
    return {
      headline: "Let's start with preparation.",
      detail: `Your ${formatMoney(fit.available)} sits below the ${formatRange(lean.total)} a campaign needs to run responsibly, and knowing that now is genuinely useful. It can fund a focused strategy and setup sprint, which is a strong first step. To be clear about what that means: this phase does not include running ads or delivering a complete campaign. For reference, the full scope you selected estimates at ${formatRange(full.total)}.`,
    };
  },

  paths: (answers, fit) => {
    if (!fit.applies || fit.status === "scope-supported") return [];
    const lean = fit.minimumViable;
    const full = fit.completeScope;
    const cheapest = lean.channelMediaFloors.slice().sort((a, b) => a.amount - b.amount)[0];

    return [
      {
        id: "preparation",
        title: "Start with a strategy sprint",
        text: `We would use the ${formatMoney(fit.available)} to define your objective and audience, recommend the one channel worth starting on, set the core message direction, and build a basic activation plan. Running ads is not part of this phase.`,
      },
      {
        id: "pilot",
        title: "Focus on one channel",
        text: `If you can reuse your existing brand identity, website, and tracking, a lean campaign on a single channel${cheapest ? ` (${channelLabel(cheapest.channel)}, about ${formatMoney(cheapest.amount)} of media)` : ""} comes in around ${formatRange(lean.total)}. Fewer things done properly usually beats more things done thinly.`,
      },
      {
        id: "increase",
        title: "Build up to the full scope",
        text: `The ${fit.selectedChannels}-channel campaign you first described estimates at ${formatRange(full.total)}, of which ${formatRange(full.protectedTotal)} is the work that makes the media worth buying. Worth keeping in view as a target, even if it is not this phase.`,
      },
    ];
  },

  scenarioRationale: (answers, plan) => {
    const sMeta = scenarioMeta(plan.key);
    const fin = answers.financial;

    if (fin.mode === "budget") {
      // Scenarios are priced from their scope, so the total does not always equal
      // the stated budget. Describing it by budgetFactor alone contradicted the
      // allocation table whenever the two diverged.
      const budget = fin.budgetTotal ?? 0;
      const total = plan.total;
      const delta = total - budget;
      const withinRounding = Math.abs(delta) <= Math.max(50, budget * 0.02);

      if (budget <= 0 || withinRounding) {
        return `${sMeta.label} allocates ${formatMoney(total)}, rounded for planning.`;
      }
      if (delta > 0) {
        return `${sMeta.label} prices this scope at ${formatMoney(total)}, about ${formatMoney(delta)} above the ${formatMoney(budget)} you stated. That is what the scope costs rather than a suggestion to spend more; the scenarios below show what a smaller one looks like.`;
      }
      return `${sMeta.label} prices this scope at ${formatMoney(total)}, leaving about ${formatMoney(-delta)} of your stated ${formatMoney(budget)} budget uncommitted while the campaign proves itself.`;
    }

    const obj = answers.objective ? objectiveMeta(answers.objective) : null;
    if (!obj || plan.estimatedResults === null) {
      return `${sMeta.label} is sized from your goal and cost assumptions.`;
    }
    const cost = fin.costPerResult ?? obj.defaultCostPerResult;
    if (obj.perThousand) {
      const frequency = fin.targetFrequency ?? obj.defaultFrequency ?? 3;
      const impressions = plan.estimatedResults * frequency;
      return `${sMeta.label} pursues about ${plan.estimatedResults.toLocaleString()} people at a frequency of ${frequency}, or roughly ${impressions.toLocaleString()} impressions at a ${formatMoney(cost)} CPM. That prices media at about ${formatMoney(plan.amounts.media)}, and the full total funds the strategy, creative, and management around it.`;
    }
    const unit = obj.usesLeadStep ? "lead" : obj.unitSingular;
    return `${sMeta.label} pursues about ${plan.estimatedResults.toLocaleString()} ${obj.unitNoun} at an assumed ${formatMoney(cost)} per ${unit}. That prices media at about ${formatMoney(plan.amounts.media)}, and the full total funds the strategy, creative, and management around it.`;
  },

  recommendationSummary: (answers, result) => {
    const ready = result.readiness;
    const channels = answers.scope.channels.length;
    const days = answers.scope.durationDays;
    const essentialGaps = ready.gaps.essential.length;

    const foundation =
      essentialGaps >= 5 ? "still needs most of the pieces it depends on"
      : essentialGaps >= 2 ? "still needs a few key pieces built"
      : essentialGaps === 1 ? "is nearly there, with one piece left to sort out"
      : "already has the pieces it needs";

    const scopeBits: string[] = [];
    scopeBits.push(`targets ${channels} advertising channel${channels === 1 ? "" : "s"}`);
    if (answers.objective === "awareness" && answers.financial.mode === "goal" && answers.financial.goalCount) {
      scopeBits.push(`aims to reach about ${(answers.financial.goalCount ?? 0).toLocaleString()} people`);
    } else if (answers.scope.audience !== "unknown") {
      scopeBits.push(`speaks to an audience of ${audienceBandMeta(answers.scope.audience).label.toLowerCase()}`);
    }
    scopeBits.push(`runs over ${days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`}`);

    const consequence = ready.score < 65
      ? "So we have set aside a real share of the investment for assets, tracking, testing, and running the campaign, before any of it goes to ads. That order matters more than most people expect."
      : "Because the groundwork is largely done, more of the investment can go toward reaching people, while still funding testing and someone to actively run it.";

    return `Your campaign ${foundation}, ${scopeBits.join(", ")}. ${consequence}`;
  },

  planLevers: (answers, result) => {
    const drivers: string[] = [];
    const isAwarenessGoal = answers.objective === "awareness" && answers.financial.mode === "goal";
    const goal = answers.financial.goalCount ?? 0;

    if (isAwarenessGoal && goal > 0) drivers.push("the scale of the audience you want to reach");
    else if (answers.scope.audience === "over-1m" || answers.scope.audience === "100k-1m") drivers.push("the size of the audience");
    if (result.readiness.gaps.essential.length >= 2) drivers.push("the fact that essential campaign components still need to be created");
    if (answers.scope.channels.length >= 3) drivers.push("the number of channels selected");

    const levers: string[] = [];
    if (isAwarenessGoal && goal > 0) levers.push("reducing the reach or frequency");
    if (answers.scope.channels.length >= 2) levers.push("narrowing the channel mix");
    if (result.readiness.gaps.essential.length >= 1 || result.readiness.needsReview >= 1) levers.push("using existing campaign assets");
    if (levers.length === 0) levers.push("adjusting the scope");

    // Drivers are all true at once ("and"); levers are alternatives ("or").
    const driverText = drivers.length > 0
      ? `The number comes from ${joinList(drivers, "and")}.`
      : "The number comes from the scope you described.";
    return `${driverText} ${capitalize(joinList(levers, "or"))} would change it, and any of those is a reasonable choice to make.`;
  },

  readiness: (result) => {
    const bandMeta = READINESS_BANDS.find((b) => b.band === result.band);
    const label = (k: ReadinessKey) => readinessItemMeta(k).label.toLowerCase();
    const parts: string[] = [bandMeta?.summary ?? ""];

    if (result.gaps.essential.length > 0) {
      const names = result.gaps.essential.slice(0, 4).map(label);
      const more = result.gaps.essential.length - names.length;
      // Fold the overflow count into the list so it gets one conjunction, not two.
      const items = more > 0 ? [...names, `${more} more`] : names;
      parts.push(`Based on your answers, ${joinList(items)} need attention before launch.`);
    }
    if (result.gaps.recommended.length > 0) {
      const names = result.gaps.recommended.slice(0, 3).map(label);
      parts.push(
        `${capitalize(joinList(names))} ${names.length === 1 ? "is" : "are"} recommended because of the channels selected, but the exact requirements should be confirmed during campaign planning.`,
      );
    }
    if (result.gaps.essential.length === 0 && result.gaps.recommended.length === 0) {
      parts.push("Nothing essential is outstanding, so the plan leans toward distribution and optimization.");
    }
    return parts.filter(Boolean).join(" ");
  },

  balance: {
    mediaHeavy: (mediaPct) =>
      `Your current allocation places ${mediaPct}% into paid media, but your answers indicate the campaign creative still needs development. Consider strengthening the foundation before increasing media spend.`,
    tracking:
      "Conversion tracking isn't ready yet. Without it, media spend can't be evaluated or improved. Your digital-experience allocation reserves room to set it up first.",
    landing:
      "Your answers indicate the landing page still needs work. Traffic converts at the destination, so this is worth funding before scaling media.",
    channels: (selected, supported) =>
      `You selected ${selected} channels, but the media budget in this scenario comfortably supports about ${supported}. Fewer channels with real budgets usually beat many channels with thin ones.`,
    testing:
      "Testing sits below 5% of the plan. A small reserve for experiments is usually what turns a decent campaign into a good one by the second month.",
    goalGap: (required, allocated) =>
      `Reaching this scenario's goal is estimated to need about ${required} in media, but the current allocation assigns ${allocated}. Either the goal, the assumptions, or the media share needs another look.`,
    timeline:
      "Several creative assets still need production inside a short, fixed window. Building lead time into the plan, or simplifying the launch creative, will protect the schedule.",
    reachVsAudience: (goal, audienceLabel) =>
      `Your desired reach (${goal.toLocaleString()} people) is larger than the audience size you selected earlier (${audienceLabel.toLowerCase()}). Review your audience estimate or expand the campaign's geographic market.`,
    localVsScale:
      "You described a local market with an audience over 1 million people. That combination is unusual; either the audience estimate includes people outside your service area, or the market reach is broader than local.",
    durationVsScale:
      "Reaching an audience this large inside 30 days concentrates the entire media budget into a very short window. A longer flight usually buys the same reach at a healthier pace, with room to learn.",
  },

  summary: {
    title:         "CAMPAIGN INVESTMENT PLAN (planning estimate)",
    objective:     "Objective",
    duration:      "Duration",
    channels:      "Channels",
    startingPoint: "Your starting point",
    allocation:    "Allocation",
    total:         "Total investment",
    reserve:       "Campaign reserve",
    disclaimer:    "Estimates depend on the assumptions entered and do not guarantee campaign performance.",
  },
};
