import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches an Advisor reply spoken in the LV Branding voice.
 *
 * Returns null whenever the branded voice cannot be used — not configured yet,
 * the account is out of characters, the representative has hit their hourly
 * allowance, or the network failed. Every one of those is an ordinary condition
 * rather than an error to show someone, because the caller answers a null by
 * speaking the same words with the browser's built-in voice. The reply always
 * gets read aloud; only the quality of the voice varies.
 */
export async function fetchBrandSpeech(
  org: string,
  text: string,
  language: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return null;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/advisor-speak`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orgId: org, text, language }),
        signal,
      },
    );
    if (!response.ok) return null;

    const audio = await response.blob();
    // An empty body would play as silence, which reads as a broken feature.
    return audio.size > 0 ? audio : null;
  } catch {
    // Includes the abort raised when the listener presses stop.
    return null;
  }
}
