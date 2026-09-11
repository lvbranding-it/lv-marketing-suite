import { COMMANDS, commandRuns } from "./catalog";
import type { CommandContext, CommandDefinition, CommandSafety, CommandValues } from "./types";
import type { CreativeAspect, CreativeNodeType, CreativeOperation } from "../types";

/**
 * Looking a command up, deciding whether it may run, and turning a filled-in
 * panel into a generation request.
 *
 * Everything here is pure. The canvas hands in a plain description of what is
 * selected and gets back either a list of reasons it cannot run or a request
 * ready to send — so the rules are testable without a browser, and the same
 * rules govern the palette, the panel and the button.
 */

/** At most four pictures travel with a request; the gateway rejects more. */
export const MAX_COMMAND_REFERENCES = 4;

export interface CommandSelectionItem {
  id: string;
  nodeType: CreativeNodeType;
  title: string;
  text: string;
  assetId?: string;
  includeInContext: boolean;
}

export interface CommandRequest {
  operation: CreativeOperation;
  instruction: string;
  referenceAssetIds: string[];
  aspect?: CreativeAspect;
  /** How many separate generations this run costs. */
  runs: number;
  /** Recorded against every result so a piece can be traced back. */
  audit: { commandId: string; trigger: string; values: CommandValues };
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every character of `query` appearing in order, for forgiving typed triggers. */
function isSubsequence(query: string, target: string) {
  let index = 0;
  for (const character of target) {
    if (character === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return query.length === 0;
}

export function findCommand(trigger: string): CommandDefinition | undefined {
  const wanted = normalise(trigger);
  return COMMANDS.find((command) => normalise(command.trigger) === wanted)
    ?? COMMANDS.find((command) => command.aliases.some((alias) => normalise(alias) === wanted));
}

/**
 * Ranks commands for the palette.
 *
 * An exact trigger wins, then a prefix, then aliases, then words in the name or
 * description, and a loose subsequence last so a mistyped trigger still finds
 * its command. Built commands outrank the roadmap at equal relevance — someone
 * searching wants the thing they can use.
 */
export function searchCommands(query: string, limit = 40): CommandDefinition[] {
  const raw = query.trim().toLowerCase();
  const wanted = normalise(raw);

  const scored = COMMANDS.map((command) => {
    const trigger = normalise(command.trigger);
    const aliases = command.aliases.map(normalise);
    let score = 0;

    if (!wanted) score = 1;
    else if (trigger === wanted) score = 1000;
    else if (trigger.startsWith(wanted)) score = 600;
    else if (aliases.some((alias) => alias === wanted)) score = 500;
    else if (aliases.some((alias) => alias.startsWith(wanted))) score = 400;
    else if (trigger.includes(wanted)) score = 320;
    else if (command.name.toLowerCase().includes(raw)) score = 300;
    else if (aliases.some((alias) => alias.includes(wanted))) score = 200;
    else if (command.description.toLowerCase().includes(raw)) score = 120;
    else if (isSubsequence(wanted, trigger)) score = 60;

    if (score && command.status === "live") score += 25;
    return { command, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score || first.command.name.localeCompare(second.command.name))
    .slice(0, limit)
    .map((entry) => entry.command);
}


/**
 * What a command's safety class asks someone to attest to before it will run.
 *
 * Three different worries, so three different sentences. Permission protects
 * the person depicted; disclosure protects the audience who would otherwise
 * take generated content for a customer; attestation protects everyone from a
 * claim nobody can stand behind. A single "I agree" would cover none of them
 * honestly.
 */
export interface ConsentRequirement { title: string; confirmation: string; note: string }

const CONSENT: Record<CommandSafety, ConsentRequirement | null> = {
  standard: null,
  person_likeness: {
    title: "Using someone's likeness",
    confirmation: "Confirm you have permission to use this person's image.",
    note: "Results are visual simulations, kept as new objects — your original photograph is never altered. The command works only from what is visible and will not infer anything about the person.",
  },
  synthetic_person: {
    title: "Synthetic content",
    confirmation: "Confirm this will be published as AI-generated, not as a real person.",
    note: "The presenter is invented. It must never be presented as a real customer, employee or experience, and the output carries the disclosure wording with it.",
  },
  attested_claim: {
    title: "Real material and real claims",
    confirmation: "Confirm the material supplied is genuine and its claims can be substantiated.",
    note: "This command shapes what you supply. It will not invent an experience, a quote or a result, and it flags anything touching health, finances, earnings, safety or performance for human review.",
  },
};

export const consentRequirement = (command: CommandDefinition): ConsentRequirement | null => CONSENT[command.safety];

export interface CommandReadiness {
  ok: boolean;
  /** Plain sentences naming what is missing, in the order worth fixing them. */
  problems: string[];
  /** Selected objects this command will actually send as pictures. */
  referenceAssetIds: string[];
}

/**
 * Whether a filled-in command may run.
 *
 * Muted artwork is treated as absent rather than quietly dropped: a selection
 * whose pictures are all excluded from AI context would otherwise satisfy the
 * count and then send nothing.
 */
export function checkCommand(
  command: CommandDefinition,
  values: CommandValues,
  selection: CommandSelectionItem[],
  options: { permissionConfirmed?: boolean } = {},
): CommandReadiness {
  const problems: string[] = [];

  if (command.status !== "live") {
    return { ok: false, problems: [`${command.name} is on the roadmap and cannot run yet.`], referenceAssetIds: [] };
  }

  const rule = command.selection;
  const usable = selection.filter((item) => !rule?.types.length || rule.types.includes(item.nodeType));

  if (rule) {
    const muted = usable.filter((item) => item.assetId && item.includeInContext === false);
    const withArtwork = usable.filter((item) => item.assetId && item.includeInContext !== false);
    const counted = rule.requiresArtwork ? withArtwork : usable;

    if (counted.length < rule.min) {
      problems.push(
        rule.min === 1
          ? `Select ${rule.label.toLowerCase()} on the canvas first.`
          : `Select ${rule.min} objects — ${rule.label.toLowerCase()}.`,
      );
      if (rule.requiresArtwork && muted.length) {
        problems.push(`${muted.length === 1 ? "One selected picture has" : `${muted.length} selected pictures have`} “Include in AI context” unticked, so ${muted.length === 1 ? "it is" : "they are"} not counted.`);
      }
    } else if (rule.max && counted.length > rule.max) {
      problems.push(`This command takes at most ${rule.max} object${rule.max === 1 ? "" : "s"}; ${counted.length} are selected.`);
    }
  }

  for (const input of command.inputs) {
    if (!input.required) continue;
    const value = values[input.key];
    if (value === undefined || value === null || String(value).trim() === "") {
      problems.push(`${input.label} is required.`);
    }
  }

  const consent = consentRequirement(command);
  if (consent && !options.permissionConfirmed) problems.push(consent.confirmation);

  const referenceAssetIds = [...new Set(
    usable.filter((item) => item.assetId && item.includeInContext !== false).map((item) => item.assetId!),
  )].slice(0, MAX_COMMAND_REFERENCES);

  return { ok: problems.length === 0, problems, referenceAssetIds };
}

/**
 * Turns a validated command into the request the canvas will send.
 *
 * Throws rather than returning something half-formed: a caller that skipped
 * `checkCommand` has a bug, and producing a request anyway would spend money on
 * it.
 */
export function buildCommandRequest(
  command: CommandDefinition,
  values: CommandValues,
  selection: CommandSelectionItem[],
  context: CommandContext,
  options: { permissionConfirmed?: boolean } = {},
): CommandRequest {
  const readiness = checkCommand(command, values, selection, options);
  if (!readiness.ok) throw new Error(readiness.problems[0]);
  if (!command.instruction) throw new Error(`${command.name} has no instruction to run.`);

  const aspectValue = values.aspect;
  const aspect = aspectValue === "square" || aspectValue === "portrait" || aspectValue === "landscape"
    ? aspectValue
    : undefined;

  return {
    operation: command.resolveOperation?.(values) ?? command.operation,
    instruction: command.instruction(values, context),
    referenceAssetIds: readiness.referenceAssetIds,
    aspect,
    runs: commandRuns(command, values),
    audit: { commandId: command.id, trigger: command.trigger, values },
  };
}

/** The values a freshly opened panel starts with. */
export function defaultValues(command: CommandDefinition): CommandValues {
  const values: CommandValues = {};
  for (const input of command.inputs) {
    if (input.defaultValue !== undefined) values[input.key] = input.defaultValue;
  }
  return values;
}

/**
 * What one run is likely to cost.
 *
 * Image generations dominate, so they are priced per run and text is treated as
 * near-free rather than pretending to a precision the token count cannot give
 * before the fact.
 */
export const IMAGE_RUN_COST_USD = 0.04;
export function estimateCommandCost(command: CommandDefinition, values: CommandValues) {
  if (command.output === "text") return 0;
  return Number((commandRuns(command, values) * IMAGE_RUN_COST_USD).toFixed(2));
}

/** Reads `/trigger` out of what someone has typed, if that is what it is. */
export function parseSlash(input: string): { isCommand: boolean; query: string } {
  if (!input.startsWith("/")) return { isCommand: false, query: "" };
  return { isCommand: true, query: input.slice(1).trimStart() };
}
