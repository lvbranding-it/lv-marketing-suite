import type { CreativeRequest, PreparedContext, ProjectContext } from "./types.ts";
import { LV_BRAND_IDENTITY_GUARDRAIL, LV_BRAND_VISUAL_IDENTITY_GUARDRAIL } from "../lv-brand-identity.ts";

const MAX_CONTEXT_CHARS = 36_000;
/**
 * An image prompt is not a text prompt with pictures attached.
 *
 * A writing model reads 28,000 characters of brand JSON and uses what it needs.
 * An image model spreads its attention across the whole prompt, so the same
 * block buries the one sentence that describes the picture — "transfer the
 * outfit, do not modify the face" arriving as the tail of a positioning
 * document comes back as a mood, not an edit. Images get the instruction first
 * and only the context that can be seen.
 */
const MAX_IMAGE_PROMPT_CHARS = 2_400;
/**
 * What the output is, as opposed to what to do.
 *
 * Handing two pictures to the edits endpoint and describing a change asks the
 * model to reason about a set, and it will sometimes answer with the set: a
 * diptych, a before-and-after, the reference tiled beside the result. Nothing
 * in an instruction like "replace the clothing" says how many images come back,
 * so this says it. A future command that genuinely wants a grid will need to
 * opt out of this line rather than rely on its absence.
 */
const SINGLE_OUTPUT = "Return exactly one finished image. Do not produce a collage, grid, contact sheet, split screen, side-by-side layout or before-and-after pair, do not divide the frame into panels, and do not include the reference images themselves anywhere in the output.";

/**
 * Brand fields that describe how a picture should look, not how copy reads,
 * with the words an image model is given for each. A field name like
 * `brandName` means nothing to a picture model; "Brand" and "Avoid" do.
 */
const VISUAL_BRAND_FIELDS = [
  ["visualPrinciples", "Look"],
  ["approvedColors", "Colors"],
  ["typography", "Type"],
  ["requiredElements", "Include"],
  ["prohibitedElements", "Avoid"],
] as const;

/**
 * Cards that are pictures. Their picture travels as a reference image; the text
 * on them is a caption ("Reference notes", the instruction that made them), and
 * a generation card's text can be an error message. None of it describes what
 * to draw, so it is kept out of an image prompt.
 */
const PICTURE_CARD_TYPES = new Set(["image", "reference", "generation"]);

const describesPicture = (node: Record<string, unknown>) =>
  !PICTURE_CARD_TYPES.has(String(node.type)) && !node.assetId;

export const LV_CANVAS_SYSTEM = `${LV_BRAND_IDENTITY_GUARDRAIL}

You are the LV Creative Canvas intelligence layer for LV Branding.
Strategy first. Every recommendation and artifact must connect audience, positioning, objective, and execution.
Use only the supplied project context. Do not invent performance claims or confidential facts.
Objects listed as selectedObjects are what the request is about. Objects listed as inheritedDirection were connected to them on the canvas and govern how the work should be executed: honour them as direction, not as subject matter.
An object carrying a sequence field is one step of a running order: continue from the step it follows rather than repeating it, and do not treat the earlier step as creative direction.
For bilingual adaptation, preserve intent, positioning, voice, cultural relevance, and market fit rather than translating literally.
Never expose hidden reasoning. Return only the useful creative result and concise rationale requested by the user.`;

function cleanText(value: unknown, max = 8_000) {
  if (typeof value !== "string") return value;
  return value.replace(/\0/g, "").trim().slice(0, max);
}

export function buildCreativeContext(request: CreativeRequest, project?: ProjectContext): PreparedContext {
  const included = request.selectedNodes.filter((node) => node.includeInAiContext !== false);
  const excluded = request.selectedNodes.filter((node) => node.includeInAiContext === false);
  const shape = (node: typeof included[number]) => ({
    id: node.id,
    type: node.type,
    title: cleanText(node.title, 400),
    text: cleanText(node.text),
    assetId: node.assetId,
    parentDirectionId: node.parentDirectionId,
    sequence: node.sequence,
    metadata: node.metadata,
  });
  // Objects the person picked, and objects the canvas contributed by following
  // connections upstream. Kept apart so the model can tell the subject of the
  // request from the direction governing it.
  const selected = included.filter((node) => node.role !== "inherited").map(shape);
  const inherited = included
    .filter((node) => node.role === "inherited")
    .sort((first, second) => (first.depth ?? 1) - (second.depth ?? 1))
    .map((node) => ({ ...shape(node), inheritedVia: node.parentDirectionId, depth: node.depth ?? 1 }));
  const structuredContext: Record<string, unknown> = {
    // The client record leads, because it is the part nobody typed into this
    // canvas: the intake brief and the brand snapshot the LV agents maintain.
    // The same source `agent-run` reads, so Canvas and the agents now reason
    // from one set of facts about the client.
    client: project
      ? {
          project: cleanText(project.name, 300),
          clientName: cleanText(project.clientName, 300),
          description: cleanText(project.description, 4_000),
          marketingContext: project.marketingContext ?? {},
          brandSnapshot: project.brandSnapshot ?? {},
        }
      : {},
    // Edited by the creative for this canvas; overrides the client record where
    // the two disagree, since a person changed it deliberately.
    brand: request.brandContext ?? {},
    creativeDirection: request.parentDirection ?? {},
    selectedObjects: selected,
    inheritedDirection: inherited,
    previousGeneration: request.previousGeneration ?? null,
    language: request.language ?? "en",
    market: cleanText(request.market, 300) ?? null,
  };
  let serialized = JSON.stringify(structuredContext);
  let truncated = false;
  if (serialized.length > MAX_CONTEXT_CHARS) {
    truncated = true;
    const client = structuredContext.client as Record<string, unknown> | undefined;
    if (client && Object.keys(client).length) {
      // Keep the narrative brief and the brand snapshot, drop the bulky raw
      // markdown and intake dump before touching what the user selected.
      const marketing = client.marketingContext as Record<string, unknown> | undefined;
      client.marketingContext = marketing
        ? { sections: marketing.sections, generated_at: marketing.generated_at }
        : {};
      serialized = JSON.stringify(structuredContext);
    }
    if (serialized.length > MAX_CONTEXT_CHARS) {
      structuredContext.selectedObjects = selected.map((node) => ({
        ...node,
        text: cleanText(node.text, 2_000),
        metadata: undefined,
      }));
    }
    serialized = JSON.stringify(structuredContext).slice(0, MAX_CONTEXT_CHARS);
  }
  const operationInstruction = request.operation === "adapt_en_es"
    ? "Adapt the selected English copy into natural, market-aware Spanish."
    : request.operation === "adapt_es_en"
      ? "Adapt the selected Spanish copy into natural, market-aware English."
      : `Perform this creative operation: ${request.operation.replaceAll("_", " ")}.`;
  const enhancedPrompt = `${operationInstruction}\n\nProject context:\n${serialized}\n\nOriginal user instruction:\n${cleanText(request.instruction, 8_000)}`;
  return {
    systemInstructions: LV_CANVAS_SYSTEM,
    structuredContext,
    enhancedPrompt,
    imagePrompt: buildImagePrompt(request, selected, inherited, project),
    manifest: {
      selectedObjectIds: included.map((node) => node.id),
      excludedObjectIds: excluded.map((node) => node.id),
      referenceAssetIds: request.referenceAssetIds ?? included.flatMap((node) => node.assetId ? [node.assetId] : []),
      includedSections: Object.entries(structuredContext).filter(([, value]) => value && JSON.stringify(value) !== "{}").map(([key]) => key),
      truncated,
      characterCount: serialized.length,
    },
  };
}

/**
 * One card as a line of an image prompt: its title, then its text.
 *
 * A card holding an AI reply reads "Instruction … Response …". The response is
 * the content; the instruction that asked for it is not something to draw.
 */
const cardLine = (node: Record<string, unknown>, max: number) => {
  const title = typeof node.title === "string" ? node.title.trim() : "";
  const raw = typeof node.text === "string" ? node.text.trim() : "";
  const reply = raw.startsWith("Instruction\n") ? raw.match(/\nResponse\n([\s\S]+)$/)?.[1] : undefined;
  const text = (reply ?? raw).trim();
  const line = title && text && !text.startsWith(title) ? `${title}: ${text}` : text || title;
  return (cleanText(line.replace(/\s+/g, " "), max) as string) || "";
};

/**
 * The prompt an image model actually receives.
 *
 * In order:
 *  1. The instruction, because it is the subject.
 *  2. The attached pictures, named in the order they are sent, so "the first
 *     image" means something.
 *  3. Who "LV" is. Before anything else is read into the letters: with only
 *     "Brand: LV Branding" and "Textured Luxury" to go on, a sweater came back
 *     carrying a fashion-house logo.
 *  4. The text of the selected cards. A concept card selected for "make the key
 *     visual" is what the picture is of; it used to be left out, and the model
 *     drew from the one-line instruction alone.
 *  5. The brand's look, and connected direction, a line each.
 *  6. The one-image rule.
 *
 * 3 and 6 are never trimmed; the cap comes out of 4 and 5. A long prompt does
 * not make a more faithful picture, it makes a vaguer one.
 */
function buildImagePrompt(
  request: CreativeRequest,
  selected: Array<Record<string, unknown>>,
  inherited: Array<Record<string, unknown>>,
  project?: ProjectContext,
): string {
  const references = request.referenceAssetIds ?? [];
  const titleFor = (assetId: string) => {
    const match = [...selected, ...inherited].find((node) => node.assetId === assetId);
    return typeof match?.title === "string" && match.title.trim() ? match.title.trim().slice(0, 80) : "untitled";
  };
  const imageList = references.map((assetId, index) => `Image ${index + 1}: ${titleFor(assetId)}`).join("\n");
  // The instruction gets up to 1,200 characters, less whatever the fixed parts
  // need, so the whole prompt stays inside the cap with four images attached.
  const instructionRoom = Math.min(
    1_200,
    MAX_IMAGE_PROMPT_CHARS - imageList.length - LV_BRAND_VISUAL_IDENTITY_GUARDRAIL.length - SINGLE_OUTPUT.length - 8,
  );
  const head = [cleanText(request.instruction, instructionRoom) as string, imageList].filter(Boolean);

  const context: string[] = [];

  const subject = selected.filter(describesPicture).map((node) => cardLine(node, 300)).filter(Boolean);
  if (subject.length) context.push(`Subject — ${subject.join(" | ")}`);

  const brand = (request.brandContext ?? {}) as Record<string, unknown>;
  const brandName = [brand.brandName, project?.clientName, project?.name]
    .map((value) => cleanText(value, 120))
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const look = VISUAL_BRAND_FIELDS
    .map(([field, label]) => [label, cleanText(brand[field], 220)] as const)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => `${label}: ${value}`);
  if (brandName || look.length) {
    context.push(`Brand — ${[brandName, ...look].filter(Boolean).join(". ")}`);
  }

  // Direction that arrived through an arrow is guidance for the look, kept to a
  // line each so it cannot outweigh the instruction. Pictures upstream travel
  // as pictures, not as their captions.
  const direction = inherited.filter(describesPicture).map((node) => cardLine(node, 200)).filter(Boolean).slice(0, 3);
  if (direction.length) context.push(`Creative direction — ${direction.join("; ")}`);

  const opening = head.join("\n\n");
  const fixed = opening.length + LV_BRAND_VISUAL_IDENTITY_GUARDRAIL.length + SINGLE_OUTPUT.length + 6;
  const middle = context.join("\n\n").slice(0, Math.max(0, MAX_IMAGE_PROMPT_CHARS - fixed - 2));
  return [opening, LV_BRAND_VISUAL_IDENTITY_GUARDRAIL, middle, SINGLE_OUTPUT].filter(Boolean).join("\n\n");
}
