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
}

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
  generateImage?(request: { prompt: string; referenceDataUrls?: string[]; signal: AbortSignal }): Promise<NormalizedResult>;
  editImage?(request: { prompt: string; referenceDataUrls: string[]; signal: AbortSignal }): Promise<NormalizedResult>;
}
