import type { CreativeAIProvider, CreativeAspect, NormalizedResult, ProviderConfig, ProviderId } from "./types.ts";

/** The shapes the image endpoint accepts, nearest to each delivery format. */
const OPENAI_IMAGE_SIZE: Record<CreativeAspect, string> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

type EnvReader = (key: string) => string | undefined;
type Fetcher = typeof fetch;

async function jsonOrError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `Provider request failed (${response.status})`;
    throw Object.assign(new Error(message), { code: "PROVIDER_ERROR", status: 502 });
  }
  return payload;
}

function dataUrlParts(value: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!match) throw Object.assign(new Error("Invalid reference image"), { code: "INVALID_REFERENCE", status: 400 });
  return { mimeType: match[1], data: match[2] };
}

export function createOpenAIProvider(config: ProviderConfig, apiKey: string, fetcher: Fetcher = fetch): CreativeAIProvider {
  return {
    id: "openai",
    capabilities: config.capabilities,
    async generateText({ system, prompt, signal }) {
      const started = Date.now();
      const payload = await jsonOrError(await fetcher("https://api.openai.com/v1/responses", {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.textModel, instructions: system, input: prompt }),
      }));
      return {
        provider: "openai", model: config.textModel!,
        outputText: payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? []).map((item: any) => item.text ?? "").join("\n"),
        providerRequestId: payload.id, inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens,
        durationMs: Date.now() - started,
      };
    },
    async generateImage({ prompt, referenceDataUrls, aspect, signal }) {
      const started = Date.now();
      const endpoint = referenceDataUrls?.length ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations";
      let body: BodyInit;
      let headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
      if (referenceDataUrls?.length) {
        const form = new FormData();
        form.append("model", config.imageModel!);
        form.append("prompt", prompt);
        form.append("size", OPENAI_IMAGE_SIZE[aspect ?? "landscape"]);
        form.append("output_format", "png");
        // Both of these were missing, and both matter most on exactly the job
        // this endpoint exists for. `quality` was set on the text-to-image call
        // but not here, so every edit ran at the default. `input_fidelity` is
        // what preserves a face, a logo or a garment's detail from the input
        // instead of reinterpreting it — without it, "keep the person, change
        // the clothes" comes back as a different person wearing the clothes.
        form.append("quality", "high");
        form.append("input_fidelity", "high");
        referenceDataUrls.forEach((url, index) => {
          const part = dataUrlParts(url);
          const bytes = Uint8Array.from(atob(part.data), (char) => char.charCodeAt(0));
          form.append("image[]", new Blob([bytes], { type: part.mimeType }), `reference-${index}.png`);
        });
        body = form;
      } else {
        headers = { ...headers, "Content-Type": "application/json" };
        body = JSON.stringify({ model: config.imageModel, prompt, size: OPENAI_IMAGE_SIZE[aspect ?? "landscape"], quality: "high", output_format: "png" });
      }
      const payload = await jsonOrError(await fetcher(endpoint, { method: "POST", signal, headers, body }));
      return { provider: "openai", model: config.imageModel!, imageBase64: payload.data?.[0]?.b64_json, imageMimeType: "image/png", providerRequestId: payload.id, durationMs: Date.now() - started };
    },
    async editImage(request) { return this.generateImage!({ ...request, referenceDataUrls: request.referenceDataUrls, aspect: request.aspect }); },
  };
}

export function createAnthropicProvider(config: ProviderConfig, apiKey: string, fetcher: Fetcher = fetch): CreativeAIProvider {
  return {
    id: "anthropic",
    capabilities: config.capabilities,
    async generateText({ system, prompt, signal }) {
      const started = Date.now();
      const payload = await jsonOrError(await fetcher("https://api.anthropic.com/v1/messages", {
        method: "POST", signal,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.textModel, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] }),
      }));
      return { provider: "anthropic", model: config.textModel!, outputText: payload.content?.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n") ?? "", providerRequestId: payload.id, inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens, durationMs: Date.now() - started };
    },
  };
}

export function createGoogleProvider(config: ProviderConfig, apiKey: string, fetcher: Fetcher = fetch): CreativeAIProvider {
  const generate = async (model: string, system: string, prompt: string, references: string[], signal: AbortSignal): Promise<NormalizedResult> => {
    const started = Date.now();
    const parts: any[] = [{ text: prompt }];
    references.forEach((url) => {
      const part = dataUrlParts(url);
      parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    });
    const payload = await jsonOrError(await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }),
    }));
    const resultParts = payload.candidates?.[0]?.content?.parts ?? [];
    const imagePart = resultParts.find((part: any) => part.inlineData?.data);
    return { provider: "google", model, outputText: resultParts.map((part: any) => part.text ?? "").join("\n").trim() || undefined, imageBase64: imagePart?.inlineData?.data, imageMimeType: imagePart?.inlineData?.mimeType, providerRequestId: payload.responseId, inputTokens: payload.usageMetadata?.promptTokenCount, outputTokens: payload.usageMetadata?.candidatesTokenCount, durationMs: Date.now() - started };
  };
  return {
    id: "google", capabilities: config.capabilities,
    generateText: ({ system, prompt, signal }) => generate(config.textModel!, system, prompt, [], signal),
    generateImage: ({ prompt, referenceDataUrls = [], signal }) => generate(config.imageModel!, "Create a production-ready image from the supplied creative direction.", prompt, referenceDataUrls, signal),
    editImage: ({ prompt, referenceDataUrls, signal }) => generate(config.imageModel!, "Edit the supplied reference while preserving elements not named in the instruction.", prompt, referenceDataUrls, signal),
  };
}

export function createProvider(id: ProviderId, config: ProviderConfig, env: EnvReader, fetcher: Fetcher = fetch) {
  if (id === "openai") return createOpenAIProvider(config, env("OPENAI_API_KEY")!, fetcher);
  if (id === "google") return createGoogleProvider(config, env("GOOGLE_GENERATIVE_AI_API_KEY")!, fetcher);
  return createAnthropicProvider(config, env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")!, fetcher);
}
