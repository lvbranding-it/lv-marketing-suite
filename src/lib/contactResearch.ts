/**
 * Shared contact research utilities used by ResearchQueue and ContactSlideOver.
 * Runs real HTTP verification via the contact-verify edge function before
 * sending data to Claude, so the AI analysis is grounded in actual facts.
 */

import { supabase } from "@/integrations/supabase/client";
import { type ImportedContact } from "@/hooks/useContacts";

// ── Verification result shape (mirrors edge function output) ─────────────────
export interface VerifyResult {
  website: {
    url: string | null;
    live: boolean | null;
    status: number | null;
    redirected_to: string | null;
    error: string | null;
  };
  email: {
    address: string | null;
    format_valid: boolean;
    domain: string | null;
    mx_valid: boolean | null;
    mx_records: string[];
    error: string | null;
  };
  linkedin: {
    url: string | null;
    format_valid: boolean;
    username: string | null;
  };
}

// ── Call the edge function to run real checks ────────────────────────────────
export async function verifyContact(contact: ImportedContact): Promise<VerifyResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("contact-verify", {
      body: {
        website:      contact.website,
        email:        contact.email,
        linkedin_url: contact.linkedin_url,
      },
    });
    if (error) {
      console.warn("[contactResearch] verify error:", error);
      return null;
    }
    return data as VerifyResult;
  } catch (e) {
    console.warn("[contactResearch] invoke failed:", e);
    return null;
  }
}

// ── Format verification results as human-readable lines ─────────────────────
function formatVerification(v: VerifyResult): string {
  const lines: string[] = ["\n## Pre-Verification Results (actual HTTP checks)"];

  // Website
  if (!v.website.url) {
    lines.push("**Website:** ⚠️ Not provided");
  } else if (v.website.live) {
    lines.push(
      `**Website (${v.website.url}):** ✅ Responding — HTTP ${v.website.status}` +
      (v.website.redirected_to ? ` (redirects to ${v.website.redirected_to})` : "")
    );
  } else {
    lines.push(
      `**Website (${v.website.url}):** ❌ Not responding — ${
        v.website.error ?? `HTTP ${v.website.status ?? "timeout"}`
      }`
    );
  }

  // Email domain
  if (!v.email.address) {
    lines.push("**Email:** ⚠️ Not provided");
  } else if (!v.email.format_valid) {
    lines.push(`**Email (${v.email.address}):** ❌ Invalid format`);
  } else if (v.email.mx_valid) {
    lines.push(
      `**Email domain (@${v.email.domain}):** ✅ Valid — MX records confirmed` +
      (v.email.mx_records.length ? ` (${v.email.mx_records[0]})` : "")
    );
  } else {
    lines.push(
      `**Email domain (@${v.email.domain}):** ❌ No MX records found — domain likely cannot receive email`
    );
  }

  // LinkedIn
  if (!v.linkedin.url) {
    lines.push("**LinkedIn:** ⚠️ Not provided");
  } else if (v.linkedin.format_valid) {
    lines.push(`**LinkedIn:** ✅ Valid format — linkedin.com/in/${v.linkedin.username}`);
  } else {
    lines.push(`**LinkedIn (${v.linkedin.url}):** ❌ Not a valid LinkedIn profile URL`);
  }

  return lines.join("\n");
}

// ── System prompt ────────────────────────────────────────────────────────────
export const RESEARCH_SYSTEM_PROMPT = `You are a B2B sales intelligence analyst. Your job is to assess whether a contact is a real, reachable prospect worth pursuing.

You will receive contact data AND the results of actual HTTP verification checks that have already been run. Base your analysis on these real results — do not guess or speculate about things that have already been verified.

Return a research brief with exactly these sections:

## Validity Assessment
Based on the verification results provided, is this a real, reachable person? State High / Medium / Low confidence and explain why, citing the actual check results.

## Company Overview
What is known about this company based on the data provided? Assess their scale, industry, and credibility.

## Prospect Fit
Why this person's role makes them worth approaching. Be specific about their decision-making power.

## Red Flags
Cite any specific concerns from the verification data (dead website, bad email domain, missing LinkedIn, etc.). Write "None detected" only if all checks passed.

## Verdict
Choose exactly one: 🟢 **Strong Lead** / 🟡 **Needs More Research** / 🔴 **Likely Invalid**
One sentence. Reference the most decisive verification result.

Be direct and concise — 2 sentences max per section.`;

// ── Build the user message with real verification data ────────────────────────
export function buildResearchPrompt(c: ImportedContact, verification: VerifyResult | null): string {
  const contactLines = [
    `**Name:** ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}`,
    `**Title:** ${c.title || "Unknown"}`,
    `**Company:** ${c.company || "Unknown"}`,
    `**Email:** ${c.email || "Not provided"}`,
    `**LinkedIn:** ${c.linkedin_url || "Not provided"}`,
    `**Website:** ${c.website || "Not provided"}`,
    `**Location:** ${[c.city, c.state, c.country].filter(Boolean).join(", ") || "Unknown"}`,
    `**Industry:** ${c.industry || "Unknown"}`,
    `**Company size:** ${c.employees_range || "Unknown"}`,
    `**Source:** ${c.source}`,
  ];

  const verificationSection = verification
    ? formatVerification(verification)
    : "\n## Pre-Verification Results\n⚠️ Verification checks could not be completed — use caution.";

  return (
    `Please research and assess this B2B contact:\n\n${contactLines.join("\n")}` +
    verificationSection
  );
}
