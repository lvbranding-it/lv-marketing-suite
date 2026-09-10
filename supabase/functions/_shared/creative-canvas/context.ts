import type { CreativeRequest, PreparedContext, ProjectContext } from "./types.ts";

const MAX_CONTEXT_CHARS = 36_000;

export const LV_CANVAS_SYSTEM = `You are the LV Creative Canvas intelligence layer for LV Branding.
Strategy first. Every recommendation and artifact must connect audience, positioning, objective, and execution.
Use only the supplied project context. Do not invent performance claims or confidential facts.
For bilingual adaptation, preserve intent, positioning, voice, cultural relevance, and market fit rather than translating literally.
Never expose hidden reasoning. Return only the useful creative result and concise rationale requested by the user.`;

function cleanText(value: unknown, max = 8_000) {
  if (typeof value !== "string") return value;
  return value.replace(/\0/g, "").trim().slice(0, max);
}

export function buildCreativeContext(request: CreativeRequest, project?: ProjectContext): PreparedContext {
  const included = request.selectedNodes.filter((node) => node.includeInAiContext !== false);
  const excluded = request.selectedNodes.filter((node) => node.includeInAiContext === false);
  const selected = included.map((node) => ({
    id: node.id,
    type: node.type,
    title: cleanText(node.title, 400),
    text: cleanText(node.text),
    assetId: node.assetId,
    parentDirectionId: node.parentDirectionId,
    metadata: node.metadata,
  }));
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
