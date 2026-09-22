import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { zonedDateTimeToUtc, type SocialPlatform } from "@/lib/socialPublisher";

const db = supabase as any;

export interface SocialAccount {
  id: string;
  org_id: string;
  platform: SocialPlatform;
  display_name: string;
  username: string | null;
  profile_image_url: string | null;
  status: "active" | "inactive" | "action_required";
  is_selected: boolean;
  capabilities: Record<string, unknown>;
  last_synced_at: string | null;
}

export interface SocialAsset {
  id: string;
  public_url: string;
  media_type: "image" | "video";
  position: number;
}

export interface SocialJob {
  id: string;
  status: string;
  attempt_count: number;
  last_error_category: string | null;
  last_error_message_safe: string | null;
}

export interface SocialVariant {
  id: string;
  platform: SocialPlatform;
  format: string;
  caption: string;
  scheduled_for_utc: string | null;
  publication_status: string;
  provider_post_id: string | null;
  provider_permalink: string | null;
  social_account_id: string;
  social_accounts: SocialAccount;
  social_post_assets: SocialAsset[];
  social_publish_jobs: SocialJob[];
}

export interface SocialPost {
  id: string;
  title: string;
  internal_notes: string | null;
  workflow_status: string;
  scheduled_timezone: string;
  created_at: string;
  updated_at: string;
  social_post_variants: SocialVariant[];
}

export interface ComposerDraft {
  title: string;
  notes: string;
  accountIds: string[];
  facebookCaption: string;
  instagramCaption: string;
  facebookFormat: string;
  instagramFormat: string;
  linkUrl: string;
  scheduledLocal: string;
  timezone: string;
  files: File[];
}

export function useSocialPublisherData() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["social-publisher", org?.id],
    enabled: Boolean(org),
    queryFn: async () => {
      const [accounts, posts, connection, settings, activity] = await Promise.all([
        db.from("social_accounts").select("*").eq("org_id", org!.id).order("platform").order("display_name"),
        db.from("social_posts").select("*, social_post_variants(*, social_accounts(*), social_post_assets(*), social_publish_jobs(*))")
          .eq("org_id", org!.id).order("updated_at", { ascending: false }),
        db.rpc("social_connection_status", { p_org_id: org!.id }),
        db.from("social_publisher_settings").select("*").eq("org_id", org!.id).maybeSingle(),
        db.from("social_activity_log").select("*").eq("org_id", org!.id).order("created_at", { ascending: false }).limit(20),
      ]);
      for (const result of [accounts, posts, connection, settings, activity]) if (result.error) throw result.error;
      return {
        accounts: (accounts.data || []) as SocialAccount[],
        posts: (posts.data || []) as SocialPost[],
        connection: connection.data?.[0] || null,
        settings: settings.data || { org_id: org!.id, timezone: "America/Chicago", approval_required: false },
        activity: activity.data || [],
      };
    },
    staleTime: 15_000,
    refetchInterval: (query) => {
      const posts = (query.state.data as any)?.posts || [];
      return posts.some((post: SocialPost) => ["publishing", "scheduled"].includes(post.workflow_status)) ? 30_000 : false;
    },
  });
}

async function uploadAssets(orgId: string, postId: string, files: File[]) {
  const uploaded: Array<{ path: string; url: string; file: File; position: number }> = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-100);
    const path = `${orgId}/${postId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("social-media").getPublicUrl(path);
    uploaded.push({ path, url: data.publicUrl, file, position: index });
  }
  return uploaded;
}

export function useCreateSocialPost() {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, schedule }: { draft: ComposerDraft; schedule: boolean }) => {
      if (!org) throw new Error("Workspace unavailable");
      const { data: post, error: postError } = await db.from("social_posts").insert({
        org_id: org.id, title: draft.title.trim(), internal_notes: draft.notes.trim() || null,
        scheduled_timezone: draft.timezone,
      }).select("*").single();
      if (postError) throw postError;
      try {
        const uploaded = await uploadAssets(org.id, post.id, draft.files);
        const { data: accounts, error: accountError } = await db.from("social_accounts").select("id,platform").in("id", draft.accountIds).eq("org_id", org.id);
        if (accountError) throw accountError;
        const scheduledUtc = schedule ? zonedDateTimeToUtc(draft.scheduledLocal, draft.timezone) : null;
        const variants = (accounts || []).map((account: { id: string; platform: SocialPlatform }) => ({
          org_id: org.id, social_post_id: post.id, social_account_id: account.id, platform: account.platform,
          format: account.platform === "facebook" ? draft.facebookFormat : draft.instagramFormat,
          caption: account.platform === "facebook" ? draft.facebookCaption : draft.instagramCaption,
          link_url: account.platform === "facebook" && draft.linkUrl ? draft.linkUrl : null,
          scheduled_for_utc: scheduledUtc,
        }));
        const { data: savedVariants, error: variantError } = await db.from("social_post_variants").insert(variants).select("id,platform");
        if (variantError) throw variantError;
        const assets = (savedVariants || []).flatMap((variant: { id: string }) => uploaded.map((asset) => ({
          org_id: org.id, post_variant_id: variant.id, storage_path: asset.path, public_url: asset.url,
          position: asset.position, media_type: asset.file.type.startsWith("video/") ? "video" : "image",
          mime_type: asset.file.type, file_size_bytes: asset.file.size,
        })));
        if (assets.length) {
          const { error: assetError } = await db.from("social_post_assets").insert(assets);
          if (assetError) throw assetError;
        }
        if (schedule) {
          const { error: scheduleError } = await db.rpc("social_schedule_post", { p_post_id: post.id });
          if (scheduleError) throw scheduleError;
        }
        return post;
      } catch (error) {
        await db.from("social_posts").delete().eq("id", post.id);
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-publisher", org?.id] }),
  });
}

export function useSocialAction() {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["social-publisher", org?.id] });
  return {
    transition: useMutation({
      mutationFn: async ({ postId, action, comment }: { postId: string; action: string; comment?: string }) => {
        const { data, error } = await db.rpc("social_transition_post", { p_post_id: postId, p_action: action, p_comment: comment || null });
        if (error) throw error;
        return data;
      }, onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: async (jobId: string) => {
        const { error } = await db.rpc("social_retry_publish_job", { p_job_id: jobId });
        if (error) throw error;
        const result = await supabase.functions.invoke("social-publish", { body: { job_id: jobId } });
        if (result.error) throw result.error;
        return result.data;
      }, onSuccess: refresh,
    }),
    schedule: useMutation({
      mutationFn: async ({ postId, scheduledLocal, timezone }: { postId: string; scheduledLocal: string; timezone: string }) => {
        const scheduled = zonedDateTimeToUtc(scheduledLocal, timezone);
        const { error: variantError } = await db.from("social_post_variants").update({ scheduled_for_utc: scheduled }).eq("social_post_id", postId);
        if (variantError) throw variantError;
        const { data, error } = await db.rpc("social_schedule_post", { p_post_id: postId });
        if (error) throw error;
        return data;
      }, onSuccess: refresh,
    }),
    duplicate: useMutation({
      mutationFn: async (post: SocialPost) => {
        if (!org) throw new Error("Workspace unavailable");
        const { data: copy, error } = await db.from("social_posts").insert({
          org_id: org.id, title: `${post.title} (Copy)`, internal_notes: post.internal_notes,
          scheduled_timezone: post.scheduled_timezone, workflow_status: "draft",
        }).select("id").single();
        if (error) throw error;
        const variants = post.social_post_variants.map((variant) => ({
          org_id: org.id, social_post_id: copy.id, social_account_id: variant.social_account_id,
          platform: variant.platform, format: variant.format, caption: variant.caption,
        }));
        const { data: saved, error: variantError } = await db.from("social_post_variants").insert(variants).select("id,platform");
        if (variantError) throw variantError;
        const assets = (saved || []).flatMap((variant: any) => {
          const source = post.social_post_variants.find((item) => item.platform === variant.platform);
          return (source?.social_post_assets || []).map((asset) => ({
            org_id: org.id, post_variant_id: variant.id, public_url: asset.public_url,
            position: asset.position, media_type: asset.media_type,
          }));
        });
        if (assets.length) await db.from("social_post_assets").insert(assets);
        return copy.id;
      }, onSuccess: refresh,
    }),
    connect: useMutation({
      mutationFn: async () => {
        if (!org) throw new Error("Workspace unavailable");
        const { data, error } = await supabase.functions.invoke("social-meta-oauth", { body: { org_id: org.id, action: "connect" } });
        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || "Meta authorization is unavailable");
        window.location.assign(data.url);
      },
    }),
    sync: useMutation({
      mutationFn: async () => {
        if (!org) throw new Error("Workspace unavailable");
        const { data, error } = await supabase.functions.invoke("social-meta-oauth", { body: { org_id: org.id, action: "sync" } });
        if (error) throw error;
        return data;
      }, onSuccess: refresh,
    }),
    disconnect: useMutation({
      mutationFn: async () => {
        if (!org) throw new Error("Workspace unavailable");
        const { data, error } = await supabase.functions.invoke("social-meta-oauth", { body: { org_id: org.id, action: "disconnect" } });
        if (error) throw error;
        return data;
      }, onSuccess: refresh,
    }),
    selectAccount: useMutation({
      mutationFn: async ({ accountId, selected }: { accountId: string; selected: boolean }) => {
        const { error } = await db.from("social_accounts").update({ is_selected: selected }).eq("id", accountId);
        if (error) throw error;
      }, onSuccess: refresh,
    }),
  };
}
