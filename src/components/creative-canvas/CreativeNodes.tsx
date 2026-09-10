import { createContext, useContext, type ReactNode } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { CreativeFlowNode, CreativeNodeData } from "@/lib/creative-canvas/react-flow-adapter";
import type { CreativeNodeType } from "@/lib/creative-canvas/types";

const TYPE_LABELS: Record<CreativeNodeType, string> = {
  text: "Text block", image: "Image", reference: "Reference", brand_context: "Brand context",
  creative_direction: "Creative direction", palette: "Color palette", typography: "Typography",
  conversation: "AI conversation", decision: "Decision", export_frame: "Export frame", generation: "Generation",
};

const NodeActions = createContext<{ updateNodeData: (id: string, values: Partial<CreativeNodeData>) => void }>({ updateNodeData: () => undefined });

export function CreativeNodeActionsProvider({ children, updateNodeData }: { children: ReactNode; updateNodeData: (id: string, values: Partial<CreativeNodeData>) => void }) {
  return <NodeActions.Provider value={{ updateNodeData }}>{children}</NodeActions.Provider>;
}

function CreativeNodeCard({ id, data, selected }: NodeProps<CreativeFlowNode>) {
  const { updateNodeData } = useContext(NodeActions);
  const label = TYPE_LABELS[data.nodeType];
  return (
    <>
      <NodeResizer color="#CB2039" isVisible={selected} minWidth={190} minHeight={145} />
      <Handle type="target" position={Position.Left} className="creative-flow-handle" />
      <article className={`creative-shape creative-shape--${data.nodeType}`} style={{ borderColor: data.accent }}>
        <header className="creative-shape__header">
          <span className="creative-shape__kind">{label}</span>
          {data.status !== "draft" && <span className="creative-shape__status">{data.status.replace(/_/g, " ")}</span>}
        </header>
        {data.assetUrl && <img src={data.assetUrl} alt={data.title} className="creative-shape__image" draggable={false} />}
        {data.nodeType === "palette" && <div className="creative-shape__swatch" style={{ background: data.accent }}><button type="button" className="nodrag" aria-label={`Copy ${data.accent}`} onClick={() => void navigator.clipboard.writeText(data.accent)}>{data.accent}</button></div>}
        <input aria-label={`${label} title`} className="creative-shape__title nodrag nowheel" value={data.title} onChange={(event) => updateNodeData(id, { title: event.target.value })} />
        <textarea aria-label={`${label} content`} className="creative-shape__body nodrag nowheel" value={data.body} placeholder={data.nodeType === "reference" ? "Reference notes…" : "Add strategic context…"} onChange={(event) => updateNodeData(id, { body: event.target.value })} />
        {(data.nodeType === "reference" || data.nodeType === "image") && <label className="creative-shape__context nodrag"><input type="checkbox" checked={data.includeInContext} onChange={(event) => updateNodeData(id, { includeInContext: event.target.checked })} />Include in AI context</label>}
      </article>
      <Handle type="source" position={Position.Right} className="creative-flow-handle" />
    </>
  );
}

export const creativeNodeTypes: NodeTypes = {
  text: CreativeNodeCard,
  image: CreativeNodeCard,
  reference: CreativeNodeCard,
  brand_context: CreativeNodeCard,
  creative_direction: CreativeNodeCard,
  palette: CreativeNodeCard,
  typography: CreativeNodeCard,
  conversation: CreativeNodeCard,
  decision: CreativeNodeCard,
  generation: CreativeNodeCard,
  export_frame: CreativeNodeCard,
};
