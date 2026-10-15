import { describe, expect, it } from "vitest";
import { LEGAL_TEMPLATES, legalDate, legalTemplate, missingLegalFields, PRODUCER, signerRoleFor } from "./templates";

const base = { companyName: "Casa Melilla", signerName: "Ana Ruiz" };

describe("legal templates", () => {
  it("offers the Suite 55 documents and holds the NDAs back until their wording arrives", () => {
    expect(LEGAL_TEMPLATES.filter((template) => template.available).map((template) => template.key)).toEqual([
      "photo_release", "media_release", "talent_release", "location_release", "client_approval",
    ]);
    expect(legalTemplate("nda_mutual")?.available).toBe(false);
    expect(legalTemplate("nda_one_way")?.available).toBe(false);
  });

  it("fills a photo release in English with the signer, company, project and producer", () => {
    const blocks = legalTemplate("photo_release")!.render({ ...base, language: "en", values: { projectTitle: "Fall Menu", productionDate: "2026-10-20" } });
    expect(blocks[0]).toEqual({ kind: "title", text: "Photo Release" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Company", text: "Casa Melilla" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Date", text: "October 20, 2026" });
    const text = blocks.map((block) => block.text).join("\n");
    expect(text).toContain(`I, Ana Ruiz, hereby grant to ${PRODUCER}`);
    expect(text).toContain('the project entitled "Fall Menu"');
    expect(text).toContain("print, digital, web, social media, advertising, and promotional materials");
  });

  it("writes the same release in Spanish", () => {
    const blocks = legalTemplate("photo_release")!.render({ ...base, language: "es", values: { projectTitle: "Menú de otoño", productionDate: "2026-10-20" } });
    expect(blocks[0]).toEqual({ kind: "title", text: "Autorización de uso de fotografías" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Empresa", text: "Casa Melilla" });
    expect(blocks.map((block) => block.text).join("\n")).toContain("Yo, Ana Ruiz, por medio del presente otorgo a LV Branding LLC");
  });

  it("names the minor as the subject and adds the guardian clause when a guardian signs", () => {
    const blocks = legalTemplate("talent_release")!.render({ ...base, language: "en", values: { projectTitle: "Spot", location: "Houston", minorName: "Leo Ruiz" } });
    const text = blocks.map((block) => block.text).join("\n");
    expect(text).toContain("I, Leo Ruiz (\"Talent\")");
    expect(text).toContain("I am a parent or legal guardian of Leo Ruiz");
  });

  it("signs a release for a minor as their parent or guardian", () => {
    const template = legalTemplate("photo_release")!;
    expect(signerRoleFor(template, {}, "en")).toBe("Subject");
    expect(signerRoleFor(template, { minorName: " Leo Ruiz " }, "en")).toBe("Parent or guardian of Leo Ruiz");
    expect(signerRoleFor(template, { minorName: "Leo Ruiz" }, "es")).toBe("Padre, madre o tutor de Leo Ruiz");
    expect(signerRoleFor(legalTemplate("location_release")!, { minorName: "Leo" }, "en")).toBe("Property Owner / Representative");
  });

  it("leaves a line for anything not filled in, and lists required fields left empty", () => {
    const template = legalTemplate("location_release")!;
    const blocks = template.render({ ...base, language: "en", values: {} });
    expect(blocks).toContainEqual({ kind: "meta", label: "Property", text: "________________________" });
    expect(missingLegalFields(template, { projectTitle: "Spot" }, "en")).toEqual(["Property name", "Property address", "Date of access"]);
  });

  it("writes the approval decision in words", () => {
    const blocks = legalTemplate("client_approval")!.render({
      ...base, language: "es",
      values: { projectTitle: "Web", approvalType: "final_deliverables", decision: "approved_with_changes", deliverableDescription: "Sitio web" },
    });
    expect(blocks).toContainEqual({ kind: "meta", label: "Decisión", text: "Aprobado con cambios" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Tipo de aprobación", text: "Entregables finales" });
  });

  it("writes dates in each language", () => {
    expect(legalDate("2026-01-05", "en")).toBe("January 5, 2026");
    expect(legalDate("2026-01-05", "es")).toBe("5 de enero de 2026");
    expect(legalDate("", "en")).toBe("________________________");
  });
});
