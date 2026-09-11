import type { CreativeRequest, PreparedContext, ProjectContext } from "./types.ts";

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

/** Brand fields that describe how a picture should look, not how copy reads. */
const VISUAL_BRAND_FIELDS = [
  "visualPrinciples", "approvedColors", "requiredElements", "prohibitedElements", "typography", "brandName",
] as const;

export const LV_CANVAS_SYSTEM = `You are the LV Creative Canvas intelligence layer for LV Branding.
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
    imagePrompt: buildImagePrompt(request, selected, inherited),
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
 * The prompt an image model actually receives.
 *
 * The instruction leads, because it is the subject. Attached pictures are named
 * in the order they are sent so an instruction can refer to "the first image"
 * and mean something. Everything else is trimmed to what is visible in a
 * picture and capped hard — a long prompt does not make a more faithful edit,
 * it makes a vaguer one.
 */
function buildImagePrompt(
  request: CreativeRequest,
  selected: Array<Record<string, unknown>>,
  inherited: Array<Record<string, unknown>>,
): string {
  const parts: string[] = [cleanText(request.instruction, 1_200) as string];

  const references = request.referenceAssetIds ?? [];
  if (references.length) {
    const titleFor = (assetId: string) => {
      const match = [...selected, ...inherited].find((node) => node.assetId === assetId);
      return typeof match?.title === "string" && match.title.trim() ? match.title.trim().slice(0, 80) : "untitled";
    };
    parts.push(references.map((assetId, index) => `Image ${index + 1}: ${titleFor(assetId)}`).join("\n"));
  }

  const brand = (request.brandContext ?? {}) as Record<string, unknown>;
  const visual = VISUAL_BRAND_FIELDS
    .map((field) => [field, cleanText(brand[field], 220)] as const)
    .filter(([, value]) => typeof value === "string" && value.trim());
  if (visual.length) {
    parts.push(`Brand constraints — ${visual.map(([field, value]) => `${field}: ${value}`).join("; ")}`);
  }

  // Direction that arrived through an arrow is guidance for the look, kept to a
  // line each so it cannot outweigh the instruction.
  const direction = inherited
    .map((node) => cleanText(node.text ?? node.title, 200))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .slice(0, 3);
  if (direction.length) parts.push(`Creative direction — ${direction.join("; ")}`);

  // Last, and never trimmed away: the cap applies to everything before it.
  const body = parts.join("\n\n").slice(0, MAX_IMAGE_PROMPT_CHARS - SINGLE_OUTPUT.length - 2);
  return `${body}\n\n${SINGLE_OUTPUT}`;
}
