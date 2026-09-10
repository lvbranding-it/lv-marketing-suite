import type { CreativeOperation, ProviderConfig, ProviderId } from "./types.ts";

type EnvReader = (key: string) => string | undefined;

export interface CreativeCanvasConfig {
  providers: Record<ProviderId, ProviderConfig>;
  defaultTextProvider: ProviderId;
  defaultImageProvider: ProviderId;
  maxUploadMb: number;
  monthlyBudgetUsd: number;
  warningPercent: number;
  maxConcurrent: number;
  maxRequestsPerMinute: number;
  timeoutMs: number;
}

const providerIds: ProviderId[] = ["openai", "google", "anthropic"];

function numberValue(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerValue(value: string | undefined, fallback: ProviderId): ProviderId {
  return providerIds.includes(value as ProviderId) ? (value as ProviderId) : fallback;
}

export function readCreativeCanvasConfig(env: EnvReader): CreativeCanvasConfig {
  const disabled = new Set((env("CREATIVE_CANVAS_DISABLED_PROVIDERS") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  const openAiEnabled = Boolean(env("OPENAI_API_KEY")) && !disabled.has("openai");
  const googleEnabled = Boolean(env("GOOGLE_GENERATIVE_AI_API_KEY")) && !disabled.has("google");
  const anthropicEnabled = Boolean(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")) && !disabled.has("anthropic");
  return {
    providers: {
      openai: {
        id: "openai",
        enabled: openAiEnabled,
        textModel: env("OPENAI_TEXT_MODEL") || "gpt-5-mini",
        imageModel: env("OPENAI_IMAGE_MODEL") || "gpt-image-1.5",
        capabilities: ["text", "vision", "image_generation", "image_edit"],
      },
      google: {
        id: "google",
        enabled: googleEnabled,
        textModel: env("GOOGLE_TEXT_MODEL") || "gemini-2.5-flash",
        imageModel: env("GOOGLE_IMAGE_MODEL") || "gemini-2.5-flash-image",
        capabilities: ["text", "vision", "image_generation", "image_edit"],
      },
      anthropic: {
        id: "anthropic",
        enabled: anthropicEnabled,
        textModel: env("ANTHROPIC_TEXT_MODEL") || "claude-sonnet-5",
        capabilities: ["text", "vision"],
      },
    },
    defaultTextProvider: providerValue(env("CREATIVE_CANVAS_DEFAULT_TEXT_PROVIDER"), "anthropic"),
    defaultImageProvider: providerValue(env("CREATIVE_CANVAS_DEFAULT_IMAGE_PROVIDER"), "openai"),
    maxUploadMb: numberValue(env("CREATIVE_CANVAS_MAX_UPLOAD_MB"), 25),
    // Deliberately low to start. Raise it once real usage is visible in the
    // ledger rather than guessing upward from a number nobody has tested.
    monthlyBudgetUsd: numberValue(env("CREATIVE_CANVAS_MONTHLY_BUDGET_USD"), 100),
    warningPercent: numberValue(env("CREATIVE_CANVAS_BUDGET_WARNING_PERCENT"), 80),
    maxConcurrent: numberValue(env("CREATIVE_CANVAS_MAX_CONCURRENT"), 2),
    maxRequestsPerMinute: numberValue(env("CREATIVE_CANVAS_REQUESTS_PER_MINUTE"), 10),
    timeoutMs: numberValue(env("CREATIVE_CANVAS_PROVIDER_TIMEOUT_MS"), 90_000),
  };
}

export function requiredCapability(operation: CreativeOperation) {
  if (operation === "generate_image" || operation === "variations") return "image_generation" as const;
  if (operation === "edit_image") return "image_edit" as const;
  if (operation === "visual_critique") return "vision" as const;
  return "text" as const;
}

export function routeProvider(
  config: CreativeCanvasConfig,
  operation: CreativeOperation,
  requested: ProviderId | "auto" = "auto",
) {
  const capability = requiredCapability(operation);
  const candidates: ProviderId[] = requested === "auto"
    ? capability === "image_generation" || capability === "image_edit"
      ? [config.defaultImageProvider, "openai", "google"]
      : operation === "visual_critique"
        ? [config.defaultTextProvider, "openai", "google", "anthropic"]
        : [config.defaultTextProvider, "anthropic", "openai", "google"]
    : [requested];
  const unique = [...new Set(candidates)];
  const selected = unique.find((id) => config.providers[id].enabled && config.providers[id].capabilities.includes(capability));
  if (!selected) {
    const label = requested === "auto" ? `No enabled provider supports ${capability}` : `${requested} is disabled or does not support ${capability}`;
    throw Object.assign(new Error(label), { code: "PROVIDER_UNAVAILABLE", status: 503 });
  }
  return config.providers[selected];
}

// Estimates only. Keep provider billing reconciliation separate.
export const PRICING_USD = {
  openai: { input1m: 0.25, output1m: 2, image: 0.04 },
  google: { input1m: 0.3, output1m: 2.5, image: 0.04 },
  anthropic: { input1m: 3, output1m: 15, image: 0 },
} as const;

export function estimateCost(provider: ProviderId, operation: CreativeOperation, inputTokens = 0, outputTokens = 0) {
  const price = PRICING_USD[provider];
  const tokenCost = (inputTokens / 1_000_000) * price.input1m + (outputTokens / 1_000_000) * price.output1m;
  return Number((tokenCost + (requiredCapability(operation).startsWith("image_") ? price.image : 0)).toFixed(6));
}
