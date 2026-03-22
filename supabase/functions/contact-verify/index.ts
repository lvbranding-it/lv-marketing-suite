import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  website?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
}

export interface VerifyResult {
  website: { url: string | null; live: boolean | null; status: number | null; redirected_to: string | null; error: string | null };
  email:   { address: string | null; format_valid: boolean; domain: string | null; mx_valid: boolean | null; mx_records: string[]; error: string | null };
  linkedin:{ url: string | null; format_valid: boolean; username: string | null };
}

async function checkWebsite(raw: string | null | undefined): Promise<VerifyResult["website"]> {
  if (!raw) return { url: null, live: null, status: null, redirected_to: null, error: "Not provided" };
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    return {
      url,
      live: res.status < 400,
      status: res.status,
      redirected_to: res.url !== url ? res.url : null,
      error: null,
    };
  } catch (e) {
    // Try HTTP fallback if HTTPS timed out
    if (url.startsWith("https://")) {
      try {
        const fallback = url.replace("https://", "http://");
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 5000);
        const res2 = await fetch(fallback, { method: "HEAD", signal: ctrl2.signal, redirect: "follow" });
        clearTimeout(t2);
        return { url, live: res2.status < 400, status: res2.status, redirected_to: res2.url, error: null };
      } catch { /* fall through */ }
    }
    const msg = e instanceof Error ? e.message : "Request failed";
    return { url, live: false, status: null, redirected_to: null, error: msg };
  }
}

async function checkEmail(email: string | null | undefined): Promise<VerifyResult["email"]> {
  const blank = { address: null, format_valid: false, domain: null, mx_valid: null, mx_records: [], error: "Not provided" };
  if (!email) return blank;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!ok) return { ...blank, address: email, error: "Invalid format" };
  const domain = email.split("@")[1];
  try {
    const records = await Deno.resolveDns(domain, "MX") as { preference: number; exchange: string }[];
    const exchanges = records.map((r) => r.exchange).filter(Boolean);
    return { address: email, format_valid: true, domain, mx_valid: exchanges.length > 0, mx_records: exchanges.slice(0, 3), error: null };
  } catch (e) {
    return { address: email, format_valid: true, domain, mx_valid: false, mx_records: [], error: "DNS lookup failed" };
  }
}

function checkLinkedin(raw: string | null | undefined): VerifyResult["linkedin"] {
  if (!raw) return { url: null, format_valid: false, username: null };
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    const p = new URL(url);
    const parts = p.pathname.split("/").filter(Boolean);
    const valid = p.hostname.includes("linkedin.com") && parts[0] === "in" && parts.length >= 2;
    return { url, format_valid: valid, username: valid ? parts[1] : null };
  } catch {
    return { url: raw, format_valid: false, username: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const body: VerifyRequest = await req.json();
    const [website, email] = await Promise.all([
      checkWebsite(body.website),
      checkEmail(body.email),
    ]);
    const linkedin = checkLinkedin(body.linkedin_url);
    return new Response(JSON.stringify({ website, email, linkedin }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
