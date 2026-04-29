import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

// The contest tables were added after the Supabase types were last generated.
// Cast through `any` to bypass stale type-check errors until types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CONTEST_PHOTOS_BUCKET = "contest-photos";

export function normalizeContestPhotoUrl(url: string | null | undefined) {
  if (!url) return url ?? null;
  return url.replace(
    `/storage/v1/object/${CONTEST_PHOTOS_BUCKET}/`,
    `/storage/v1/object/public/${CONTEST_PHOTOS_BUCKET}/`
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Contest {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  description: string | null;
  voting_instructions: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  brand_color: string;
  brand_accent: string;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  status: "draft" | "active" | "closed" | "winner_announced";
  results_public: boolean;
  winner_contestant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contestant {
  id: string;
  contest_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  display_order: number;
  created_at: string;
}

export type ContestStatus = Contest["status"];

// ── Slug generator ────────────────────────────────────────────────────────────

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Admin queries (authenticated) ─────────────────────────────────────────────

export function useContests() {
  const { org } = useOrg();
  return useQuery<Contest[]>({
    queryKey: ["contests", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await db
        .from("contests")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Contest[]).map((contest) => ({
        ...contest,
        client_logo_url: normalizeContestPhotoUrl(contest.client_logo_url),
      }));
    },
    enabled: !!org,
  });
}

export function useContest(id: string | undefined) {
  return useQuery<Contest | null>({
    queryKey: ["contest", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await db
        .from("contests")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return {
        ...(data as Contest),
        client_logo_url: normalizeContestPhotoUrl((data as Contest).client_logo_url),
      };
    },
    enabled: !!id,
  });
}

// ── Public query (voting page — no auth) ──────────────────────────────────────

export function useContestBySlug(slug: string | undefined) {
  return useQuery<Contest | null>({
    queryKey: ["contest_slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await db
        .from("contests")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return {
        ...(data as Contest),
        client_logo_url: normalizeContestPhotoUrl((data as Contest).client_logo_url),
      };
    },
    enabled: !!slug,
  });
}

// ── Contestants ───────────────────────────────────────────────────────────────

export function useContestants(contestId: string | undefined) {
  return useQuery<Contestant[]>({
    queryKey: ["contestants", contestId],
    queryFn: async () => {
      if (!contestId) return [];
      const { data, error } = await db
        .from("contestants")
        .select("*")
        .eq("contest_id", contestId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Contestant[]).map((contestant) => ({
        ...contestant,
        photo_url: normalizeContestPhotoUrl(contestant.photo_url),
      }));
    },
    enabled: !!contestId,
  });
}

// ── Vote counts (public, live refresh) ───────────────────────────────────────

export function useVoteCounts(contestId: string | undefined, liveRefresh = false) {
  return useQuery<Record<string, number>>({
    queryKey: ["vote_counts", contestId],
    queryFn: async () => {
      if (!contestId) return {};
      const { data, error } = await db
        .rpc("get_contest_vote_counts", { _contest_id: contestId });
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.contestant_id] = Number(row.vote_count ?? 0);
      }
      return counts;
    },
    enabled: !!contestId,
    refetchInterval: liveRefresh ? 30_000 : false,
  });
}

// ── Contest mutations ─────────────────────────────────────────────────────────

export function useCreateContest() {
  const qc = useQueryClient();
  const { org } = useOrg();
  return useMutation({
    mutationFn: async (
      values: Omit<Contest, "id" | "org_id" | "created_at" | "updated_at">
    ) => {
      if (!org) throw new Error("No organisation");
      const { data, error } = await db
        .from("contests")
        .insert({ ...values, org_id: org.id })
        .select()
        .single();
      if (error) throw error;
      return data as Contest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contests"] }),
  });
}

export function useUpdateContest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Contest> & { id: string }) => {
      const { data, error } = await db
        .from("contests")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Contest;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contests"] });
      qc.invalidateQueries({ queryKey: ["contest", data.id] });
      qc.invalidateQueries({ queryKey: ["contest_slug", data.slug] });
    },
  });
}

export function useDeleteContest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("contests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contests"] }),
  });
}

// ── Contestant mutations ──────────────────────────────────────────────────────

export function useCreateContestant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<Contestant, "id" | "created_at">) => {
      const { data, error } = await db
        .from("contestants")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as Contestant;
    },
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ["contestants", data.contest_id] }),
  });
}

export function useUpdateContestant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Contestant> & { id: string }) => {
      const { data, error } = await db
        .from("contestants")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Contestant;
    },
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ["contestants", data.contest_id] }),
  });
}

export function useDeleteContestant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contestId }: { id: string; contestId: string }) => {
      const { error } = await db.from("contestants").delete().eq("id", id);
      if (error) throw error;
      return contestId;
    },
    onSuccess: (contestId) =>
      qc.invalidateQueries({ queryKey: ["contestants", contestId] }),
  });
}

// ── Photo upload ──────────────────────────────────────────────────────────────

async function uploadContestAsset(file: File, folder: "contestants" | "logos"): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(CONTEST_PHOTOS_BUCKET)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(CONTEST_PHOTOS_BUCKET).getPublicUrl(path);
  return normalizeContestPhotoUrl(data.publicUrl) ?? data.publicUrl;
}

export function uploadContestantPhoto(file: File): Promise<string> {
  return uploadContestAsset(file, "contestants");
}

export function uploadContestLogo(file: File): Promise<string> {
  return uploadContestAsset(file, "logos");
}
