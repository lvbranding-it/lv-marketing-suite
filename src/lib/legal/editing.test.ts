import { describe, expect, it } from "vitest";
import { applyWording, hasCustomWording, wordingOf } from "./editing";
import { legalTemplate, LV_NOTICE, type LegalRenderInput } from "./templates";

const nda = legalTemplate("nda_mutual")!;
const input: LegalRenderInput = {
  language: "en", companyName: "All Business Solutions", signerName: "David Lopez", recipientEmail: "david@abs.com",
  values: { effectiveDate: "2026-10-15", businessPurpose: "Website project", party2Address: "1 Main St", lvAddress: LV_NOTICE.address, lvEmail: LV_NOTICE.email },
};
const studio = { signerName: "Mia Chen", signerEmail: "mia@studio.com", companyName: "Studio North", values: { address: "9 Oak Ave" } };

describe("editing a sent document", () => {
  it("sees the template's own text as unchanged, and a reworded paragraph as hand-edited", () => {
    const sent = nda.render(input);
    expect(hasCustomWording(nda.render(input), sent)).toBe(false);
    const reworded = sent.map((block, index) => (index === 1 ? { ...block, text: "Reworded intro." } : block));
    expect(hasCustomWording(nda.render(input), reworded)).toBe(true);
  });

  it("adds a party to the details while keeping hand-edited wording", () => {
    const reworded = nda.render(input).map((block, index) => (index === 1 ? { ...block, text: "Reworded intro." } : block));
    const withStudio = nda.render({ ...input, additionalParties: [studio] });
    const { blocks, fits } = applyWording(withStudio, wordingOf(reworded));
    expect(fits).toBe(true);
    expect(blocks[1].text).toBe("Reworded intro.");
    expect(blocks).toContainEqual({ kind: "meta", label: "Party 3", text: "Studio North" });
  });

  it("sets the wording aside when the template now makes different sections", () => {
    const release = legalTemplate("talent_release")!;
    const base = { ...input, values: { projectTitle: "Spot", location: "Houston" } };
    const wording = wordingOf(release.render(base));
    const withMinor = release.render({ ...base, values: { ...base.values, minorName: "Leo" } });
    const { blocks, fits } = applyWording(withMinor, wording);
    expect(fits).toBe(false);
    expect(blocks).toBe(withMinor);
    expect(applyWording(withMinor, null)).toEqual({ blocks: withMinor, fits: true });
  });
});
