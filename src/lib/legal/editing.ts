// Editing a sent LegalSigns document: re-creating it from its template with
// changed parties or details, and keeping wording that was changed by hand.

import type { LegalBlock } from "./templates";

/** The blocks a person can reword: everything but the details list, which comes from the form. */
export const wordingOf = (blocks: LegalBlock[]) => blocks.filter((block) => block.kind !== "meta");

/** True when the stored text differs from what the template makes of its details: it was reworded. */
export function hasCustomWording(rendered: LegalBlock[], stored: LegalBlock[]) {
  const made = wordingOf(rendered);
  const kept = wordingOf(stored);
  return made.length !== kept.length || made.some((block, index) => block.kind !== kept[index].kind || block.text !== kept[index].text);
}

/**
 * The template's blocks with reworded text laid over them, in order. When the
 * template now makes a different set of sections (a detail added or removed
 * one), the rewording no longer fits and the template's text is used.
 */
export function applyWording(rendered: LegalBlock[], wording: LegalBlock[] | null): { blocks: LegalBlock[]; fits: boolean } {
  if (!wording) return { blocks: rendered, fits: true };
  const slots = wordingOf(rendered);
  if (slots.length !== wording.length || slots.some((block, index) => block.kind !== wording[index].kind)) {
    return { blocks: rendered, fits: false };
  }
  let next = 0;
  return { blocks: rendered.map((block) => (block.kind === "meta" ? block : { ...block, text: wording[next++].text } as LegalBlock)), fits: true };
}
