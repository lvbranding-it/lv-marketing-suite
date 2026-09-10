import { describe, expect, it, vi } from "vitest";
import { estimateCost, readCreativeCanvasConfig, routeProvider } from "../../../supabase/functions/_shared/creative-canvas/config.ts";
import { createAnthropicProvider, createGoogleProvider, createOpenAIProvider } from "../../../supabase/functions/_shared/creative-canvas/providers.ts";

function env(values: Record<string, string> = {}) { return (key: string) => values[key]; }
const signal = new AbortController().signal;

describe("creative provider registry", () => {
  it("marks missing credentials unavailable and routes to an enabled capable provider", () => {
    const config = readCreativeCanvasConfig(env({ CLAUDE_API_KEY: "test" }));
    expect(config.providers.openai.enabled).toBe(false);
    expect(config.providers.anthropic.enabled).toBe(true);
    expect(routeProvider(config, "write_copy", "auto").id).toBe("anthropic");
    expect(() => routeProvider(config, "generate_image", "auto")).toThrow(/No enabled provider/);
  });

  it("centralizes deterministic usage estimates", () => {
    expect(estimateCost("anthropic", "write_copy", 1000, 500)).toBe(0.0105);
    expect(estimateCost("openai", "generate_image", 0, 0)).toBe(0.04);
  });
});

describe("provider response normalization", () => {
  it("normalizes OpenAI Responses output", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "resp_1", output_text: "Campaign idea", usage: { input_tokens: 12, output_tokens: 8 } }), { status: 200 })) as typeof fetch;
    const provider = createOpenAIProvider({ id: "openai", enabled: true, textModel: "text-test", imageModel: "image-test", capabilities: ["text"] }, "key", fetcher);
    const result = await provider.generateText({ system: "system", prompt: "prompt", signal });
    expect(result).toMatchObject({ provider: "openai", model: "text-test", outputText: "Campaign idea", providerRequestId: "resp_1", inputTokens: 12, outputTokens: 8 });
  });

  it("normalizes Anthropic text blocks", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1", content: [{ type: "text", text: "Strategic rationale" }], usage: { input_tokens: 20, output_tokens: 10 } }), { status: 200 })) as typeof fetch;
    const provider = createAnthropicProvider({ id: "anthropic", enabled: true, textModel: "claude-test", capabilities: ["text"] }, "key", fetcher);
    expect(await provider.generateText({ system: "system", prompt: "prompt", signal })).toMatchObject({ provider: "anthropic", outputText: "Strategic rationale", inputTokens: 20, outputTokens: 10 });
  });

  it("normalizes Gemini image and text parts", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ responseId: "google_1", candidates: [{ content: { parts: [{ text: "Direction" }, { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } }), { status: 200 })) as typeof fetch;
    const provider = createGoogleProvider({ id: "google", enabled: true, textModel: "gemini-text", imageModel: "gemini-image", capabilities: ["text", "image_generation"] }, "key", fetcher);
    expect(await provider.generateImage!({ prompt: "prompt", signal })).toMatchObject({ provider: "google", model: "gemini-image", outputText: "Direction", imageBase64: "aW1hZ2U=", imageMimeType: "image/png" });
  });

  it("normalizes provider failures without leaking raw payloads", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Safe provider message" }, secret: "raw" }), { status: 429 })) as typeof fetch;
    const provider = createAnthropicProvider({ id: "anthropic", enabled: true, textModel: "claude-test", capabilities: ["text"] }, "key", fetcher);
    await expect(provider.generateText({ system: "system", prompt: "prompt", signal })).rejects.toMatchObject({ message: "Safe provider message", code: "PROVIDER_ERROR" });
  });
});
