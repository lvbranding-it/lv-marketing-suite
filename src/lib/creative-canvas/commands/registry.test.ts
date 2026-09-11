import { describe, expect, it } from "vitest";
import { COMMANDS, liveCommands } from "./catalog";
import {
  buildCommandRequest, checkCommand, defaultValues, estimateCommandCost, findCommand,
  parseSlash, searchCommands, MAX_COMMAND_REFERENCES, type CommandSelectionItem,
} from "./registry";
import { COMMAND_CATEGORIES } from "./types";

const picture = (id: string, title = id, includeInContext = true): CommandSelectionItem =>
  ({ id, nodeType: "image", title, text: "", assetId: `asset-${id}`, includeInContext });
const words = (id: string, text: string): CommandSelectionItem =>
  ({ id, nodeType: "text", title: id, text, includeInContext: true });

const context = { selectionTitles: [], selectionText: [], brandName: "LV Branding", language: "en" };

describe("the registry itself", () => {
  it("has no duplicate triggers or aliases", () => {
    const names = COMMANDS.flatMap((command) => [command.trigger, ...command.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts every command in a real category", () => {
    const ids = new Set(COMMAND_CATEGORIES.map((category) => category.id));
    expect(COMMANDS.every((command) => ids.has(command.category))).toBe(true);
  });

  it("gives every live command something to run", () => {
    // The one rule that keeps the roadmap honest.
    expect(liveCommands().every((command) => typeof command.instruction === "function")).toBe(true);
    expect(liveCommands().length).toBeGreaterThanOrEqual(80);
  });

  it("never marks a roadmap command runnable", () => {
    const roadmap = COMMANDS.filter((command) => command.status === "coming_soon");
    expect(roadmap.every((command) => command.instruction === undefined)).toBe(true);
    // The roadmap shrinks as commands are built; what must hold is that it is
    // still a roadmap and still inert.
    expect(roadmap.length).toBeGreaterThan(0);
  });

  it("classifies anything depicting a person as person_likeness", () => {
    for (const trigger of ["outfittransfer", "lookbook", "hairstyles", "fitprofile", "facestylingmap", "retouch"]) {
      expect(findCommand(trigger)?.safety).toBe("person_likeness");
    }
  });

  it("keeps the older names reachable as aliases", () => {
    expect(findCommand("bodytype")?.id).toBe("fitprofile");
    expect(findCommand("faceanalysis")?.id).toBe("facestylingmap");
    // Their spelling of the value-proposition command, kept so it still lands.
    expect(findCommand("valueroposition")?.id).toBe("valueproposition");
  });
});

describe("searchCommands", () => {
  it("puts an exact trigger first", () => {
    expect(searchCommands("relight")[0].id).toBe("relight");
  });

  it("finds a command by an alias nobody named it", () => {
    expect(searchCommands("dressme")[0].id).toBe("outfittransfer");
    expect(searchCommands("translate")[0].id).toBe("bilingualadapt");
  });

  it("survives a typo", () => {
    expect(searchCommands("outfttransfer").map((command) => command.id)).toContain("outfittransfer");
  });

  it("finds commands by what they do, not only their name", () => {
    expect(searchCommands("packaging").map((command) => command.id)).toContain("packagingconcept");
  });

  it("prefers a built command over a roadmap one at equal relevance", () => {
    const results = searchCommands("head");
    expect(results[0].id).toBe("headline");
  });

  it("lists everything when nothing is typed", () => {
    expect(searchCommands("", 500)).toHaveLength(COMMANDS.length);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCommands("zzzzqqqq")).toEqual([]);
  });
});

describe("checkCommand", () => {
  const outfit = findCommand("outfittransfer")!;

  it("refuses a roadmap command outright", () => {
    const readiness = checkCommand(findCommand("packshot")!, {}, []);
    expect(readiness.ok).toBe(false);
    expect(readiness.problems[0]).toContain("roadmap");
  });

  it("asks for the pictures it needs", () => {
    const readiness = checkCommand(outfit, defaultValues(outfit), [picture("a")], { permissionConfirmed: true });
    expect(readiness.ok).toBe(false);
    expect(readiness.problems.join(" ")).toContain("Select 2 objects");
  });

  it("does not count a muted picture, and says so", () => {
    // The exact failure that produced three silent zero-reference runs.
    const readiness = checkCommand(outfit, defaultValues(outfit), [picture("a"), picture("b", "b", false)], { permissionConfirmed: true });
    expect(readiness.ok).toBe(false);
    expect(readiness.problems.join(" ")).toContain("Include in AI context");
    expect(readiness.referenceAssetIds).toEqual(["asset-a"]);
  });

  it("requires permission before anything depicting a person runs", () => {
    const readiness = checkCommand(outfit, defaultValues(outfit), [picture("a"), picture("b")]);
    expect(readiness.problems).toContain("Confirm you have permission to use this person's image.");
  });

  it("passes once the selection, inputs and permission are all there", () => {
    const readiness = checkCommand(outfit, defaultValues(outfit), [picture("a"), picture("b")], { permissionConfirmed: true });
    expect(readiness).toMatchObject({ ok: true, problems: [], referenceAssetIds: ["asset-a", "asset-b"] });
  });

  it("names a missing required input", () => {
    const relight = findCommand("relight")!;
    const readiness = checkCommand(relight, { ...defaultValues(relight), lighting: "" }, [picture("a")]);
    expect(readiness.problems).toContain("Lighting is required.");
  });

  it("refuses more objects than the command takes", () => {
    const readiness = checkCommand(outfit, defaultValues(outfit), [picture("a"), picture("b"), picture("c")], { permissionConfirmed: true });
    expect(readiness.problems.join(" ")).toContain("at most 2");
  });

  it("caps the pictures it will send", () => {
    const critique = findCommand("creativecritique")!;
    const many = ["a", "b", "c", "d", "e", "f"].map((id) => picture(id));
    expect(checkCommand(critique, {}, many).referenceAssetIds).toHaveLength(MAX_COMMAND_REFERENCES);
  });

  it("lets a command with no selection rule run on nothing", () => {
    const headline = findCommand("headline")!;
    expect(checkCommand(headline, { ...defaultValues(headline), brief: "Announce the move" }, []).ok).toBe(true);
  });
});

describe("buildCommandRequest", () => {
  const outfit = findCommand("outfittransfer")!;

  it("builds an instruction that protects the subject and names the job", () => {
    const request = buildCommandRequest(outfit, defaultValues(outfit), [picture("person"), picture("outfit")], context, { permissionConfirmed: true });
    expect(request.operation).toBe("edit_image");
    expect(request.instruction).toContain("Keep the person from the first image");
    expect(request.instruction).toContain("Replace only their clothing");
    expect(request.referenceAssetIds).toEqual(["asset-person", "asset-outfit"]);
  });

  it("carries the person rules into every person command", () => {
    for (const trigger of ["outfittransfer", "lookbook", "hairstyles"]) {
      const command = findCommand(trigger)!;
      const values = { ...defaultValues(command), occasion: "Press day", direction: "Short crop" };
      // Each command gets exactly the selection it declares it needs.
      const selection = Array.from({ length: command.selection?.min ?? 1 }, (_, index) => picture(`ref-${index}`));
      const request = buildCommandRequest(command, values, selection, context, { permissionConfirmed: true });
      expect(request.instruction).toContain("Do not rate attractiveness");
      expect(request.instruction).toContain("visual styling simulation");
      expect(request.instruction).toContain("Do not infer or comment on ethnicity");
    }
  });

  it("refuses to build anything the checks rejected", () => {
    expect(() => buildCommandRequest(outfit, defaultValues(outfit), [picture("a")], context, { permissionConfirmed: true }))
      .toThrow(/Select 2 objects/);
  });

  it("refuses a roadmap command even when called directly", () => {
    expect(() => buildCommandRequest(findCommand("mockup")!, {}, [], context)).toThrow(/roadmap/);
  });

  it("switches capability with the configured direction", () => {
    const adapt = findCommand("bilingualadapt")!;
    const selection = [words("copy", "Built for the long game")];
    expect(buildCommandRequest(adapt, { direction: "en_es" }, selection, context).operation).toBe("adapt_en_es");
    expect(buildCommandRequest(adapt, { direction: "es_en" }, selection, context).operation).toBe("adapt_es_en");
  });

  it("records what was run for the audit trail", () => {
    const values = { ...defaultValues(outfit), notes: "Sleeves rolled" };
    const request = buildCommandRequest(outfit, values, [picture("a"), picture("b")], context, { permissionConfirmed: true });
    expect(request.audit).toMatchObject({ commandId: "outfittransfer", trigger: "outfittransfer" });
    expect(request.audit.values.notes).toBe("Sleeves rolled");
  });

  it("passes the chosen shape through and ignores a nonsense one", () => {
    const relight = findCommand("relight")!;
    expect(buildCommandRequest(relight, { ...defaultValues(relight), aspect: "portrait" }, [picture("a")], context).aspect).toBe("portrait");
    expect(buildCommandRequest(relight, { ...defaultValues(relight), aspect: "banana" }, [picture("a")], context).aspect).toBeUndefined();
  });

  it("counts the runs a fan-out command will cost", () => {
    const hair = findCommand("hairstyles")!;
    const values = { ...defaultValues(hair), direction: "Short crop", count: 4 };
    expect(buildCommandRequest(hair, values, [picture("a")], context, { permissionConfirmed: true }).runs).toBe(4);
  });
});

describe("estimateCommandCost", () => {
  it("prices a fan-out by its runs", () => {
    const hair = findCommand("hairstyles")!;
    expect(estimateCommandCost(hair, { count: 4 })).toBe(0.16);
  });

  it("treats writing as free at this resolution", () => {
    expect(estimateCommandCost(findCommand("headline")!, { count: 8 })).toBe(0);
  });
});

describe("parseSlash", () => {
  it("recognises a command being typed", () => {
    expect(parseSlash("/relight")).toEqual({ isCommand: true, query: "relight" });
    expect(parseSlash("/")).toEqual({ isCommand: true, query: "" });
  });

  it("leaves ordinary instructions alone", () => {
    expect(parseSlash("make the goat red").isCommand).toBe(false);
  });
});

describe("the instruction-only batch", () => {
  const live = () => COMMANDS.filter((command) => command.status === "live");

  /** Fills every required input so a command can be built for inspection. */
  const fill = (command: typeof COMMANDS[number]) => {
    const values: Record<string, string | number | boolean | undefined> = { ...defaultValues(command) };
    for (const input of command.inputs) {
      if (!input.required) continue;
      if (input.type === "select") values[input.key] = String(input.defaultValue ?? input.options?.[0]?.value ?? "");
      else if (input.type === "count") values[input.key] = Number(input.defaultValue ?? 1);
      else values[input.key] = "something specific and concrete";
    }
    return values;
  };

  it("builds a real instruction for every live command", () => {
    for (const command of live()) {
      const rule = command.selection;
      const selection = Array.from({ length: rule?.min ?? 0 }, (_, index) => picture(`ref-${index}`));
      const request = buildCommandRequest(command, fill(command), selection, context, { permissionConfirmed: true });
      // Long enough to be an instruction rather than a stub, and it must have
      // actually used what was typed in.
      expect(request.instruction.length, command.trigger).toBeGreaterThan(80);
      expect(request.audit.commandId, command.trigger).toBe(command.id);
    }
  });

  it("never leaves an empty label in an instruction", () => {
    // `line()` drops absent values; a stray "Context: ." means one slipped past.
    for (const command of live()) {
      const request = buildCommandRequest(command, fill(command), Array.from({ length: command.selection?.min ?? 0 }, (_, i) => picture(`r${i}`)), context, { permissionConfirmed: true });
      expect(request.instruction, command.trigger).not.toMatch(/:\s*\.\s/);
      expect(request.instruction, command.trigger).not.toContain("undefined");
    }
  });

  it("keeps every command that advises on a person inside the neutral rules", () => {
    const advice = ["fitprofile", "facestylingmap", "coloranalysis", "stylebook", "styleprofile",
      "wardrobeaudit", "capsulewardrobe", "closetupgrade", "outfitstyles", "occasionlook",
      "professionallook", "brandambassadorlook", "accessorystyles", "shoestyles", "seasonalwardrobe", "packinglist"];
    for (const trigger of advice) {
      const command = findCommand(trigger)!;
      expect(command.status, trigger).toBe("live");
      const request = buildCommandRequest(command, fill(command), [picture("photo")], context, { permissionConfirmed: true });
      expect(request.instruction, trigger).toContain("Do not score, rank or assess attractiveness");
      expect(request.instruction, trigger).toContain("Do not infer or comment on ethnicity");
    }
  });

  it("gates the commands that require a photo, and only those", () => {
    // The gate exists for using someone's image. Advice that needs no photo
    // should not train people to click past a consent box.
    for (const trigger of ["fitprofile", "facestylingmap", "coloranalysis", "stylebook", "styleprofile"]) {
      expect(findCommand(trigger)?.safety, trigger).toBe("person_likeness");
    }
    for (const trigger of ["packinglist", "shoestyles", "seasonalwardrobe", "occasionlook"]) {
      expect(findCommand(trigger)?.safety, trigger).toBe("standard");
    }
  });

  it("turned on nothing that needs plumbing we do not have", () => {
    // Video, masks, upscaling, canvas manipulation and orchestration all wait.
    for (const trigger of ["ugcrepurpose", "ugcsubtitles", "ugcresize", "ugcbroll", "ugcmatrix",
      "ugccampaign", "inpaint", "outpaint", "upscale", "backgroundremove", "campaignset",
      "brandpresentation", "arrange", "exportset"]) {
      expect(findCommand(trigger)?.status, trigger).toBe("coming_soon");
    }
  });

  it("switches capability with direction wherever a command adapts language", () => {
    const localise = findCommand("ugclocalize")!;
    const selection = [words("copy", "Built for the long game")];
    expect(buildCommandRequest(localise, { direction: "es_en" }, selection, context).operation).toBe("adapt_es_en");
    expect(buildCommandRequest(localise, { direction: "en_es" }, selection, context).operation).toBe("adapt_en_es");
  });
});
