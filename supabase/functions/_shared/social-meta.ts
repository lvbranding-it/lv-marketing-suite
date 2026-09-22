export const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
export const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function tokenKey() {
  const secret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 24) throw new Error("Social token encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSocialToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSocialToken(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid encrypted social token");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await tokenKey(),
    base64ToBytes(encrypted),
  );
  return decoder.decode(clear);
}

export async function socialSha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function graphRequest(path: string, token: string, init?: RequestInit) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${META_GRAPH_URL}${path}${separator}access_token=${encodeURIComponent(token)}`, init);
  const requestId = response.headers.get("x-fb-trace-id") || response.headers.get("x-fb-request-id");
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new MetaApiError(data.error?.message || `Meta request failed (${response.status})`, {
      status: response.status,
      code: data.error?.code,
      subcode: data.error?.error_subcode,
      requestId,
      isTransient: data.error?.is_transient,
    });
  }
  return { data, requestId };
}

export class MetaApiError extends Error {
  status?: number;
  code?: number;
  subcode?: number;
  requestId?: string | null;
  isTransient?: boolean;

  constructor(message: string, detail: Partial<MetaApiError> = {}) {
    super(message);
    Object.assign(this, detail);
  }
}

export type FailureCategory = "temporary" | "permanent" | "authentication" | "ambiguous";

export function classifyMetaFailure(error: unknown): FailureCategory {
  if (!(error instanceof MetaApiError)) return "ambiguous";
  if (error.code === 190 || error.status === 401 || error.status === 403) return "authentication";
  if (error.isTransient || error.status === 429 || (error.status || 0) >= 500 || [1, 2, 4, 17, 32, 341, 613].includes(error.code || 0)) {
    return "temporary";
  }
  return "permanent";
}

export function safeMetaMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown publishing failure";
  return message.replace(/access_token=[^&\s]+/gi, "access_token=[redacted]").slice(0, 500);
}
