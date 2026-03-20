import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export async function runSkillStream(
  params: {
    skillSystemPrompt: string;
    userMessage: string;
    conversationHistory?: Message[];
    marketingContext?: Record<string, unknown>;
  },
  callbacks: StreamCallbacks
): Promise<void> {
  // Always fetch the current session (handles token refresh automatically)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    callbacks.onError(new Error("Not authenticated"));
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_URL}/skill-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(params),
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error("Network error"));
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    // Include Claude API details so we can see the real error (e.g. invalid model, bad key)
    const detail = body.details
      ? (() => { try { return JSON.parse(body.details); } catch { return body.details; } })()
      : null;
    const detailMsg = detail?.error?.message ?? (typeof detail === "string" ? detail : "");
    const fullMsg = detailMsg ? `${body.error}: ${detailMsg}` : (body.error || `HTTP ${response.status}`);
    console.error("[skill-run] 502 details:", body);
    callbacks.onError(new Error(fullMsg));
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          callbacks.onComplete(fullText);
          return;
        }

        try {
          const event = JSON.parse(data);
          if (event.error) {
            callbacks.onError(new Error(event.error));
            return;
          }
          if (event.text) {
            fullText += event.text;
            callbacks.onToken(event.text);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error("Stream error"));
    return;
  }

  callbacks.onComplete(fullText);
}
