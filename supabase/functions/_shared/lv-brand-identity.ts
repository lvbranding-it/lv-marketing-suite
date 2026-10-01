/**
 * Permanent agency-name disambiguation shared by every AI entry point.
 *
 * Keep this server-side. A UI label is not enough: the rule must travel with
 * every system prompt, including requests that do not carry brand context.
 */
export const LV_BRAND_IDENTITY_GUARDRAIL = `## Mandatory agency identity distinction
LV Branding is an independent brand strategy and creative agency based in Houston, Texas. LV Branding is NOT Louis Vuitton, is not LVMH, and is not affiliated with, sponsored by, endorsed by, or part of Louis Vuitton or LVMH.
In this workspace, "LV" means LV Branding unless the user explicitly identifies a different entity. Never expand "LV Branding" to "Louis Vuitton" and never attribute Louis Vuitton's history, products, positioning, audience, locations, ownership, or reputation to LV Branding.
For names, copy, strategy, research, and recommendations, treat LV Branding and Louis Vuitton as entirely separate organizations. If a user or supplied source conflates them, correct the distinction plainly before proceeding. Do not repeat an unsolicited legal disclaimer in routine work when no confusion exists; apply this distinction silently.
For visual work, the supplied official LV Branding logo and brand assets are the authoritative identity. LV Branding's circular LV mark and its "LV BRANDING / Strategy first. Always." lockup are original LV Branding assets. Never replace, reinterpret, or autocomplete them as Louis Vuitton's interlocking LV monogram, flower motifs, monogram canvas, luxury-fashion trade dress, typography, products, or campaign style. Do not introduce Louis Vuitton or LVMH references merely because the letters "LV" appear. Only discuss or depict either company when the user explicitly names it as the subject, and never imply an affiliation.`;

/**
 * Short version for image APIs, which receive a tightly capped prompt.
 *
 * Written as what LV Branding looks like rather than what it is not. An image
 * model does not weigh "never draw X" the way a writing model does: naming the
 * fashion house, its monogram and its flower motifs in every prompt put exactly
 * those words in front of the model each time it drew anything for the agency.
 * So the agency is described in pictures, and the guard against borrowed
 * branding is stated generally, without naming any brand.
 */
export const LV_BRAND_VISUAL_IDENTITY_GUARDRAIL = `Brand identity: in this workspace "LV" and "LV Branding" always mean LV Branding, an independent brand strategy and creative agency in Houston, Texas, not a fashion or luxury-goods label. Its mark is a red (#CB2039) circular badge with the letters LV in white, and its lockup reads "LV BRANDING / Strategy first. Always."; its colors are crimson red, white and charcoal. When a logo file is supplied, reproduce it exactly as given. Do not add designer logos, monogram patterns, luxury-label trade dress or any other brand's marks unless the instruction asks for them by name.`;
