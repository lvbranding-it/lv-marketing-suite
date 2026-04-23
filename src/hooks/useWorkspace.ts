import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, WorkspaceBlock, WorkspacePage } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";

export type WorkspaceBlockType = WorkspaceBlock["type"];

export interface WorkspaceBlockContent {
  text?: string;
  checked?: boolean;
}

interface WorkspaceBlockDraft {
  type?: WorkspaceBlockType;
  content?: WorkspaceBlockContent;
}

interface CreateWorkspacePageValues {
  title?: string;
  parent_id?: string | null;
  icon?: string | null;
  cover_color?: string | null;
  metadata?: Json;
  blocks?: WorkspaceBlockDraft[];
}

const PAGE_GAP = 1000;
const BLOCK_GAP = 1000;

export function getBlockContent(block: WorkspaceBlock): WorkspaceBlockContent {
  if (!block.content || typeof block.content !== "object" || Array.isArray(block.content)) {
    return { text: "" };
  }
  return block.content as WorkspaceBlockContent;
}

export function blockText(block: WorkspaceBlock) {
  return getBlockContent(block).text ?? "";
}

function nextPosition<T extends { parent_id?: string | null; page_id?: string; position: number }>(
  items: T[] | undefined,
  predicate: (item: T) => boolean
) {
  const siblings = (items ?? []).filter(predicate);
  return siblings.length ? Math.max(...siblings.map((item) => item.position)) + PAGE_GAP : 0;
}

function pageAndDescendantIds(pages: WorkspacePage[] | undefined, pageId: string) {
  const childrenByParent = new Map<string, WorkspacePage[]>();
  (pages ?? []).forEach((page) => {
    if (!page.parent_id) return;
    childrenByParent.set(page.parent_id, [...(childrenByParent.get(page.parent_id) ?? []), page]);
  });

  const ids = new Set([pageId]);
  const visit = (id: string) => {
    (childrenByParent.get(id) ?? []).forEach((child) => {
      ids.add(child.id);
      visit(child.id);
    });
  };
  visit(pageId);
  return ids;
}

export function useWorkspacePages() {
  const { org } = useOrg();

  return useQuery({
    queryKey: ["workspace_pages", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("workspace_pages")
        .select("*")
        .eq("org_id", org.id)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspacePage[];
    },
    enabled: !!org,
  });
}

export function useWorkspaceBlocks(pageId: string | null) {
  return useQuery({
    queryKey: ["workspace_blocks", pageId],
    queryFn: async () => {
      if (!pageId) return [];
      const { data, error } = await supabase
        .from("workspace_blocks")
        .select("*")
        .eq("page_id", pageId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceBlock[];
    },
    enabled: !!pageId,
  });
}

export function useWorkspaceBlockSearch(query: string) {
  const { org } = useOrg();
  const normalized = query.trim();

  return useQuery({
    queryKey: ["workspace_block_search", org?.id, normalized],
    queryFn: async () => {
      if (!org || normalized.length < 2) return [];
      const { data, error } = await supabase
        .from("workspace_blocks")
        .select("*")
        .eq("org_id", org.id)
        .filter("content->>text", "ilike", `%${normalized}%`)
        .order("updated_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as WorkspaceBlock[];
    },
    enabled: !!org && normalized.length >= 2,
  });
}

export function useCreateWorkspacePage() {
  const { org } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CreateWorkspacePageValues) => {
      if (!org || !user) throw new Error("Not authenticated");
      const cached = queryClient.getQueryData<WorkspacePage[]>(["workspace_pages", org.id]);
      const parentId = values.parent_id ?? null;
      const position = nextPosition(cached, (page) => (page.parent_id ?? null) === parentId);

      const { data, error } = await supabase
        .from("workspace_pages")
        .insert({
          org_id: org.id,
          parent_id: parentId,
          title: values.title?.trim() || "Untitled",
          icon: values.icon ?? null,
          cover_color: values.cover_color ?? null,
          metadata: values.metadata ?? {},
          position,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      const page = data as WorkspacePage;
      const initialBlocks = values.blocks?.length
        ? values.blocks
        : [{ type: "paragraph" as WorkspaceBlockType, content: { text: "" } }];
      const { error: blockError } = await supabase.from("workspace_blocks").insert(
        initialBlocks.map((block, index) => ({
          org_id: org.id,
          page_id: page.id,
          type: block.type ?? "paragraph",
          content: (block.content ?? { text: "" }) as Json,
          position: index * BLOCK_GAP,
          created_by: user.id,
        }))
      );
      if (blockError) throw blockError;
      return page;
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
    },
  });
}

export function useUpdateWorkspacePage() {
  const { org } = useOrg();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkspacePage> & { id: string }) => {
      const { data, error } = await supabase
        .from("workspace_pages")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as WorkspacePage;
    },
    onMutate: async (updates) => {
      if (!org) return;
      await queryClient.cancelQueries({ queryKey: ["workspace_pages", org.id] });
      const previous = queryClient.getQueryData<WorkspacePage[]>(["workspace_pages", org.id]);
      queryClient.setQueryData<WorkspacePage[]>(["workspace_pages", org.id], (current) =>
        (current ?? []).map((item) => (item.id === updates.id ? { ...item, ...updates } : item))
      );
      return { previous, orgId: org.id };
    },
    onError: (_error, _updates, context) => {
      if (context?.orgId) {
        queryClient.setQueryData(["workspace_pages", context.orgId], context.previous);
      }
    },
    onSuccess: (page) => {
      queryClient.setQueryData<WorkspacePage[]>(["workspace_pages", page.org_id], (current) =>
        (current ?? []).map((item) => (item.id === page.id ? page : item))
      );
    },
    onSettled: (page) => {
      if (page?.org_id) queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
    },
  });
}

export function useDeleteWorkspacePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (page: WorkspacePage) => {
      const { error } = await supabase.from("workspace_pages").delete().eq("id", page.id);
      if (error) throw error;
      return page;
    },
    onMutate: async (page) => {
      await queryClient.cancelQueries({ queryKey: ["workspace_pages", page.org_id] });
      const previous = queryClient.getQueryData<WorkspacePage[]>(["workspace_pages", page.org_id]);
      const removing = pageAndDescendantIds(previous, page.id);
      queryClient.setQueryData<WorkspacePage[]>(["workspace_pages", page.org_id], (current) =>
        (current ?? []).filter((item) => !removing.has(item.id))
      );
      return { previous };
    },
    onError: (_error, page, context) => {
      queryClient.setQueryData(["workspace_pages", page.org_id], context?.previous);
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
      queryClient.invalidateQueries({ queryKey: ["workspace_blocks"] });
    },
  });
}

export function useCreateWorkspaceBlock(pageId: string | null) {
  const { org } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      type?: WorkspaceBlockType;
      content?: WorkspaceBlockContent;
      afterBlockId?: string | null;
    }) => {
      if (!org || !user || !pageId) throw new Error("No active page");
      const cached = queryClient.getQueryData<WorkspaceBlock[]>(["workspace_blocks", pageId]);
      const ordered = [...(cached ?? [])].sort((a, b) => a.position - b.position);
      const afterIndex = values.afterBlockId
        ? ordered.findIndex((block) => block.id === values.afterBlockId)
        : ordered.length - 1;
      const previous = afterIndex >= 0 ? ordered[afterIndex] : null;
      const next = afterIndex >= 0 ? ordered[afterIndex + 1] : ordered[0];
      const position = previous && next
        ? Math.floor((previous.position + next.position) / 2)
        : previous
          ? previous.position + BLOCK_GAP
          : next
            ? next.position - BLOCK_GAP
            : 0;

      const { data, error } = await supabase
        .from("workspace_blocks")
        .insert({
          org_id: org.id,
          page_id: pageId,
          type: values.type ?? "paragraph",
          content: (values.content ?? { text: "" }) as Json,
          position,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WorkspaceBlock;
    },
    onSuccess: (block) => {
      queryClient.setQueryData<WorkspaceBlock[]>(["workspace_blocks", block.page_id], (current) =>
        [...(current ?? []), block].sort((a, b) => a.position - b.position)
      );
    },
  });
}

export function useUpdateWorkspaceBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkspaceBlock> & { id: string }) => {
      const { data, error } = await supabase
        .from("workspace_blocks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as WorkspaceBlock;
    },
    onSuccess: (block) => {
      queryClient.setQueryData<WorkspaceBlock[]>(["workspace_blocks", block.page_id], (current) =>
        (current ?? []).map((item) => (item.id === block.id ? block : item)).sort((a, b) => a.position - b.position)
      );
    },
  });
}

export function useDeleteWorkspaceBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (block: WorkspaceBlock) => {
      const { error } = await supabase.from("workspace_blocks").delete().eq("id", block.id);
      if (error) throw error;
      return block;
    },
    onSuccess: (block) => {
      queryClient.setQueryData<WorkspaceBlock[]>(["workspace_blocks", block.page_id], (current) =>
        (current ?? []).filter((item) => item.id !== block.id)
      );
    },
  });
}

export function useReorderWorkspaceBlocks(pageId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blocks: WorkspaceBlock[]) => {
      if (!pageId) throw new Error("No active page");
      const reordered = blocks.map((block, index) => ({ ...block, position: index * BLOCK_GAP }));
      const results = await Promise.all(
        reordered.map((block) =>
          supabase
            .from("workspace_blocks")
            .update({ position: block.position })
            .eq("id", block.id)
            .select()
            .single()
        )
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      return reordered;
    },
    onMutate: async (blocks) => {
      if (!pageId) return;
      await queryClient.cancelQueries({ queryKey: ["workspace_blocks", pageId] });
      const previous = queryClient.getQueryData<WorkspaceBlock[]>(["workspace_blocks", pageId]);
      queryClient.setQueryData(["workspace_blocks", pageId], blocks);
      return { previous };
    },
    onError: (_error, _blocks, context) => {
      if (pageId && context?.previous) {
        queryClient.setQueryData(["workspace_blocks", pageId], context.previous);
      }
    },
    onSuccess: (blocks) => {
      if (pageId) queryClient.setQueryData(["workspace_blocks", pageId], blocks);
    },
  });
}
