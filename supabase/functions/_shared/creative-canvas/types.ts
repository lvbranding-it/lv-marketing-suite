export type ProviderId = "openai" | "google" | "anthropic";
export type ProviderCapability = "text" | "vision" | "image_generation" | "image_edit";
export type CreativeOperation =
  | "generate_image"
  | "edit_image"
  | "variations"
  | "campaign_concept"
  | "write_copy"
  | "rewrite"
  | "shorten"
  | "expand"
  | "adapt_en_es"
  | "adapt_es_en"
  | "visual_critique"
  | "compare_concepts"
  | "recommend_direction"
  | "creative_rationale"
  | "production_prompt";

export interface CanvasContextNode {
  id: string;
  type: string;
  title?: string;
  text?: string;
  assetId?: string;
  parentDirectionId?: string;
  includeInAiContext?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * Whether the person chose this object or the canvas supplied it.
   *
   * `inherited` objects arrived by following connections upstream from the
   * selection. The distinction is passed to the model so a direction that was
   * pulled in reads as governing context rather than as the subject.
   */
  role?: "selected" | "inherited";
  /** Hops from the selection, for inherited objects. */
  depth?: number;
  /**
   * Where this object falls in a running order drawn on the canvas.
   *
   * Set only when sequence arrows form an unambiguous chain through it, so the
   * model can continue from what came before instead of restating it.
   */
  sequence?: { step: number; total: number; follows?: string };
}

export interface CreativeRequest {
  projectId: string;
  canvasId: string;
  orgId: string;
  operation: CreativeOperation;
  instruction: string;
  provider?: ProviderId | "auto";
  idempotencyKey: string;
  selectedNodes: CanvasContextNode[];
  brandContext?: Record<string, unknown>;
  parentDirection?: Record<string, unknown>;
  previousGeneration?: Record<string, unknown>;
  language?: "en" | "es";
  market?: string;
  referenceAssetIds?: string[];
  placement?: { x: number; y: number };
  /** Shape to generate at. Without it every image came out 3:2 landscape. */
  aspect?: CreativeAspect;
  /**
   * Which cell of a series this generation is.
   *
   * Recorded on the row so a set stays identifiable after the fact: which run
   * produced it, which combination it came from, and where it sat in the grid.
   * Each cell is still an ordinary generation with its own cost and retry.
   */
  series?: { id: string; label?: string; index?: number; total?: number };
}

/**
 * Shapes a social or web deliverable is actually produced in.
 *
 * Generating at the right shape matters more than it looks: letterboxing a
 * landscape render into a square post wastes a third of the frame and moves the
 * composition off centre, so the artwork has to be made square to begin with.
 */
export type CreativeAspect = "square" | "portrait" | "landscape";

/**
 * What the project already knows about this client, loaded server-side.
 *
 * The browser cannot supply this: it is read from `projects` at generation time
 * so it is always current and cannot be forged by whoever is holding the page.
 */
export interface ProjectContext {
  name?: string;
  clientName?: string;
  description?: string;
  /** Intake brief and AI-generated strategy, as the agents already use it. */
  marketingContext?: Record<string, unknown>;
  /** Brand truth maintained by the LV agents. */
  brandSnapshot?: Record<string, unknown>;
}

export interface ContextManifest {
  selectedObjectIds: string[];
  excludedObjectIds: string[];
  referenceAssetIds: string[];
  includedSections: string[];
  truncated: boolean;
  characterCount: number;
}

export interface PreparedContext {
  systemInstructions: string;
  structuredContext: Record<string, unknown>;
  enhancedPrompt: string;
  manifest: ContextManifest;
}

export interface NormalizedResult {
  provider: ProviderId;
  model: string;
  outputText?: string;
  imageBase64?: string;
  imageMimeType?: "image/png" | "image/jpeg" | "image/webp";
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  textModel?: string;
  imageModel?: string;
  capabilities: ProviderCapability[];
}

export interface CreativeAIProvider {
  id: ProviderId;
  capabilities: ProviderCapability[];
  generateText(request: { system: string; prompt: string; signal: AbortSignal }): Promise<NormalizedResult>;
  generateImage?(request: { prompt: string; referenceDataUrls?: string[]; aspect?: CreativeAspect; signal: AbortSignal }): Promise<NormalizedResult>;
  editImage?(request: { prompt: string; referenceDataUrls: string[]; aspect?: CreativeAspect; signal: AbortSignal }): Promise<NormalizedResult>;
}
