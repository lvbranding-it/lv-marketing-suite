import type { IncomingMessage, ServerResponse } from 'node:http';
// Keep this server entrypoint self-contained: Vercel runs emitted ESM, while
// the email renderer's explicit .ts imports are compiled by the Deno runtime.
const PUBLIC_EMAIL_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-popups allow-popups-to-escape-sandbox";

// Server-render the email so social crawlers receive its title and description.
export default async function handler(req: IncomingMessage & {query: Record<string, string | string[] | undefined>}, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', PUBLIC_EMAIL_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode=405; res.end('Method not allowed'); return; }
  const token = req.query.token;
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    res.statusCode=404; res.end('This email is not available.'); return;
  }
  try {
    const base = process.env.VITE_SUPABASE_URL;
    if (!base) throw new Error('Missing backend');
    const response = await fetch(`${base}/functions/v1/campaign-share?token=${encodeURIComponent(token)}`, {signal:AbortSignal.timeout(10000)});
    if (!response.ok) {
      res.statusCode = response.status === 404 ? 404 : 503;
      res.end(response.status === 404 ? 'This email is not available.' : 'Please try again shortly.'); return;
    }
    const data = await response.json() as {html:string};
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.statusCode=200; res.end(req.method === 'HEAD' ? undefined : data.html);
  } catch { res.statusCode=503; res.end('Please try again shortly.'); }
}
