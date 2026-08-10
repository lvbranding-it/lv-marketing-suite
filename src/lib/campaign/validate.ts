// ── Campaign Investment Calculator: input validation ───────────────────────────
// Pure validation, kept out of the component layer so the persistence module can
// re-check a restored session without importing React.

import { z } from "zod";
import { ASSUMPTIONS, formatMoney, objectiveMeta } from "./config";
import type { CalculatorAnswers } from "./types";

export type StepErrors = Record<string, string>;

const moneyBounds = z.number()
  .min(ASSUMPTIONS.minBudget, `Enter at least ${formatMoney(ASSUMPTIONS.minBudget)} to build a meaningful plan.`)
  .max(ASSUMPTIONS.maxBudget, "That budget is above what this planner supports. Contact us directly for engagements at that scale.");

const goalBounds = z.number()
  .min(ASSUMPTIONS.minGoal, "Enter a goal of at least 1.")
  .max(ASSUMPTIONS.maxGoal, "That goal is above what this planner supports.");

const costBounds = z.number()
  .min(ASSUMPTIONS.minCostPerResult, "Cost must be above zero.")
  .max(ASSUMPTIONS.maxCostPerResult, "That cost looks too high. Double-check the number.");

const conversionBounds = z.number()
  .min(ASSUMPTIONS.minConversion, "Conversion rate must be above 0%.")
  .max(ASSUMPTIONS.maxConversion, "Conversion rate can't exceed 100%.");

const marginBounds = z.number()
  .min(ASSUMPTIONS.minMargin, "Margin must be above 0%.")
  .max(ASSUMPTIONS.maxMargin, "Margins above 95% are outside typical planning ranges.");

const frequencyBounds = z.number()
  .min(ASSUMPTIONS.minFrequency, "Frequency must be at least 1.")
  .max(ASSUMPTIONS.maxFrequency, "A frequency above 20 is outside typical planning ranges.");

function boundsError(schema: z.ZodType<number>, value: number): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Check this value.";
}

export function validateStep(step: number, answers: CalculatorAnswers): StepErrors {
  const errors: StepErrors = {};

  if (step === 0) {
    if (!answers.profile.audienceFocus) errors.audienceFocus = "Choose who this campaign primarily speaks to.";
    if (!answers.profile.stage) errors.stage = "Choose your business stage.";
    if (!answers.profile.reach) errors.reach = "Choose your market reach.";
    if (!answers.profile.industry) errors.industry = "Choose an industry. “Other” works fine.";
  }

  if (step === 1 && !answers.objective) {
    errors.objective = "Choose the single outcome that matters most for this campaign.";
  }

  if (step === 2) {
    if (!answers.scope.durationDays || answers.scope.durationDays < 7) errors.duration = "Campaigns shorter than a week rarely produce readable results. Enter at least 7 days.";
    if (answers.scope.durationDays > 730) errors.duration = "Enter a duration of two years or less.";
    if (answers.scope.channels.length === 0) errors.channels = "Select at least one advertising channel.";
  }

  if (step === 3 && !answers.destination) {
    errors.destination = "Choose what people should do after seeing the campaign. This decides which components your plan actually needs.";
  }

  if (step === 4) {
    const fin = answers.financial;
    if (fin.mode === "budget") {
      if (fin.budgetTotal === null) errors.budgetTotal = "Enter your total available campaign budget.";
      else {
        const e = boundsError(moneyBounds, fin.budgetTotal);
        if (e) errors.budgetTotal = e;
      }
      if (fin.expectedRevenue !== null && fin.expectedRevenue < 0) errors.expectedRevenue = "Revenue can't be negative.";
    } else {
      if (fin.goalCount === null) errors.goalCount = "Enter the result you're aiming for.";
      else {
        const e = boundsError(goalBounds, fin.goalCount);
        if (e) errors.goalCount = e;
      }
      if (fin.costPerResult === null) errors.costPerResult = "Enter a cost estimate, or use the planning assumption.";
      else {
        const e = boundsError(costBounds, fin.costPerResult);
        if (e) errors.costPerResult = e;
      }
      const needsConversion = answers.objective ? objectiveMeta(answers.objective).usesLeadStep : false;
      if (needsConversion) {
        if (fin.conversionRate === null) errors.conversionRate = "Enter a conversion rate, or use the planning assumption.";
        else {
          const e = boundsError(conversionBounds, fin.conversionRate);
          if (e) errors.conversionRate = e;
        }
      }
      const needsFrequency = answers.objective ? objectiveMeta(answers.objective).perThousand : false;
      if (needsFrequency) {
        if (fin.targetFrequency === null) errors.targetFrequency = "Enter a target frequency, or use the planning assumption.";
        else {
          const e = boundsError(frequencyBounds, fin.targetFrequency);
          if (e) errors.targetFrequency = e;
        }
      }
    }
    if (answers.financial.avgValue !== null && answers.financial.avgValue <= 0) errors.avgValue = "Average value must be above zero.";
    if (answers.financial.marginPct !== null) {
      const e = boundsError(marginBounds, answers.financial.marginPct);
      if (e) errors.marginPct = e;
    }
  }

  return errors;
}
