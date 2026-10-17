import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2 } from "lucide-react";

function WorkspaceImageView({ node, selected }: NodeViewProps) {
  const storagePath = node.attrs.storagePath as string | null;
  const { data: signedUrl, isError } = useQuery({
    queryKey: ["workspace_asset_url", storagePath, null],
    queryFn: async () => {
      if (!storagePath) return null;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.storage.from("workspace-assets").createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 45,
    refetchInterval: storagePath ? 1000 * 60 * 45 : false,
  });
  const source = storagePath ? signedUrl : (node.attrs.src as string | undefined);
  const alt = (node.attrs.alt as string | undefined) || "Reference image";

  return (
    <NodeViewWrapper
      as="figure"
      data-drag-handle
      data-workspace-image-path={storagePath ?? undefined}
      className={`workspace-inline-image ${selected ? "workspace-inline-image--selected" : ""}`}
      contentEditable={false}
    >
      {source ? (
        <img src={source} alt={alt} draggable={false} />
      ) : (
        <div className="workspace-inline-image__loading" role="status">
          {isError ? <ImageOff size={20} /> : <Loader2 size={20} className="animate-spin" />}
          <span>{isError ? "Image unavailable" : "Loading image…"}</span>
        </div>
      )}
      <figcaption>{alt}</figcaption>
    </NodeViewWrapper>
  );
}

/** Keep the private storage path in document HTML; signed display links expire. */
export const WorkspaceImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      storagePath: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-workspace-image-path"),
        renderHTML: (attributes: { storagePath?: string | null }) =>
          attributes.storagePath ? { "data-workspace-image-path": attributes.storagePath } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceImageView);
  },
});
