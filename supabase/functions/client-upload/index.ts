import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;
    const uploaderName = formData.get("uploader_name") as string;
    const uploaderEmail = formData.get("uploader_email") as string;
    const message = formData.get("message") as string | null;
    const file = formData.get("file") as File;

    if (!token || !uploaderName || !uploaderEmail || !file) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up request by token
    const { data: request, error: reqErr } = await supabase
      .from("file_requests")
      .select("id, org_id, status, expires_at")
      .eq("token", token)
      .single();

    if (reqErr || !request) {
      return new Response(JSON.stringify({ error: "Invalid link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (request.status !== "active") {
      return new Response(JSON.stringify({ error: "This link is no longer active" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (request.expires_at && new Date(request.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This link has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload file to storage
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${request.org_id}/${request.id}/${Date.now()}-${safeName}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from("client-uploads")
      .upload(filePath, fileBuffer, { contentType: file.type || "application/octet-stream" });

    if (uploadErr) throw uploadErr;

    // Insert submission record
    const { error: insertErr } = await supabase.from("file_submissions").insert({
      request_id: request.id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      file_path: filePath,
      uploader_name: uploaderName,
      uploader_email: uploaderEmail,
      message: message || null,
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
