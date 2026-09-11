import type {
  CommandCategory, CommandContext, CommandDefinition, CommandInput,
  CommandSafety, CommandSelectionRule, CommandValues, UgcMode,
} from "./types";
import type { CreativeOperation, CreativeProvider } from "../types";

/**
 * Shorthand for the commands that are only an instruction.
 *
 * A text command needs no new plumbing: it takes what is selected, composes a
 * prompt and puts the answer back on the canvas, exactly as `/headline` does.
 * Writing each one out in full would be twenty lines of identical scaffolding
 * around the two parts that actually differ — its inputs and its instruction —
 * so those are all a definition here has to supply.
 */

export const text = (value: unknown) => String(value ?? "").trim();
/** `Label: value.` when there is a value, nothing when there is not. */
export const line = (label: string, value: unknown) => (text(value) ? `${label}: ${text(value)}.` : "");

/** Selection rule for a command that can use context but does not need it. */
export const OPTIONAL_CONTEXT: CommandSelectionRule = {
  types: [], min: 0, label: "Optional context from the canvas",
};

/** Selection rule for a command that works on whatever is selected. */
export const requiresSelection = (label: string): CommandSelectionRule => ({ types: [], min: 1, label });

/** Selection rule for a command that reads a photograph of someone. */
export const requiresPhoto = (label = "Photo of the person"): CommandSelectionRule => ({
  types: ["image", "reference", "generation"], min: 1, max: 2, requiresArtwork: true, label, roles: [label],
});

/**
 * The rules for written advice about a real person.
 *
 * Distinct from the rules that govern generated pictures of someone: nothing
 * here is about preserving a face, and everything is about what may be said.
 * Visible characteristics and stated goals are in scope; the person's ethnicity,
 * health, beliefs or worth are not, and neither is telling anyone what is wrong
 * with their body.
 */
export const PERSON_ADVICE_RULES = [
  "Work only from what is visible in the supplied photograph and what the person has said they want.",
  "Do not infer or comment on ethnicity, health, disability, religion, sexual orientation or personality.",
  "Do not score, rank or assess attractiveness, and make no negative judgement about the person's body or face.",
  "Describe fit, proportion, colour and styling neutrally and practically — what works and why, never what is wrong with them.",
  "These are styling suggestions and preferences, not rules and not statements of fact about the person.",
].join(" ");

export interface TextCommandConfig {
  trigger: string;
  category: CommandCategory;
  name: string;
  description: string;
  aliases?: string[];
  selection?: CommandSelectionRule;
  inputs: CommandInput[];
  operation?: CreativeOperation;
  providers?: CreativeProvider[];
  safety?: CommandSafety;
  ugcMode?: UgcMode;
  disclosure?: string;
  instruction: (values: CommandValues, context: CommandContext) => string;
}

export function textCommand(config: TextCommandConfig): CommandDefinition {
  const safety = config.safety ?? "standard";
  return {
    id: config.trigger,
    trigger: config.trigger,
    aliases: config.aliases ?? [],
    category: config.category,
    name: config.name,
    description: config.description,
    selection: config.selection ?? OPTIONAL_CONTEXT,
    inputs: config.inputs,
    operation: config.operation ?? "write_copy",
    providers: config.providers ?? ["auto", "anthropic", "openai"],
    output: "text",
    placement: "beside_source",
    cost: "low",
    // Anything carrying a consent gate is confirmed; plain writing is not.
    confirm: safety !== "standard",
    safety,
    // Every UGC command states which kind it is; "either" is the honest default
    // for planning work that is true whoever holds the camera.
    ugcMode: config.ugcMode ?? (config.category === "ugc" ? "either" : undefined),
    disclosure: config.disclosure,
    status: "live",
    instruction: config.instruction,
  };
}

/** A text command that reasons about a real person from their photograph. */
export const personCommand = (config: Omit<TextCommandConfig, "safety" | "operation"> & { operation?: CreativeOperation }) =>
  textCommand({
    ...config,
    safety: "person_likeness",
    operation: config.operation ?? "visual_critique",
    selection: config.selection ?? requiresPhoto(),
  });

/** Joins instruction parts, dropping the ones that turned out empty. */
export const compose = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join("\n\n");

/** Used wherever a command should say how many of something to produce. */
export const countOf = (values: CommandValues, fallback: number) => Number(values.count ?? fallback);
