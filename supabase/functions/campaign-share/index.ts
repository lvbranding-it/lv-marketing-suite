import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderPublicEmail } from "../_shared/email/public.ts";

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', {status:405});
  const token = new URL(req.url).searchParams.get('token');
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Not found', {status:404});
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // No recipient data, internal campaign name, organization IDs or analytics.
  const {data, error} = await db.from('email_campaigns').select('subject,preview_text,body_html')
    .eq('share_token', token).eq('status','sent').maybeSingle();
  if (error) return new Response('Unable to load email', {status:503});
  if (!data) return new Response('Not found', {status:404});
  return Response.json({html:renderPublicEmail(data)}, {headers:{'Cache-Control':'no-store'}});
});
