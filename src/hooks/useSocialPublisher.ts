import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { defaultScheduleValue, utcToZonedLocal, zonedDateTimeToUtc, type SocialPlatform } from "@/lib/socialPublisher";
import { instagramImage } from "@/lib/socialMedia";

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
  /** Missing on posts duplicated before October 7, 2026, which share the original's files. */
  storage_path: string | null;
  mime_type: string | null;
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
  link_url: string | null;
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

type UploadedAsset = { path: string; url: string; file: File; position: number };

// The database's reasons for refusing to schedule, in words. A refusal used to
// reach the screen as "Unable to save this post.", which said nothing.
const SCHEDULE_REFUSALS: Record<string, string> = {
  POST_VALIDATION_FAILED: "The post could not be scheduled. The time must be more than a minute away, and every destination must be switched on, connected, and have its media.",
  APPROVAL_REQUIRED: "This workspace needs approval before scheduling. Save the draft and submit it for review.",
  POST_NOT_SCHEDULABLE: "This post is already scheduled or published.",
  POST_NOT_EDITABLE: "This post can no longer be edited: part of it is published, or being published right now. Duplicate it instead.",
  NOT_AUTHORIZED: "Managers and administrators schedule posts, and edit posts that are in review, approved or scheduled.",
};

function saveError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "";
  return new Error(SCHEDULE_REFUSALS[message] || message || "Unable to save this post.");
}

async function uploadAsset(orgId: string, postId: string, file: File, position: number, stored: string[]): Promise<UploadedAsset> {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-100);
  const path = `${orgId}/${postId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  stored.push(path);
  const { data } = supabase.storage.from("social-media").getPublicUrl(path);
  return { path, url: data.publicUrl, file, position };
}

async function uploadAssets(orgId: string, postId: string, files: File[], stored: string[]) {
  const uploaded: UploadedAsset[] = [];
  for (let index = 0; index < files.length; index++) uploaded.push(await uploadAsset(orgId, postId, files[index], index, stored));
  return uploaded;
}

/**
 * Instagram's media: a JPEG copy of any image Instagram cannot take as it is
 * (PNG, WebP, wider than 1440 pixels or over 8 MB), uploaded alongside the
 * original, which Facebook keeps. Files that already fit are not uploaded twice.
 */
async function instagramAssets(orgId: string, postId: string, uploaded: UploadedAsset[], stored: string[]) {
  const result: UploadedAsset[] = [];
  for (const asset of uploaded) {
    const copy = await instagramImage(asset.file);
    result.push(copy === asset.file ? asset : await uploadAsset(orgId, postId, copy, asset.position, stored));
  }
  return result;
}

/** The composer's fields for an existing post, without its media (see loadPostMedia). */
export function draftFromPost(post: SocialPost, fallbackTimezone: string): ComposerDraft {
  const facebook = post.social_post_variants.find((variant) => variant.platform === "facebook");
  const instagram = post.social_post_variants.find((variant) => variant.platform === "instagram");
  const timezone = post.scheduled_timezone || fallbackTimezone;
  const scheduled = post.social_post_variants.map((variant) => variant.scheduled_for_utc).find(Boolean);
  return {
    title: post.title,
    notes: post.internal_notes ?? "",
    accountIds: post.social_post_variants.map((variant) => variant.social_account_id),
    facebookCaption: facebook?.caption ?? "",
    instagramCaption: instagram?.caption ?? "",
    facebookFormat: facebook?.format ?? "image",
    instagramFormat: instagram?.format ?? "image",
    linkUrl: facebook?.link_url ?? "",
    scheduledLocal: scheduled ? utcToZonedLocal(scheduled, timezone) : defaultScheduleValue(),
    timezone,
    files: [],
  };
}

/**
 * A post's media as files, in order, so the composer can show and change it.
 * Facebook's copies are the originals; Instagram's may be its JPEG copies,
 * used only when the post has no Facebook version.
 */
export async function loadPostMedia(post: SocialPost): Promise<File[]> {
  const variant = post.social_post_variants.find((item) => item.platform === "facebook" && item.social_post_assets?.length)
    ?? post.social_post_variants.find((item) => item.social_post_assets?.length);
  const assets = [...(variant?.social_post_assets ?? [])].sort((a, b) => a.position - b.position);
  return Promise.all(assets.map(async (asset, index) => {
    const response = await fetch(asset.public_url);
    if (!response.ok) throw new Error("A media file of this post could not be loaded.");
    const blob = await response.blob();
    const stored = asset.storage_path || decodeURIComponent(new URL(asset.public_url).pathname);
    const name = (stored.split("/").pop() || `media-${index + 1}`).replace(/^[0-9a-f-]{36}-/, "");
    return new File([blob], name, { type: asset.mime_type || blob.type, lastModified: index });
  }));
}

/**
 * Saves the composer: a new post, or new content for an existing one.
 *
 * Editing first takes the post back to draft (social_reopen_post), then
 * replaces its channels and media with the composer's, and schedules it again
 * if asked. If scheduling then fails, the edited content stays saved as a
 * draft: rolling it back would lose the edit, and the earlier version's jobs
 * are already gone.
 */
export function useCreateSocialPost() {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, schedule, postId }: { draft: ComposerDraft; schedule: boolean; postId?: string }) => {
      if (!org) throw new Error("Workspace unavailable");
      const fields = { title: draft.title.trim(), internal_notes: draft.notes.trim() || null, scheduled_timezone: draft.timezone };

      let post: { id: string };
      let previousVariantIds: string[] = [];
      let previousFiles: { storage_path: string | null; public_url: string }[] = [];
      if (postId) {
        const { error: reopenError } = await db.rpc("social_reopen_post", { p_post_id: postId });
        if (reopenError) throw saveError(reopenError);
        const { data: previous, error: previousError } = await db.from("social_post_variants")
          .select("id, social_post_assets(storage_path, public_url)").eq("social_post_id", postId);
        if (previousError) throw saveError(previousError);
        previousVariantIds = (previous || []).map((variant: { id: string }) => variant.id);
        previousFiles = (previous || []).flatMap((variant: { social_post_assets: { storage_path: string | null; public_url: string }[] }) =>
          variant.social_post_assets || []);
        const { data: updated, error: updateError } = await db.from("social_posts").update(fields).eq("id", postId).select("id").single();
        if (updateError) throw saveError(updateError);
        post = updated;
      } else {
        const { data: created, error: postError } = await db.from("social_posts").insert({ org_id: org.id, ...fields }).select("*").single();
        if (postError) throw saveError(postError);
        post = created;
      }

      // Every file stored for this save, removed again if it fails: the post
      // used to be deleted on failure while its media stayed in storage.
      const stored: string[] = [];
      let newVariantIds: string[] = [];
      try {
        const uploaded = await uploadAssets(org.id, post.id, draft.files, stored);
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
        newVariantIds = (savedVariants || []).map((variant: { id: string }) => variant.id);
        const forInstagram = (savedVariants || []).some((variant: { platform: SocialPlatform }) => variant.platform === "instagram")
          ? await instagramAssets(org.id, post.id, uploaded, stored)
          : uploaded;
        const assets = (savedVariants || []).flatMap((variant: { id: string; platform: SocialPlatform }) => (variant.platform === "instagram" ? forInstagram : uploaded).map((asset) => ({
          org_id: org.id, post_variant_id: variant.id, storage_path: asset.path, public_url: asset.url,
          position: asset.position, media_type: asset.file.type.startsWith("video/") ? "video" : "image",
          mime_type: asset.file.type, file_size_bytes: asset.file.size,
        })));
        if (assets.length) {
          const { error: assetError } = await db.from("social_post_assets").insert(assets);
          if (assetError) throw assetError;
        }
        // The earlier version's channels go only once the new ones are in place.
        if (previousVariantIds.length) {
          const { error: removeError } = await db.from("social_post_variants").delete().in("id", previousVariantIds);
          if (removeError) throw removeError;
        }
      } catch (error) {
        if (postId) {
          if (newVariantIds.length) await db.from("social_post_variants").delete().in("id", newVariantIds);
        } else {
          await db.from("social_posts").delete().eq("id", post.id);
        }
        if (stored.length) await supabase.storage.from("social-media").remove(stored).catch(() => undefined);
        throw saveError(error);
      }

      // The earlier media is removed unless another post still shows it: a
      // duplicate shares its original's files.
      if (previousFiles.length) {
        const urls = [...new Set(previousFiles.map((file) => file.public_url))];
        const { data: stillUsed } = await db.from("social_post_assets").select("public_url").in("public_url", urls);
        const used = new Set((stillUsed || []).map((asset: { public_url: string }) => asset.public_url));
        const unused = [...new Set(previousFiles.filter((file) => file.storage_path && !used.has(file.public_url)).map((file) => file.storage_path as string))];
        if (unused.length) await supabase.storage.from("social-media").remove(unused).catch(() => undefined);
      }

      if (schedule) {
        const { error: scheduleError } = await db.rpc("social_schedule_post", { p_post_id: post.id });
        if (scheduleError) {
          if (postId) {
            queryClient.invalidateQueries({ queryKey: ["social-publisher", org.id] });
            throw new Error(`Your changes are saved as a draft, but it could not be scheduled. ${saveError(scheduleError).message}`);
          }
          await db.from("social_posts").delete().eq("id", post.id);
          if (stored.length) await supabase.storage.from("social-media").remove(stored).catch(() => undefined);
          throw saveError(scheduleError);
        }
      }
      return post;
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
            storage_path: asset.storage_path, mime_type: asset.mime_type,
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
