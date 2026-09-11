import { describe, expect, it } from "vitest";
import { COMMANDS } from "./catalog";
import { buildCommandRequest, checkCommand, consentRequirement, defaultValues, findCommand, type CommandSelectionItem } from "./registry";

const context = { selectionTitles: [], selectionText: [], brandName: "LV Branding", language: "en" };
const card = (id: string, text = ""): CommandSelectionItem =>
  ({ id, nodeType: "text", title: id, text, includeInContext: true });

const ugc = () => COMMANDS.filter((command) => command.category === "ugc");
const live = () => ugc().filter((command) => command.status === "live");

describe("the UGC category", () => {
  it("registers every command the brief listed", () => {
    // The count that matters is the category, not which module holds them.
    expect(ugc()).toHaveLength(35);
    expect(live().length).toBeGreaterThanOrEqual(27);
  });

  it("declares a mode on every UGC command", () => {
    expect(ugc().every((command) => command.ugcMode !== undefined)).toBe(true);
  });

  it("corrects the misspelled trigger while keeping it reachable", () => {
    expect(findCommand("ugcproblemsolution")?.id).toBe("ugcproblemsolution");
    expect(findCommand("ugcproblemolution")?.id).toBe("ugcproblemsolution");
  });

  it("keeps modes out of the wrong commands", () => {
    // A synthetic presenter is never creator content, and a vlog is never synthetic.
    expect(findCommand("ugcavatar")?.ugcMode).toBe("synthetic");
    expect(findCommand("ugcproducthold")?.ugcMode).toBe("synthetic");
    expect(findCommand("ugctestimonial")?.ugcMode).toBe("creator");
    expect(findCommand("ugcvlog")?.ugcMode).toBe("creator");
  });

  it("classifies anything generated that could pass for a person", () => {
    for (const trigger of ["ugcavatar", "ugcproducthold"]) {
      expect(findCommand(trigger)?.safety).toBe("synthetic_person");
    }
  });

  it("classifies anything that states a customer experience or a result", () => {
    for (const trigger of ["ugctestimonial", "ugcbeforeafter", "ugcstorytime", "ugcdemo"]) {
      expect(findCommand(trigger)?.safety).toBe("attested_claim");
    }
    // The command that audits claims must not itself demand they be attested.
    expect(findCommand("ugccompliance")?.safety).toBe("standard");
  });
});

describe("the safeguards", () => {
  it("asks a different question for each kind of risk", () => {
    expect(consentRequirement(findCommand("ugcavatar")!)?.confirmation).toContain("AI-generated");
    expect(consentRequirement(findCommand("ugctestimonial")!)?.confirmation).toContain("genuine");
    expect(consentRequirement(findCommand("outfittransfer")!)?.confirmation).toContain("permission");
    expect(consentRequirement(findCommand("ugchooks")!)).toBeNull();
  });

  it("will not shape a testimonial without the real account and a permission record", () => {
    const command = findCommand("ugctestimonial")!;
    const problems = checkCommand(command, {}, [], { permissionConfirmed: true }).problems;
    expect(problems).toContain("The customer's actual words or account is required.");
    expect(problems).toContain("Who gave permission, and for what is required.");
  });

  it("forbids inventing an experience, in the instruction itself", () => {
    const command = findCommand("ugctestimonial")!;
    const values = { account: "It took me three weeks to try it and then I used it every day.", permission: "Yeslis, 10 Sep, organic and paid" };
    const request = buildCommandRequest(command, values, [], context, { permissionConfirmed: true });
    expect(request.instruction).toContain("Do not invent experiences");
    expect(request.instruction).toContain("Do not add detail, emotion, outcomes or specifics that are not in their account");
    // Their words have to survive the trip.
    expect(request.instruction).toContain("It took me three weeks");
  });

  it("makes a synthetic presenter disclose itself", () => {
    const command = findCommand("ugcavatar")!;
    const request = buildCommandRequest(command, { subject: "How the booking flow works" }, [], context, { permissionConfirmed: true });
    expect(request.instruction).toContain("This is synthetic content");
    expect(request.instruction).toContain("never be described as a real customer");
    expect(command.disclosure).toContain("Not a real customer");
  });

  it("refuses to let a synthetic presenter borrow a real face", () => {
    const request = buildCommandRequest(findCommand("ugcavatar")!, { subject: "x", persona: "A warm regional host" }, [], context, { permissionConfirmed: true });
    expect(request.instruction).toContain("not a likeness of any real person");
  });

  it("sends health, money and performance claims to a human", () => {
    for (const trigger of ["ugcbrief", "ugctestimonial", "ugcavatar", "ugccompliance"]) {
      const command = findCommand(trigger)!;
      const values = { ...defaultValues(command), objective: "x", product: "x", subject: "x", account: "x", permission: "x" };
      const request = buildCommandRequest(command, values, [card("a")], context, { permissionConfirmed: true });
      expect(request.instruction).toMatch(/health, finance|health, financial/i);
    }
  });

  it("keeps the compliance review honest about what it is not", () => {
    const request = buildCommandRequest(findCommand("ugccompliance")!, defaultValues(findCommand("ugccompliance")!), [card("script", "Lose 10lb in a week")], context);
    expect(request.instruction).toContain("You are not a lawyer");
    expect(request.instruction).toContain("treat every factual claim as unsubstantiated");
  });

  it("tells a sponsored caption to say so plainly", () => {
    const command = findCommand("ugccaption")!;
    const request = buildCommandRequest(command, { subject: "New lunch menu", platform: "reels", sponsored: true }, [], context);
    expect(request.instruction).toContain("clear, plain-language disclosure, not a buried hashtag");
  });

  it("keeps creator commands from writing in an agency voice", () => {
    const command = findCommand("ugctalkingpoints")!;
    const request = buildCommandRequest(command, { subject: "The new lunch menu" }, [], context);
    expect(request.instruction).toContain("this should read as them, not as an agency");
  });
});

describe("the live UGC commands", () => {
  it("all build an instruction from their required inputs", () => {
    for (const command of live()) {
      const values: Record<string, string> = {};
      for (const input of command.inputs) if (input.required) values[input.key] = "something specific";
      const filled = { ...defaultValues(command), ...values };
      const selection = command.selection && command.selection.min > 0 ? [card("a", "some copy")] : [];
      const request = buildCommandRequest(command, filled, selection, context, { permissionConfirmed: true });
      expect(request.instruction.length).toBeGreaterThan(40);
      expect(request.audit.commandId).toBe(command.id);
    }
  });

  it("never asks an image model for UGC text work", () => {
    expect(live().every((command) => command.output === "text")).toBe(true);
  });
});
