export const CREATIVE_NODE_TYPES = [
  "text", "image", "reference", "brand_context", "creative_direction",
  "palette", "typography", "conversation", "decision", "export_frame", "generation",
] as const;

export type CreativeNodeType = typeof CREATIVE_NODE_TYPES[number];
export type CreativeDecision = "favorite" | "shortlisted" | "rejected" | "needs_revision" | "client_selected" | "approved_final";
export type CreativeOperation = "generate_image" | "edit_image" | "variations" | "campaign_concept" | "write_copy" | "rewrite" | "shorten" | "expand" | "adapt_en_es" | "adapt_es_en" | "visual_critique" | "compare_concepts" | "recommend_direction" | "creative_rationale" | "production_prompt";
export type CreativeProvider = "auto" | "openai" | "google" | "anthropic";
export type CreativeAspect = "square" | "portrait" | "landscape";

export interface CreativeCanvasRecord {
  id: string;
  project_id: string;
  org_id: string;
  name: string;
  scene_document: Record<string, unknown>;
  scene_version: number;
  thumbnail_asset_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreativeAsset {
  id: string;
  project_id: string;
  org_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  file_size: number;
  width: number | null;
  height: number | null;
  source_type: "upload" | "generated" | "edited" | "variation" | "reference";
  parent_asset_id: string | null;
  generation_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  signedUrl?: string;
}

export interface BrandContext {
  brandName?: string;
  businessDescription?: string;
  objective?: string;
  audiences?: string;
  positioning?: string;
  valueProposition?: string;
  personality?: string;
  voiceTone?: string;
  requiredMessages?: string;
  visualPrinciples?: string;
  approvedColors?: string;
  typography?: string;
  requiredElements?: string;
  prohibitedElements?: string;
  avoidWords?: string;
  competitors?: string;
  languages?: string;
  market?: string;
  compliance?: string;
  additionalContext?: string;
}

export interface CreativeGeneration {
  id: string;
  provider: Exclude<CreativeProvider, "auto">;
  model: string;
  operation: CreativeOperation;
  status: "draft" | "queued" | "processing" | "completed" | "failed" | "cancelled";
  original_instruction: string;
  output_text: string | null;
  output_asset_id: string | null;
  estimated_cost_usd: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface ProviderStatus {
  id: Exclude<CreativeProvider, "auto">;
  enabled: boolean;
  capabilities: string[];
  textModel?: string;
  imageModel?: string;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateCreativeUpload(file: Pick<File, "name" | "size" | "type">) {
  const extension = file.name.toLowerCase().split(".").pop();
  const extensionMatches = file.type === "image/png" ? extension === "png"
    : file.type === "image/jpeg" ? extension === "jpg" || extension === "jpeg"
      : file.type === "image/webp" ? extension === "webp" : false;
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || !extensionMatches) return "Upload a PNG, JPEG, or WebP image with a matching file extension.";
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return "Images must be between 1 byte and 25 MB.";
  return null;
}

export function sanitizeCreativeFilename(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "creative-asset";
}
