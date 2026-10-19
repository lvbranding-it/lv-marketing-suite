import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { NDA_TEXT } from "./ndaText";
import { fieldDefaults, LEGAL_TEMPLATES, legalDate, legalTemplate, LV_NOTICE, missingLegalFields, missingPartyFields, PRODUCER, signerRoleFor, signerRolesFor } from "./templates";

const base = { companyName: "Casa Melilla", signerName: "Ana Ruiz" };

describe("legal templates", () => {
  it("offers both NDAs and the Suite 55 documents", () => {
    expect(LEGAL_TEMPLATES.filter((template) => template.available).map((template) => template.key)).toEqual([
      "nda_mutual", "nda_one_way", "photo_release", "media_release", "talent_release", "location_release", "client_approval",
    ]);
  });

  it("marks only the NDAs' Spanish as LV Branding's approved text", () => {
    expect(LEGAL_TEMPLATES.filter((template) => template.spanishApproved).map((template) => template.key)).toEqual(["nda_mutual", "nda_one_way"]);
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
    expect(signerRoleFor(template, { ...base, language: "en", values: {} })).toBe("Subject");
    expect(signerRoleFor(template, { ...base, language: "en", values: { minorName: " Leo Ruiz " } })).toBe("Parent or guardian of Leo Ruiz");
    expect(signerRoleFor(template, { ...base, language: "es", values: { minorName: "Leo Ruiz" } })).toBe("Padre, madre o tutor de Leo Ruiz");
    expect(signerRoleFor(legalTemplate("location_release")!, { ...base, language: "en", values: { minorName: "Leo" } })).toBe("Property Owner / Representative");
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

describe("mutual NDA", () => {
  const nda = legalTemplate("nda_mutual")!;
  const values = {
    effectiveDate: "2026-10-20", businessPurpose: "Evaluating a rebrand of Casa Melilla's restaurants",
    party2Address: "100 Main St, Houston, TX 77002", lvAddress: "LV Branding address", lvEmail: "admin@lvbranding.com",
  };
  const text = (blocks: { text: string }[]) => blocks.map((block) => block.text);

  afterEach(() => vi.useRealTimers());

  it("prints each NDA's approved text in full, all 14 sections in order, in each language", () => {
    for (const [key, kind] of [["nda_mutual", "mutual"], ["nda_one_way", "oneWay"]] as const) {
      for (const language of ["en", "es"] as const) {
        const words = NDA_TEXT[kind][language];
        const lines = text(legalTemplate(key)!.render({ ...base, language, values }));
        expect(lines[0]).toBe(words.title);
        expect(lines[1]).toBe(words.intro);
        expect(words.sections).toHaveLength(14);
        const sections = words.sections.flat();
        const start = lines.indexOf(sections[0]);
        expect(lines.slice(start, start + sections.length)).toEqual(sections);
        expect(lines[lines.length - 1]).toBe(words.signingNote);
      }
    }
    expect(NDA_TEXT.oneWay.en.title).toBe("One Way Nondisclosure Agreement");
    expect(NDA_TEXT.oneWay.es.title).toBe("Acuerdo Unilateral de Confidencialidad");
  });

  it("calls the one-way NDA's parties the Disclosing and Receiving Party", () => {
    const oneWay = legalTemplate("nda_one_way")!;
    const blocks = oneWay.render({ ...base, language: "en", values });
    expect(blocks).toContainEqual({ kind: "meta", label: "Disclosing Party", text: PRODUCER });
    expect(blocks).toContainEqual({ kind: "meta", label: "Receiving Party", text: "Casa Melilla" });
    expect(oneWay.render({ ...base, language: "es", values })).toContainEqual({ kind: "meta", label: "Parte Receptora", text: "Casa Melilla" });
    expect(signerRoleFor(oneWay, { ...base, language: "en", values })).toBe("Receiving Party · Casa Melilla");
    expect(signerRoleFor(oneWay, { ...base, language: "es", values })).toBe("Parte Receptora · Casa Melilla");
    expect(oneWay.countersignerRole).toEqual({ en: "Disclosing Party", es: "Parte Reveladora" });
    expect(oneWay.fields.find((field) => field.key === "party2Address")!.label).toEqual({ en: "Receiving Party address", es: "Domicilio de la Parte Receptora" });
  });

  it("fills in both parties", () => {
    const blocks = nda.render({ ...base, language: "en", recipientEmail: "ana@casamelilla.com", values: { ...values, party2Entity: "Texas limited liability company" } });
    expect(blocks).toContainEqual({ kind: "meta", label: "Effective date", text: "October 20, 2026" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Party 1", text: PRODUCER });
    expect(blocks).toContainEqual({ kind: "meta", label: "Party 2", text: "Casa Melilla" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Entity type and jurisdiction, if applicable", text: "Texas limited liability company" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Address", text: "100 Main St, Houston, TX 77002" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Notice email", text: "ana@casamelilla.com" });
    expect(blocks).toContainEqual({ kind: "meta", label: "Business purpose", text: values.businessPurpose });
  });

  it("names Party 2 by the legal name given, else the company, else the person, who then signs personally", () => {
    const party2 = (input: Partial<typeof base> & { values?: Record<string, string> }) =>
      nda.render({ ...base, language: "en", values, ...input }).find((block) => block.kind === "meta" && block.label === "Party 2")!.text;
    expect(party2({ values: { ...values, party2Name: "Casa Melilla Group LLC" } })).toBe("Casa Melilla Group LLC");
    expect(party2({})).toBe("Casa Melilla");
    expect(party2({ companyName: " " })).toBe("Ana Ruiz");
    expect(nda.render({ ...base, companyName: "", language: "es", values }))
      .toContainEqual({ kind: "meta", label: "Tipo de entidad y jurisdicción, si corresponde", text: "No aplica" });
    expect(signerRoleFor(nda, { ...base, language: "en", values })).toBe("Party 2 · Casa Melilla");
    expect(signerRoleFor(nda, { ...base, companyName: "", language: "es", values })).toBe("Parte 2 · Ana Ruiz");
    expect(nda.countersignerRole.en).toBe("Party 1");
  });

  it("starts with today's date in Houston and LV Branding's notice details", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T03:30:00Z")); // still the 15th in Houston
    expect(fieldDefaults(nda)).toEqual({ effectiveDate: "2026-10-15", lvAddress: LV_NOTICE.address, lvEmail: LV_NOTICE.email });
    expect(missingLegalFields(nda, {}, "en")).toEqual(["Effective date", "Business purpose", "Party 2 address", "LV Branding address", "LV Branding notice email"]);
  });
});

describe("NDAs with more parties", () => {
  const values = { effectiveDate: "2026-10-20", businessPurpose: "A joint campaign", party2Address: "100 Main St, Houston, TX 77002", lvAddress: LV_NOTICE.address, lvEmail: LV_NOTICE.email };
  const studio = { signerName: "Mia Chen", signerEmail: "mia@studio.com", companyName: "Studio North", values: { name: "Studio North LLC", entity: "Texas limited liability company", address: "9 Oak Ave, Austin, TX" } };
  const freelancer = { signerName: "Leo Díaz", signerEmail: "leo@example.com", companyName: "", values: { address: "5 Elm St, Houston, TX" } };

  it("adds each party to the Mutual NDA as Party 3, Party 4, with their own lines", () => {
    const nda = legalTemplate("nda_mutual")!;
    const blocks = nda.render({ ...base, language: "en", recipientEmail: "ana@casa.com", values, additionalParties: [studio, freelancer] });
    const metas = blocks.filter((block) => block.kind === "meta").map((block) => `${(block as { label: string }).label}: ${block.text}`);
    expect(metas).toEqual(expect.arrayContaining([
      "Party 2: Casa Melilla",
      "Party 3: Studio North LLC",
      "Entity type and jurisdiction, if applicable: Texas limited liability company",
      "Address: 9 Oak Ave, Austin, TX",
      "Notice email: mia@studio.com",
      "Party 4: Leo Díaz",
      "Entity type and jurisdiction, if applicable: Not applicable",
      "Notice email: leo@example.com",
    ]));
    // Party 3 and 4 come before the business purpose, in order.
    expect(metas.indexOf("Party 3: Studio North LLC")).toBeLessThan(metas.indexOf("Party 4: Leo Díaz"));
    expect(metas.findIndex((line) => line.startsWith("Business purpose"))).toBeGreaterThan(metas.indexOf("Party 4: Leo Díaz"));
    expect(signerRolesFor(nda, { ...base, language: "en", values, additionalParties: [studio, freelancer] }))
      .toEqual(["Party 2 · Casa Melilla", "Party 3 · Studio North LLC", "Party 4 · Leo Díaz"]);
    expect(signerRolesFor(nda, { ...base, language: "es", values, additionalParties: [studio] })).toEqual(["Parte 2 · Casa Melilla", "Parte 3 · Studio North LLC"]);
  });

  it("calls each One-way NDA party another Receiving Party, and keeps the approved wording", () => {
    const oneWay = legalTemplate("nda_one_way")!;
    const input = { ...base, language: "en" as const, values, additionalParties: [studio] };
    expect(oneWay.render(input)).toContainEqual({ kind: "meta", label: "Receiving Party", text: "Studio North LLC" });
    expect(signerRolesFor(oneWay, input)).toEqual(["Receiving Party · Casa Melilla", "Receiving Party · Studio North LLC"]);
    const withoutParties = oneWay.render({ ...input, additionalParties: [] }).filter((block) => block.kind !== "meta");
    expect(oneWay.render(input).filter((block) => block.kind !== "meta")).toEqual(withoutParties);
  });

  it("lets only the NDAs take up to three more parties, and asks each for an address", () => {
    expect(LEGAL_TEMPLATES.filter((template) => template.maxAdditionalParties).map((template) => [template.key, template.maxAdditionalParties]))
      .toEqual([["nda_mutual", 3], ["nda_one_way", 3]]);
    expect(missingPartyFields(legalTemplate("nda_mutual")!, {}, "en")).toEqual(["Address"]);
    expect(missingPartyFields(legalTemplate("photo_release")!, {}, "en")).toEqual([]);
    expect(signerRolesFor(legalTemplate("photo_release")!, { ...base, language: "en", values: {} })).toEqual(["Subject"]);
  });
});
