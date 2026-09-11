import type { CreativeAspect, CreativeNodeType, CreativeOperation, CreativeProvider } from "../types";

/**
 * The LV Creative Command System™.
 *
 * Commands are data, not code paths. Every one is a record in a single registry
 * describing what it needs, what it produces and whether it is actually built —
 * so the palette, the configuration panel, the cost estimate, the safety gate
 * and the audit trail all read from one source rather than each growing their
 * own copy of the rules.
 *
 * The registry deliberately lists commands that do not work yet. A visible
 * roadmap is useful; a command that pretends to work is not, which is why
 * `status` is part of the definition and nothing can run without it being
 * "live".
 */

export const COMMAND_CATEGORIES = [
  { id: "people", label: "People & Style", hint: "Wardrobe, grooming and personal styling" },
  { id: "photography", label: "Photography", hint: "Light, retouching and image transformation" },
  { id: "product", label: "Product & Commercial", hint: "Product, packaging and commercial imagery" },
  { id: "brand", label: "Brand & Campaign", hint: "Direction, systems and campaign assets" },
  { id: "copy", label: "Copy & Strategy", hint: "Words, positioning and narrative" },
  { id: "ugc", label: "UGC", hint: "Creator-made and disclosed synthetic content" },
  { id: "canvas", label: "Canvas & Production", hint: "Organising, reviewing and delivering work" },
] as const;

export type CommandCategory = typeof COMMAND_CATEGORIES[number]["id"];

/** Whether a command can actually be run, or is registry-only for now. */
export type CommandStatus = "live" | "coming_soon";

/**
 * How carefully a command has to treat its subject.
 *
 * `person_likeness` covers anything that depicts or advises on a real person.
 * Those commands require confirmed permission to use the image, and carry
 * instructions that keep the output to visible styling rather than inferences
 * about the person.
 *
 * `synthetic_person` covers a presenter, voice or demonstration that is not
 * real. Those require an acknowledgement that the result will be disclosed as
 * synthetic, because the harm is not to the depicted person but to the audience
 * who would take it for a customer.
 *
 * `attested_claim` covers anything that states a customer experience or a
 * product result. Those require the real material to be supplied and will not
 * invent it.
 */
export type CommandSafety = "standard" | "person_likeness" | "synthetic_person" | "attested_claim";

/**
 * Which kind of UGC a command produces.
 *
 * `creator` is content from a real customer, employee, ambassador or creator:
 * their words and their footage, never fabricated. `synthetic` is AI-generated
 * people, voices or demonstrations, always disclosed. `either` is planning work
 * — a hook or a shot list — that is true whoever ends up holding the camera.
 */
export type UgcMode = "creator" | "synthetic" | "either";

/** Rough spend, shown before a command is configured rather than after. */
export type CommandCost = "free" | "low" | "medium" | "high";

export type CommandInputType = "text" | "textarea" | "select" | "count" | "aspect" | "toggle";

export interface CommandInput {
  key: string;
  label: string;
  type: CommandInputType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string | number | boolean;
  /** Bounds for a `count` input. */
  min?: number;
  max?: number;
}

/** What the command needs picked on the canvas before it can run. */
export interface CommandSelectionRule {
  /** Empty means any object type is acceptable. */
  types: CreativeNodeType[];
  min: number;
  max?: number;
  /** Whether each selected object must carry stored artwork. */
  requiresArtwork?: boolean;
  /** Named so the panel can say "Subject photo" rather than "1–2 objects". */
  label: string;
  /** One line per slot, in order, when a command reads its selection positionally. */
  roles?: string[];
}

export interface CommandDefinition {
  id: string;
  /** Typed after the slash, without it. */
  trigger: string;
  /** Other names people reach for, matched by search but never shown as the name. */
  aliases: string[];
  category: CommandCategory;
  name: string;
  description: string;
  selection: CommandSelectionRule | null;
  inputs: CommandInput[];
  /** The capability requested from the generation gateway. */
  operation: CreativeOperation;
  /** For commands whose capability depends on how they were configured. */
  resolveOperation?: (values: CommandValues) => CreativeOperation;
  providers: CreativeProvider[];
  output: "image" | "image_set" | "text" | "frame";
  /** Where results land relative to what was selected. */
  placement: "beside_source" | "grid_below" | "frame";
  cost: CommandCost;
  /** Whether the configuration panel must be confirmed before anything is spent. */
  confirm: boolean;
  safety: CommandSafety;
  /** Set on UGC commands; the palette and the panel both show it. */
  ugcMode?: UgcMode;
  /** A line that must travel with the result, e.g. a synthetic-content notice. */
  disclosure?: string;
  status: CommandStatus;
  /**
   * Builds the instruction sent to the model.
   *
   * Only live commands have one; a roadmap entry has nothing to build yet.
   */
  instruction?: (values: CommandValues, context: CommandContext) => string;
  /** How many generations one run costs, when the command fans out. */
  runs?: (values: CommandValues) => number;
}

export type CommandValues = Record<string, string | number | boolean | undefined>;

/** What the canvas can tell a command about the objects it was handed. */
export interface CommandContext {
  /** Titles of the selected objects, in selection order. */
  selectionTitles: string[];
  /** Body text of the selected objects, for commands that work from words. */
  selectionText: string[];
  brandName?: string;
  language?: string;
}

export const ASPECT_INPUT: CommandInput = {
  key: "aspect", label: "Shape", type: "aspect", defaultValue: "square",
  help: "Artwork is generated at this shape rather than cropped to it afterwards.",
};

export const countInput = (defaultValue = 1, max = 6, label = "How many"): CommandInput => ({
  key: "count", label, type: "count", defaultValue, min: 1, max,
  help: "Each one is a separate generation with its own cost.",
});

export const ASPECTS: Array<{ value: CreativeAspect; label: string }> = [
  { value: "square", label: "Square · 1:1" },
  { value: "portrait", label: "Portrait · 4:5" },
  { value: "landscape", label: "Landscape · 3:2" },
];
