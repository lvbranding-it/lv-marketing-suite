import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { toPng } from "html-to-image";
import { addEdge, Background, BackgroundVariant, Controls, getNodesBounds, getViewportForBounds, MiniMap, ReactFlow, type Connection, type ReactFlowInstance, type Viewport, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowDownToLine, ArrowLeft, ArrowUpToLine, Bot, Check, ChevronLeft, ChevronRight, CircleDollarSign, Cloud, CloudOff, Download, FileText, Focus, Grid3x3, Group, HelpCircle, Image as ImageIcon, Layers3, Loader2, Maximize2, Palette, Plus, Captions, ClipboardList, FileCheck, LayoutGrid, ListOrdered, MessageSquare, Save, ShieldAlert, Slash, Smartphone, Sparkles, TrendingUp, Type, Ungroup, Upload, UserRound, Video, WifiOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CreativeNodeActionsProvider, creativeNodeTypes } from "@/components/creative-canvas/CreativeNodes";
import SeriesDialog, { type SeriesCandidate } from "@/components/creative-canvas/SeriesDialog";
import CanvasHelpDialog from "@/components/creative-canvas/CanvasHelpDialog";
import ConnectionInspector from "@/components/creative-canvas/ConnectionInspector";
import CommandPalette from "@/components/creative-canvas/CommandPalette";
import CommandPanel from "@/components/creative-canvas/CommandPanel";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useBrandContext, useCreativeAssets, useCreativeCanvas, useCreativeGenerations, useCreateDecision, useCreativeProviderStatus, useCreativeUsage, useGenerateCreative, useSaveBrandContext, useSaveCreativeCanvas, useUploadCreativeAsset } from "@/hooks/useCreativeCanvas";
import { edgeAppearance, edgeKindOf, flowToScene, sceneToFlow, type CreativeFlowEdge, type CreativeFlowNode, type CreativeNodeData } from "@/lib/creative-canvas/react-flow-adapter";
import { createEmptyScene, makeIdempotencyKey, restoreScene, serializeScene, type CreativeSceneDocument } from "@/lib/creative-canvas/scene";
import { collectInheritedContext, sequencePosition, type CreativeEdgeKind } from "@/lib/creative-canvas/graph";
import { runPaced, runSeries, type SeriesPlan } from "@/lib/creative-canvas/series";
import { buildCommandRequest, parseSlash, type CommandSelectionItem } from "@/lib/creative-canvas/commands/registry";
import type { CommandDefinition, CommandValues } from "@/lib/creative-canvas/commands/types";
import { exportFileName, isArtworkNode, planExport } from "@/lib/creative-canvas/export-batch";
import type { BrandContext, CreativeDecision, CreativeNodeType, CreativeOperation, CreativeProvider } from "@/lib/creative-canvas/types";

const NODE_TOOLS: Array<{ type: CreativeNodeType; label: string; icon: typeof Type; title: string; body: string; accent?: string; size?: [number, number]; group?: "ugc" }> = [
  { type: "text", label: "Text", icon: Type, title: "Headline concept", body: "Write directly in this block." },
  { type: "reference", label: "Reference", icon: ImageIcon, title: "Visual reference", body: "Add why this reference matters." },
  { type: "brand_context", label: "Brand", icon: Layers3, title: "Brand context", body: "Open Brand Context in the right panel to define the project source of truth.", size: [360, 250] },
  { type: "creative_direction", label: "Direction", icon: Sparkles, title: "Creative Direction 01", body: "Strategic rationale\n\nVisual narrative\n\nKeywords\n\nInternal notes", size: [440, 330] },
  { type: "palette", label: "Palette", icon: Palette, title: "Primary red", body: "Brand accent", size: [260, 210] },
  { type: "typography", label: "Type", icon: FileText, title: "Fira Sans", body: "Role: Primary sans serif\nWeights: 400, 500, 600, 700\nUsage: Clear, confident communications" },
  { type: "conversation", label: "AI chat", icon: Bot, title: "AI conversation", body: "Preserve the instruction and the visible assistant response here." },
  { type: "decision", label: "Decision", icon: Check, title: "Decision", body: "Status, owner, rationale, and next revision." },
  { type: "export_frame", label: "Export", icon: Maximize2, title: "Presentation frame", body: "Arrange approved work inside this export area.", size: [900, 600] },

  // UGC production blocks. Each opens with the fields that block is for, so a
  // half-filled card still says what is missing rather than sitting blank.
  { type: "creator_profile", group: "ugc", label: "Creator", icon: UserRound, title: "Creator profile", size: [380, 460], body: [
    "Name:", "Market and language:", "Content style:", "Approved products:", "Availability:", "Rate:",
    "Contract status:", "Usage-rights period:", "Whitelisting permitted:", "Raw-footage rights:",
    "Exclusivity:", "Allowed platforms:",
  ].join("\n") },
  { type: "ugc_brief", group: "ugc", label: "Brief", icon: ClipboardList, title: "UGC brief", size: [420, 420], body: "Objective:\n\nAudience:\n\nProduct truth:\n\nMust say:\n\nMust not say:\n\nDeliverables:\n\nDue:" },
  { type: "hook_bank", group: "ugc", label: "Hooks", icon: Zap, title: "Hook bank", size: [380, 360], body: "One hook per line. Mark the ones that have been tested." },
  { type: "ugc_script", group: "ugc", label: "Script", icon: FileText, title: "Script", size: [420, 440], body: "HOOK (0–3s):\n\nBODY:\n\nPROOF:\n\nCTA:" },
  { type: "talking_points", group: "ugc", label: "Talking points", icon: MessageSquare, title: "Talking points", size: [380, 360], body: "Flexible points rather than a script. The creator says these in their own words." },
  { type: "shot_list", group: "ugc", label: "Shots", icon: ListOrdered, title: "Shot list", size: [400, 400], body: "1. Shot — framing — action — duration\n2.\n3." },
  { type: "storyboard", group: "ugc", label: "Storyboard", icon: LayoutGrid, title: "Storyboard", size: [420, 400], body: "Beat by beat: what is on screen, what is said, how long." },
  { type: "raw_footage", group: "ugc", label: "Footage", icon: Video, title: "Raw footage", size: [380, 300], body: "Where the footage lives, who shot it and when. Canvas stores the reference, not the video file." },
  { type: "transcript", group: "ugc", label: "Transcript", icon: Captions, title: "Transcript", size: [420, 420], body: "The creator's actual words, verbatim. Edits to this are cuts, never rewrites." },
  { type: "claim_disclosure", group: "ugc", label: "Claims", icon: ShieldAlert, title: "Claims & disclosure", size: [400, 380], body: "Claims made:\n\nEvidence for each:\n\nDisclosure required:\n\nReviewed by:" },
  { type: "platform_adaptation", group: "ugc", label: "Platforms", icon: Smartphone, title: "Platform adaptation", size: [380, 340], body: "Reels:\nTikTok:\nShorts:\nPaid:" },
  { type: "performance_result", group: "ugc", label: "Results", icon: TrendingUp, title: "Performance", size: [380, 320], body: "Placement:\nSpend:\nViews:\nHold rate:\nConversions:\nWhat it suggests:" },
  { type: "usage_rights", group: "ugc", label: "Rights", icon: FileCheck, title: "Usage rights", size: [380, 360], body: "Owner:\nGranted for:\nTerritory:\nPeriod:\nPaid media permitted:\nWhitelisting:\nExpires:" },
];

/**
 * Delivery sizes creative work is actually handed over in.
 *
 * `actual` keeps the artwork's own dimensions; every other entry renders to
 * exact pixels so a post or a hero never has to be resized by hand afterwards.
 * Artwork is fitted inside the frame rather than cropped to it — silently
 * trimming a client's composition is worse than a margin.
 */
const EXPORT_PRESETS: Array<{ value: string; label: string; group: string; size?: [number, number] }> = [
  { value: "actual", label: "Actual size", group: "Canvas" },
  { value: "ig-square", label: "Instagram post · 1080 × 1080", group: "Social", size: [1080, 1080] },
  { value: "ig-portrait", label: "Instagram portrait · 1080 × 1350", group: "Social", size: [1080, 1350] },
  { value: "story", label: "Story / Reel · 1080 × 1920", group: "Social", size: [1080, 1920] },
  { value: "link-card", label: "Facebook / LinkedIn · 1200 × 630", group: "Social", size: [1200, 630] },
  { value: "x-post", label: "X post · 1600 × 900", group: "Social", size: [1600, 900] },
  { value: "og", label: "Open Graph · 1200 × 630", group: "Web", size: [1200, 630] },
  { value: "hero", label: "Desktop hero · 1920 × 1080", group: "Web", size: [1920, 1080] },
  { value: "hero-2x", label: "Retina hero · 2560 × 1440", group: "Web", size: [2560, 1440] },
  { value: "email", label: "Email header · 1200 × 600", group: "Web", size: [1200, 600] },
  { value: "hd", label: "HD 1080p · 1920 × 1080", group: "Video", size: [1920, 1080] },
  { value: "uhd", label: "4K UHD · 3840 × 2160", group: "Video", size: [3840, 2160] },
  { value: "vertical", label: "Vertical video · 1080 × 1920", group: "Video", size: [1080, 1920] },
];
const PRESET_GROUPS = ["Canvas", "Social", "Web", "Video"] as const;

/** Decodes through a blob so a signed asset URL never taints the canvas. */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("The artwork could not be read for export.");
  return createImageBitmap(await response.blob());
}

/**
 * Draws one stored asset into a delivery frame.
 *
 * Shared by the single and batch paths so a post exported on its own is byte
 * identical to the same post exported as part of its series.
 */
async function renderArtwork(signedUrl: string, size?: [number, number]) {
  const bitmap = await loadBitmap(signedUrl);
  const [width, height] = size ?? [bitmap.width, bitmap.height];
  const surface = document.createElement("canvas");
  surface.width = width; surface.height = height;
  const context = surface.getContext("2d");
  if (!context) throw new Error("This browser cannot render the export.");
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  bitmap.close();
  return { dataUrl: surface.toDataURL("image/png"), width, height };
}

/** How each provider is named to a person, rather than by its API id. */
const PROVIDER_LABELS: Record<string, string> = { openai: "OpenAI", anthropic: "Claude", google: "Google" };

const AI_ACTIONS: Array<{ value: CreativeOperation; label: string }> = [
  { value: "campaign_concept", label: "Campaign concept" }, { value: "write_copy", label: "Write copy" }, { value: "rewrite", label: "Rewrite" }, { value: "shorten", label: "Shorten" }, { value: "expand", label: "Expand" }, { value: "adapt_en_es", label: "Adapt EN → ES" }, { value: "adapt_es_en", label: "Adapt ES → EN" }, { value: "generate_image", label: "Generate image" }, { value: "edit_image", label: "Edit image" }, { value: "variations", label: "Generate variations" }, { value: "visual_critique", label: "Analyze direction" }, { value: "compare_concepts", label: "Compare concepts" }, { value: "recommend_direction", label: "Recommend direction" }, { value: "creative_rationale", label: "Creative rationale" }, { value: "production_prompt", label: "Production prompt" },
];

const BRAND_FIELDS: Array<{ key: keyof BrandContext; label: string; placeholder: string }> = [
  { key: "brandName", label: "Brand or client", placeholder: "Name" }, { key: "businessDescription", label: "Business description", placeholder: "What the business does and why it matters" }, { key: "objective", label: "Project objective", placeholder: "The change this work must create" }, { key: "audiences", label: "Target audiences", placeholder: "Primary and secondary audiences" }, { key: "positioning", label: "Positioning", placeholder: "Distinct position in the market" }, { key: "valueProposition", label: "Value proposition", placeholder: "Core value promised" }, { key: "personality", label: "Brand personality", placeholder: "Traits and behaviors" }, { key: "voiceTone", label: "Voice and tone", placeholder: "How the brand should sound" }, { key: "requiredMessages", label: "Required messages", placeholder: "Messages every direction must carry" }, { key: "visualPrinciples", label: "Visual principles", placeholder: "Composition, mood, lighting, style" }, { key: "approvedColors", label: "Approved colors", placeholder: "Named colors and HEX values" }, { key: "typography", label: "Typography guidance", placeholder: "Typefaces, roles, weights" }, { key: "requiredElements", label: "Required visual elements", placeholder: "Products, logos, settings, people" }, { key: "prohibitedElements", label: "Prohibited elements", placeholder: "Never include" }, { key: "avoidWords", label: "Words or phrases to avoid", placeholder: "Language exclusions" }, { key: "competitors", label: "Competitors", placeholder: "Competitive set" }, { key: "languages", label: "Languages", placeholder: "English, Spanish" }, { key: "market", label: "Market or location", placeholder: "Houston, US Hispanic market, etc." }, { key: "compliance", label: "Legal or compliance notes", placeholder: "Mandatory qualifications and disclaimers" }, { key: "additionalContext", label: "Additional context", placeholder: "Anything else the team should know" },
];

type FlowSnapshot = { nodes: CreativeFlowNode[]; edges: CreativeFlowEdge[] };
const cloneSnapshot = (nodes: CreativeFlowNode[], edges: CreativeFlowEdge[]): FlowSnapshot => ({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
// `savedAt` is stamped with the current time every time a scene is built, so a
// straight comparison of two serializations never matches. The fingerprint is
// everything that actually describes the document, minus that timestamp.
const sceneFingerprint = (scene: CreativeSceneDocument): string => {
  const { savedAt: _savedAt, ...rest } = scene;
  return JSON.stringify(rest);
};
const newId = (prefix = "node") => `${prefix}-${crypto.randomUUID()}`;
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

function makeNode(type: CreativeNodeType, point: { x: number; y: number }, options: Partial<CreativeNodeData> & { width?: number; height?: number } = {}): CreativeFlowNode {
  const tool = NODE_TOOLS.find((item) => item.type === type); const width = options.width ?? tool?.size?.[0] ?? 320; const height = options.height ?? tool?.size?.[1] ?? 220;
  return { id: newId(), type, position: { x: point.x - width / 2, y: point.y - height / 2 }, selected: true, style: { width, height }, data: { nodeType: type, title: options.title ?? tool?.title ?? "Untitled", body: options.body ?? tool?.body ?? "", accent: options.accent ?? tool?.accent ?? "#CB2039", assetId: options.assetId ?? "", assetUrl: options.assetUrl ?? "", includeInContext: options.includeInContext ?? true, status: options.status ?? "draft" } };
}

function demoScene(): CreativeSceneDocument {
  const data: Array<[CreativeNodeType, number, number, number, number, string, string, string]> = [
    ["brand_context",-610,-270,360,280,"Soluna Market","Objective\nBuild awareness for a seasonal market launch.\n\nAudience\nBilingual Houston families and independent makers.\n\nVoice\nWarm, confident, specific.","#CB2039"],
    ["creative_direction",-180,-300,430,320,"01 · Made Here, Shared Here","Turn local provenance into an invitation to belong.\n\nWarm documentary moments, tactile products, natural light.\n\nLOCAL · GENEROUS · HUMAN","#CB2039"],
    ["creative_direction",320,-300,430,320,"02 · Two Languages, One Table","Treat bilingual culture as lived connection, not translation.\n\nGraphic table compositions with paired messages.\n\nSOCIAL · BOLD · WELCOMING","#CB2039"],
    ["palette",-600,90,255,205,"Soluna Terracotta","Primary warmth","#C75B3A"], ["palette",-300,90,255,205,"Market Marigold","Optimistic accent","#F2B134"],
    ["text",10,90,360,235,"Made here. Shared here.","Hecho aquí. Compartido aquí.\n\nA bilingual campaign idea built from one shared intention.","#CB2039"],
    ["reference",430,90,320,235,"Shared-table reference","Use for human energy and composition. Avoid staged stock-photo cues.","#CB2039"],
  ];
  return serializeScene({ schemaVersion: 1, edges: [], viewport: { x: 505, y: 375, zoom: .72 }, nodes: data.map(([type,x,y,width,height,title,body,accent]) => ({ id: newId(), type, position: { x, y }, size: { width, height }, title, body, accent, includeInContext: true, status: "draft" })) });
}

export default function CreativeCanvasWorkspace() {
  const { canvasId } = useParams(); const { language } = useLanguage(); const { data: canvas, isLoading, isError } = useCreativeCanvas(canvasId);
  const { data: brandRecord } = useBrandContext(canvas?.project_id); const { data: assets = [] } = useCreativeAssets(canvas?.project_id); const { data: generations = [] } = useCreativeGenerations(canvasId); const { data: usage } = useCreativeUsage(canvas?.project_id); const { data: providerStatusData } = useCreativeProviderStatus();
  // Only what the gateway reports as actually enabled. Listing providers that
  // are switched off invited people to pick one that cannot run, and named
  // vendors the workspace is not configured to use.
  const enabledProviders = (providerStatusData ?? []).filter((item) => item.enabled);
  const createDecision = useCreateDecision(); const saveCanvas = useSaveCreativeCanvas(canvas); const saveBrand = useSaveBrandContext(canvas?.project_id, canvas?.org_id); const uploadAsset = useUploadCreativeAsset(canvas?.project_id, canvas?.org_id); const generate = useGenerateCreative();
  const [nodes, setNodes, onNodesChange] = useNodesState<CreativeFlowNode>([]); const [edges, setEdges, onEdgesChange] = useEdgesState<CreativeFlowEdge>([]); const [flow, setFlow] = useState<ReactFlowInstance<CreativeFlowNode, CreativeFlowEdge> | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 }); const nodesRef = useRef(nodes); const edgesRef = useRef(edges); nodesRef.current = nodes; edgesRef.current = edges;
  const hydrated = useRef(false); const lastSavedScene = useRef<string>(""); const loadedCanvasId = useRef<string | null>(null); const history = useRef<{ past: FlowSnapshot[]; future: FlowSnapshot[] }>({ past: [], future: [] }); const clipboard = useRef<CreativeFlowNode[]>([]);
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true); const [pendingScene, setPendingScene] = useState<CreativeSceneDocument | null>(null); const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "error" | "offline">("saved"); const [exporting, setExporting] = useState<"png" | "pdf" | null>(null); const [exportPreset, setExportPreset] = useState("actual"); const [seriesOpen, setSeriesOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false); const [ugcOpen, setUgcOpen] = useState(false); const [paletteOpen, setPaletteOpen] = useState(false); const [paletteQuery, setPaletteQuery] = useState(""); const [activeCommand, setActiveCommand] = useState<CommandDefinition | null>(null); const [commandProgress, setCommandProgress] = useState<{ done: number; total: number } | null>(null); const [seriesProgress, setSeriesProgress] = useState<{ done: number; total: number } | null>(null); const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [instruction, setInstruction] = useState(""); const [operation, setOperation] = useState<CreativeOperation>("campaign_concept"); const [provider, setProvider] = useState<CreativeProvider>("auto"); const [brandDraft, setBrandDraft] = useState<BrandContext>({}); const fileInput = useRef<HTMLInputElement>(null);
  const selection = useMemo(() => nodes.filter((node) => node.selected), [nodes]); const edgeSelection = useMemo(() => edges.filter((edge) => edge.selected), [edges]); const assetUrls = useMemo(() => new Map(assets.filter((asset) => asset.signedUrl).map((asset) => [asset.id, asset.signedUrl!])), [assets]);

  useEffect(() => { if (brandRecord?.content) setBrandDraft(brandRecord.content); else if (canvas?.projects) setBrandDraft({ brandName: canvas.projects.client_name ?? "", objective: canvas.projects.description ?? "" }); }, [brandRecord, canvas?.projects]);
  useEffect(() => { const online = () => setSaveState((state) => state === "offline" ? "unsaved" : state); const offline = () => setSaveState("offline"); window.addEventListener("online", online); window.addEventListener("offline", offline); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); }; }, []);
  useEffect(() => {
    if (!canvas || loadedCanvasId.current === canvas.id) return; loadedCanvasId.current = canvas.id; hydrated.current = false; history.current = { past: [], future: [] };
    let scene = restoreScene(canvas.scene_document) ?? createEmptyScene(); if (!scene.nodes.length && canvas.projects.name === "LV Creative Canvas™ Demo: Bilingual Brand Campaign") scene = demoScene();
    const adapted = sceneToFlow(scene, assetUrls); setNodes(adapted.nodes); setEdges(adapted.edges); viewportRef.current = adapted.viewport; lastSavedScene.current = sceneFingerprint(serializeScene(scene));
    requestAnimationFrame(() => { void flow?.setViewport(adapted.viewport); hydrated.current = true; if (scene.nodes.length && !restoreScene(canvas.scene_document)) setPendingScene(scene); });
  }, [assetUrls, canvas, flow, setEdges, setNodes]);
  useEffect(() => { if (!assetUrls.size) return; setNodes((current) => current.map((node) => node.data.assetId && assetUrls.has(node.data.assetId) ? { ...node, data: { ...node.data, assetUrl: assetUrls.get(node.data.assetId)! } } : node)); }, [assetUrls, setNodes]);
  // React Flow emits change events for selection and measurement, not just real
  // edits, so this effect runs when nothing about the saved document differs.
  // Comparing against the last persisted serialization keeps idle clicking from
  // writing the whole scene back and inflating the optimistic-version counter.
  useEffect(() => {
    if (!hydrated.current || !canvas) return;
    const next = flowToScene(nodes, edges, viewportRef.current);
    if (sceneFingerprint(serializeScene(next)) === lastSavedScene.current) return;
    setPendingScene(next);
    setSaveState(navigator.onLine ? "unsaved" : "offline");
  }, [canvas, edges, nodes]);
  useEffect(() => { if (!pendingScene || !canvas || !navigator.onLine) return; const sceneToSave = pendingScene; const timer = window.setTimeout(async () => { setSaveState("saving"); try { const encoded = serializeScene(sceneToSave); await saveCanvas.mutateAsync(encoded as unknown as Record<string, unknown>); lastSavedScene.current = sceneFingerprint(encoded); setPendingScene((current) => current === sceneToSave ? null : current); setSaveState("saved"); } catch (error) { setSaveState("error"); toast({ title: "Canvas was not saved", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } }, 1200); return () => window.clearTimeout(timer); }, [canvas, pendingScene, saveCanvas.mutateAsync]);

  const recordHistory = useCallback(() => { history.current.past.push(cloneSnapshot(nodesRef.current, edgesRef.current)); if (history.current.past.length > 80) history.current.past.shift(); history.current.future = []; }, []);
  const restoreSnapshot = useCallback((snapshot: FlowSnapshot) => { setNodes(snapshot.nodes); setEdges(snapshot.edges); }, [setEdges, setNodes]);
  const undo = useCallback(() => { const previous = history.current.past.pop(); if (!previous) return; history.current.future.push(cloneSnapshot(nodesRef.current, edgesRef.current)); restoreSnapshot(previous); }, [restoreSnapshot]);
  const redo = useCallback(() => { const next = history.current.future.pop(); if (!next) return; history.current.past.push(cloneSnapshot(nodesRef.current, edgesRef.current)); restoreSnapshot(next); }, [restoreSnapshot]);
  const updateNodeData = useCallback((id: string, values: Partial<CreativeNodeData>) => { recordHistory(); setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...values } } : node)); }, [recordHistory, setNodes]);
  const canvasCenter = useCallback(() => flow?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 0, y: 0 }, [flow]);
  const addNode = useCallback((type: CreativeNodeType, options: Partial<CreativeNodeData> & { width?: number; height?: number } = {}, point = canvasCenter()) => { recordHistory(); const node = makeNode(type, point, options); setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node]); return node.id; }, [canvasCenter, recordHistory, setNodes]);
  const connect = useCallback((connection: Connection) => { recordHistory(); setEdges((current) => addEdge({ ...connection, id: newId("edge"), type: "smoothstep", data: { kind: "association" }, ...edgeAppearance("association") }, current)); }, [recordHistory, setEdges]);
  /** Changes what an arrow claims, and redresses it to match. */
  const setEdgeKind = useCallback((id: string, kind: CreativeEdgeKind) => { recordHistory(); setEdges((current) => current.map((edge) => edge.id === id ? { ...edge, data: { ...edge.data, kind }, ...edgeAppearance(kind) } : edge)); }, [recordHistory, setEdges]);
  const deleteSelection = useCallback(() => { if (!selection.length && !edgesRef.current.some((edge) => edge.selected)) return; recordHistory(); const ids = new Set(selection.map((node) => node.id)); setNodes((current) => current.filter((node) => !ids.has(node.id) && (!node.parentId || !ids.has(node.parentId)))); setEdges((current) => current.filter((edge) => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target))); }, [recordHistory, selection, setEdges, setNodes]);
  const copySelection = useCallback(() => { clipboard.current = structuredClone(selection); }, [selection]);
  const pasteSelection = useCallback(() => { if (!clipboard.current.length) return; recordHistory(); const idMap = new Map(clipboard.current.map((node) => [node.id, newId()])); const pasted = clipboard.current.map((node) => ({ ...node, id: idMap.get(node.id)!, parentId: node.parentId ? idMap.get(node.parentId) : undefined, position: { x: node.position.x + 36, y: node.position.y + 36 }, selected: true })); setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pasted]); clipboard.current = structuredClone(pasted); }, [recordHistory, setNodes]);
  const duplicateSelection = useCallback(() => { copySelection(); pasteSelection(); }, [copySelection, pasteSelection]);
  const changeOrder = useCallback((direction: 1 | -1) => { if (!selection.length) return; recordHistory(); setNodes((current) => current.map((node) => node.selected ? { ...node, zIndex: (node.zIndex ?? 0) + direction } : node)); }, [recordHistory, selection.length, setNodes]);
  const groupSelection = useCallback(() => { const chosen = selection.filter((node) => !node.parentId); if (chosen.length < 2) return; recordHistory(); const bounds = getNodesBounds(chosen); const groupId = newId("frame"); const padding = 42; const frame = makeNode("export_frame", { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, { title: "Creative direction frame", body: "Grouped workspace objects", width: bounds.width + padding * 2, height: bounds.height + padding * 2 }); frame.id = groupId; frame.position = { x: bounds.x - padding, y: bounds.y - padding }; frame.selected = true; frame.zIndex = -1; setNodes((current) => [frame, ...current.map((node) => chosen.some((item) => item.id === node.id) ? { ...node, parentId: groupId, extent: "parent" as const, position: { x: node.position.x - frame.position.x, y: node.position.y - frame.position.y }, selected: false, zIndex: 1 } : { ...node, selected: false })]); }, [recordHistory, selection, setNodes]);
  const ungroupSelection = useCallback(() => { const groups = selection.filter((node) => nodes.some((child) => child.parentId === node.id)); if (!groups.length) return; recordHistory(); const byId = new Map(groups.map((group) => [group.id, group])); const ids = new Set(byId.keys()); setNodes((current) => current.filter((node) => !ids.has(node.id)).map((node) => node.parentId && byId.has(node.parentId) ? { ...node, parentId: undefined, extent: undefined, position: { x: node.position.x + byId.get(node.parentId)!.position.x, y: node.position.y + byId.get(node.parentId)!.position.y }, selected: true } : node)); }, [nodes, recordHistory, selection, setNodes]);

  useEffect(() => { const keydown = (event: KeyboardEvent) => { const element = event.target as HTMLElement; if (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable) return; const command = event.metaKey || event.ctrlKey; if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); } else if (command && event.key.toLowerCase() === "c") { event.preventDefault(); copySelection(); } else if (command && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelection(); } else if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); } else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); } }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, [copySelection, deleteSelection, duplicateSelection, pasteSelection, redo, undo]);

  const upload = async (files: FileList | File[], point?: { x: number; y: number }) => { let offset = 0; for (const file of Array.from(files)) { try { const asset = await uploadAsset.mutateAsync({ file, sourceType: "reference" }); addNode("reference", { title: asset.original_filename, body: "Reference notes", assetId: asset.id, assetUrl: asset.signedUrl ?? "", width: 360, height: 360 }, point ? { x: point.x + offset, y: point.y + offset } : undefined); offset += 36; } catch (error) { toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } } };
  // Connections carry meaning: an arrow from a direction to a product means the
  // direction governs it, so selecting the product brings the direction along.
  // React Flow keeps the kind inside `data`, the graph helpers take it flat. One
  // conversion in one place: reading `edge.kind` off a flow edge silently yields
  // undefined, which reads as "informs" and quietly undoes what a Then arrow is
  // for.
  const graphEdges = useMemo(
    () => edges.map((edge) => ({ source: edge.source, target: edge.target, kind: edgeKindOf(edge) })),
    [edges],
  );
  const inherited = useMemo(
    () => collectInheritedContext(graphEdges, selection.map((node) => node.id), {
      isExcluded: (id) => nodes.find((node) => node.id === id)?.data.includeInContext === false,
    }),
    [graphEdges, nodes, selection],
  );
  const contextNode = (node: CreativeFlowNode, role: "selected" | "inherited", depth?: number, into?: string) => {
    // A card in a running order tells the model where it falls and what precedes
    // it, so the second slide of a carousel can follow the first instead of
    // restating it.
    const position = sequencePosition(graphEdges, node.id);
    const previous = position?.previousId ? nodes.find((item) => item.id === position.previousId) : undefined;
    return {
      id: node.id, type: node.data.nodeType, title: node.data.title, text: node.data.body,
      assetId: node.data.assetId || undefined, includeInAiContext: node.data.includeInContext,
      metadata: { status: node.data.status }, role, depth, parentDirectionId: into,
      sequence: position ? { step: position.step, total: position.total, follows: previous?.data.title || undefined } : undefined,
    };
  };
  const selectedContext = [
    ...selection.map((node) => contextNode(node, "selected")),
    ...inherited.flatMap((entry) => {
      const node = nodes.find((item) => item.id === entry.id);
      return node ? [contextNode(node, "inherited", entry.depth, entry.into)] : [];
    }),
  ];
  const selectedAsset = selection.length === 1 && selection[0].data.assetId ? assets.find((asset) => asset.id === selection[0].data.assetId) : undefined;
  const applyDecision = async (decision: CreativeDecision) => { if (!canvas || selection.length !== 1) return; const node = selection[0]; try { await createDecision.mutateAsync({ projectId: canvas.project_id, canvasId: canvas.id, orgId: canvas.org_id, targetType: node.data.assetId ? "asset" : "shape", targetId: node.data.assetId || node.id, decision }); updateNodeData(node.id, { status: decision }); toast({ description: `Marked ${decision.replace(/_/g, " ")}.` }); } catch (error) { toast({ title: "Decision was not recorded", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } };
  const runGeneration = async () => {
    if (!canvas || !instruction.trim()) return;
    if (imageBlocker) { toast({ ...imageBlocker, variant: "destructive" }); return; }
    const point = canvasCenter(); const originalInstruction = instruction.trim(); const placeholderId = addNode("generation", { title: AI_ACTIONS.find((item) => item.value === operation)?.label ?? "AI generation", body: `Provider: ${provider}\n\n${originalInstruction}`, status: "processing", width: 360, height: 240 }, point); try { const result = await generate.mutateAsync({ projectId: canvas.project_id, canvasId: canvas.id, orgId: canvas.org_id, operation, instruction: originalInstruction, provider, idempotencyKey: makeIdempotencyKey(canvas.id, operation), selectedNodes: selectedContext, brandContext: brandDraft, referenceAssetIds, language, placement: point }); setNodes((current) => current.filter((node) => node.id !== placeholderId)); if (result.asset?.signedUrl) addNode("image", { title: "Generated image", body: originalInstruction, assetId: result.asset.id, assetUrl: result.asset.signedUrl, status: "generated", width: 480, height: 420 }, point); else addNode("conversation", { title: AI_ACTIONS.find((item) => item.value === operation)?.label ?? "AI response", body: `Instruction\n${originalInstruction}\n\nResponse\n${result.generation.output_text ?? "Generation completed."}`, status: "generated", width: 420, height: 320 }, point); setInstruction(""); if (result.budget?.warning) toast({ title: "Canvas AI budget warning", description: `$${result.budget.monthTotalUsd.toFixed(2)} estimated this month of a $${result.budget.softLimitUsd.toFixed(2)} soft limit.` }); } catch (error) { updateNodeData(placeholderId, { status: "failed", body: `${originalInstruction}\n\n${error instanceof Error ? error.message : "Generation failed"}` }); toast({ title: "Generation failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } };
  /**
   * What the export buttons would produce right now.
   *
   * Computed from the selection rather than discovered on click, so the buttons
   * can say "ZIP" before someone commits to it instead of surprising them with
   * an archive when they expected one image.
   */
  const exportCandidates = useMemo(() => selection.map((node) => ({
    id: node.id,
    nodeType: node.data.nodeType,
    title: node.data.title,
    assetId: node.data.assetId || undefined,
    x: node.position.x,
    y: node.position.y,
    height: Number(node.measured?.height ?? node.height ?? node.style?.height ?? 0) || undefined,
  })), [selection]);
  const exportPlan = useMemo(() => planExport(exportCandidates, graphEdges), [exportCandidates, graphEdges]);
  const batchCount = exportPlan.mode === "batch" && exportPlan.items.every((item) => assets.some((asset) => asset.id === item.assetId && asset.signedUrl))
    ? exportPlan.items.length
    : 0;

  /**
   * The pictures an image request would actually carry, worked out before the
   * button is pressed.
   *
   * This used to be computed inside the run, so a request could go out with no
   * pictures at all and come back as an invented image that merely matched the
   * words. The count is now on the bar, and a selection whose artwork is
   * entirely muted is refused rather than billed.
   */
  const isImageOperation = ["generate_image", "edit_image", "variations"].includes(operation);
  const artworkIn = useCallback((list: CreativeFlowNode[]) => list.filter((node) => isArtworkNode(node.data.nodeType) && Boolean(node.data.assetId)), []);
  const referenceAssetIds = useMemo(() => {
    const usable = (list: CreativeFlowNode[]) => artworkIn(list).filter((node) => node.data.includeInContext !== false).map((node) => node.data.assetId);
    // What was selected leads; inherited artwork fills the remaining slots. This
    // is the order the model receives them in, so the first is the one an edit
    // treats as its base.
    return [...new Set([
      ...usable(selection),
      ...usable(inherited.flatMap((entry) => nodes.filter((node) => node.id === entry.id))),
    ])].slice(0, 4);
  }, [artworkIn, inherited, nodes, selection]);
  const mutedArtwork = useMemo(
    () => artworkIn(selection).filter((node) => node.data.includeInContext === false).length,
    [artworkIn, selection],
  );
  /**
   * Why this image request cannot go out, in words, or null if it can.
   *
   * Editing needs something to edit. The server already refuses a request with
   * no picture attached, but by then it is a 400 in a console rather than an
   * answer, so the same rule is stated here where it can name the fix. A plain
   * `generate_image` with nothing selected is left alone — that is text to
   * image, which is a legitimate thing to ask for.
   */
  const imageBlocker = useMemo(() => {
    if (!isImageOperation || referenceAssetIds.length) return null;
    if (mutedArtwork > 0) return {
      title: "Those pictures are not being sent",
      description: `${mutedArtwork === 1 ? "The selected picture has" : `All ${mutedArtwork} selected pictures have`} “Include in AI context” unticked, so the model would not see ${mutedArtwork === 1 ? "it" : "them"}. Tick the box on the card${mutedArtwork === 1 ? "" : "s"} and try again.`,
    };
    if (operation === "edit_image") return {
      title: "Nothing to edit",
      description: "Select the picture you want to edit first. Edit image works on artwork already on the canvas — click the card, or ⌘-click to add a second picture to work from.",
    };
    return null;
  }, [isImageOperation, mutedArtwork, operation, referenceAssetIds.length]);

  /** The objects on the canvas a series can be built from. */
  const seriesCandidates: SeriesCandidate[] = selection.map((node) => ({
    id: node.id,
    label: node.data.title || node.data.nodeType.replace(/_/g, " "),
    nodeType: node.data.nodeType,
    text: node.data.body || node.data.title,
    // Same rule as a single generation: a picture excluded from AI context is
    // not handed to the provider as a reference either.
    assetId: node.data.includeInContext === false ? undefined : (node.data.assetId || undefined),
  }));

  /**
   * Runs a matrix, placing each result where its cell sits in the grid.
   *
   * Cells are generated one at a time against the ordinary endpoint, so a series
   * carries the same budget, rate limit, lineage and retry behaviour a single
   * generation does. A cell that fails leaves a failed object in its slot rather
   * than collapsing the grid, because the rest of the set is already paid for.
   */
  const runSeriesGeneration = async (plan: SeriesPlan) => {
    if (!canvas) return;
    const origin = canvasCenter();
    const size = plan.aspect === "square" ? [420, 420] : plan.aspect === "portrait" ? [400, 520] : [520, 360];
    const gap = 48;
    setSeriesProgress({ done: 0, total: plan.cells.length });
    let done = 0;
    await runSeries(plan.cells, async (cell) => {
      const point = {
        x: origin.x + cell.column * (size[0] + gap) - ((plan.columns - 1) * (size[0] + gap)) / 2,
        y: origin.y + cell.row * (size[1] + gap) - ((plan.rows - 1) * (size[1] + gap)) / 2,
      };
      try {
        const result = await generate.mutateAsync({
          projectId: canvas.project_id, canvasId: canvas.id, orgId: canvas.org_id,
          operation: "generate_image", instruction: cell.instruction, provider,
          idempotencyKey: `${plan.id}-${cell.column}-${cell.row}`,
          selectedNodes: [], brandContext: brandDraft,
          referenceAssetIds: cell.referenceAssetIds, language, placement: point,
          aspect: plan.aspect,
          series: { id: plan.id, label: cell.label, index: cell.column * plan.rows + cell.row, total: plan.cells.length },
        });
        if (result.asset?.signedUrl) {
          addNode("image", { title: cell.label, body: cell.instruction, assetId: result.asset.id, assetUrl: result.asset.signedUrl, status: "generated", width: size[0], height: size[1] }, point);
        }
      } catch (error) {
        addNode("generation", { title: cell.label, body: `${cell.instruction}\n\n${error instanceof Error ? error.message : "Generation failed"}`, status: "failed", width: size[0], height: size[1] }, point);
        throw error;
      } finally {
        done += 1;
        setSeriesProgress({ done, total: plan.cells.length });
      }
    }, { concurrency: 2 });
    const failures = plan.cells.length - nodesRef.current.filter((node) => node.data.status === "generated").length;
    setSeriesProgress(null);
    setSeriesOpen(false);
    toast({ description: `Series finished. ${plan.cells.length} post${plan.cells.length === 1 ? "" : "s"} requested${failures > 0 ? "; check the grid for any that failed." : "."}` });
  };

  /**
   * Exports the selection at the chosen delivery size.
   *
   * Three shapes, decided by `planExport`: one piece on its own, several pieces
   * as several files, or an arrangement flattened into one image. The middle
   * case is what a generated series needs — nine posts are nine deliverables,
   * and a contact sheet of them cannot be posted.
   */
  /** What the panel and the registry need to know about the current selection. */
  const commandSelection: CommandSelectionItem[] = selection.map((node) => ({
    id: node.id,
    nodeType: node.data.nodeType,
    title: node.data.title,
    text: node.data.body,
    assetId: node.data.assetId || undefined,
    includeInContext: node.data.includeInContext !== false,
  }));
  const commandContext = {
    selectionTitles: selection.map((node) => node.data.title),
    selectionText: selection.map((node) => node.data.body),
    brandName: brandDraft?.brandName || canvas?.projects.client_name || undefined,
    language,
  };

  /** Wraps finished work in an export frame, the way grouping does by hand. */
  const frameNodes = useCallback((ids: string[], title: string) => {
    if (ids.length < 2) return;
    setNodes((current) => {
      const children = current.filter((node) => ids.includes(node.id) && !node.parentId);
      if (children.length < 2) return current;
      const bounds = getNodesBounds(children);
      const padding = 48;
      const frame = makeNode("export_frame", { x: 0, y: 0 }, { title, body: "", width: bounds.width + padding * 2, height: bounds.height + padding * 2 });
      frame.id = newId("frame");
      frame.position = { x: bounds.x - padding, y: bounds.y - padding };
      frame.zIndex = -1;
      frame.selected = false;
      return [frame, ...current.map((node) => ids.includes(node.id) && !node.parentId
        ? { ...node, parentId: frame.id, extent: "parent" as const, position: { x: node.position.x - frame.position.x, y: node.position.y - frame.position.y }, selected: false, zIndex: 1 }
        : node)];
    });
  }, [setNodes]);

  /**
   * Runs a command.
   *
   * Results are new objects placed clear of their sources and joined to them by
   * an informing arrow, so a piece of work always shows what it came from. The
   * source is never altered — an outfit transfer leaves the original photograph
   * exactly where it was.
   */
  const runCommand = async (values: CommandValues, chosenProvider: CreativeProvider, permissionConfirmed: boolean) => {
    const command = activeCommand;
    if (!canvas || !command) return;

    let request;
    try {
      request = buildCommandRequest(command, values, commandSelection, commandContext, { permissionConfirmed });
    } catch (error) {
      toast({ title: "Cannot run yet", description: error instanceof Error ? error.message : "Check the panel.", variant: "destructive" });
      return;
    }

    const sourceIds = selection.map((node) => node.id);
    const sourceBounds = selection.length ? getNodesBounds(selection) : null;
    const aspect = request.aspect ?? "square";
    const size = aspect === "portrait" ? [400, 520] : aspect === "landscape" ? [520, 360] : [440, 440];
    const gap = 44;
    const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(request.runs))));
    const origin = sourceBounds
      ? { x: sourceBounds.x + sourceBounds.width + gap + size[0] / 2, y: sourceBounds.y + size[1] / 2 }
      : canvasCenter();
    const placeAt = (index: number) => ({
      x: origin.x + (index % columns) * (size[0] + gap),
      y: origin.y + Math.floor(index / columns) * (size[1] + gap),
    });

    const runId: string = crypto.randomUUID();
    setCommandProgress({ done: 0, total: request.runs });
    let done = 0;
    const created: string[] = [];

    const results = await runPaced(Array.from({ length: request.runs }, (_, index) => index), async (index) => {
      const point = placeAt(index);
      try {
        const result = await generate.mutateAsync({
          projectId: canvas.project_id, canvasId: canvas.id, orgId: canvas.org_id,
          operation: request.operation, instruction: request.instruction, provider: chosenProvider,
          idempotencyKey: `${runId}-${index}`,
          selectedNodes: selectedContext, brandContext: brandDraft,
          referenceAssetIds: request.referenceAssetIds, language, placement: point,
          aspect: request.aspect,
          command: { commandId: request.audit.commandId, trigger: request.audit.trigger, values: request.audit.values as Record<string, unknown> },
        });
        const label = request.runs > 1 ? `${command.name} ${index + 1}` : command.name;
        const id = result.asset?.signedUrl
          ? addNode("image", { title: label, body: request.instruction, assetId: result.asset.id, assetUrl: result.asset.signedUrl, status: "generated", width: size[0], height: size[1] }, point)
          : addNode("conversation", { title: label, body: `${request.instruction}\n\n${result.generation.output_text ?? "Completed."}`, status: "generated", width: 440, height: 360 }, point);
        created.push(id);
        // Visible lineage: every source informs what came out of it.
        setEdges((current) => [...current, ...sourceIds.map((source) => ({
          id: newId("edge"), source, target: id, type: "smoothstep",
          data: { kind: "association" as const }, ...edgeAppearance("association"),
        }))]);
        return id;
      } finally {
        done += 1;
        setCommandProgress({ done, total: request.runs });
      }
    }, { concurrency: 2, minSpacingMs: request.runs > 1 ? 6_500 : 0 });

    setCommandProgress(null);
    const failures = results.filter((entry) => entry.error).length;
    if (created.length && command.placement === "frame") frameNodes(created, `${command.name} · ${new Date().toLocaleDateString()}`);
    setActiveCommand(null);

    if (!created.length) {
      const first = results.find((entry) => entry.error)?.error;
      toast({ title: `${command.name} failed`, description: first instanceof Error ? first.message : "Nothing was produced.", variant: "destructive" });
      return;
    }
    toast({ description: `${command.name} produced ${created.length} result${created.length === 1 ? "" : "s"}${failures ? `; ${failures} failed.` : "."}` });
  };

  const exportSelection = async (format: "png" | "pdf") => {
    if (!selection.length) { toast({ description: "Select one or more objects to export." }); return; }
    const preset = EXPORT_PRESETS.find((item) => item.value === exportPreset);
    const sizeSuffix = preset?.size ? ` ${preset.size[0]}x${preset.size[1]}` : "";
    const baseName = canvas?.projects.name ?? "creative-direction";
    setExporting(format);

    const deliverImage = (dataUrl: string, width: number, height: number) => {
      const name = `${baseName}${preset?.size ? ` ${width}x${height}` : ""}`;
      if (format === "png") { void fetch(dataUrl).then((response) => response.blob()).then((blob) => downloadBlob(blob, `${name}.png`)); return; }
      const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "px", format: [width, height] });
      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save(`${name}.pdf`);
    };

    try {
      const plan = planExport(exportCandidates, graphEdges);

      // Everything planned must resolve to stored artwork before anything is
      // rendered; a half-finished batch is worse than composing the view.
      const sources = plan.items.map((item) => ({ item, url: assets.find((asset) => asset.id === item.assetId)?.signedUrl }));
      const ready = sources.every((source) => Boolean(source.url));

      if (plan.mode === "single" && ready) {
        const { dataUrl, width, height } = await renderArtwork(sources[0].url!, preset?.size);
        deliverImage(dataUrl, width, height);
        return;
      }

      if (plan.mode === "batch" && ready) {
        setExportProgress({ done: 0, total: sources.length });
        const renders: Array<{ title: string; dataUrl: string; width: number; height: number }> = [];
        // Sequential on purpose: a 4K preset holds a full bitmap per render, and
        // a dozen at once is how a browser tab runs out of memory mid-export.
        for (const [index, source] of sources.entries()) {
          const rendered = await renderArtwork(source.url!, preset?.size);
          renders.push({ title: source.item.title, ...rendered });
          setExportProgress({ done: index + 1, total: sources.length });
        }

        if (format === "png") {
          const zip = new JSZip();
          renders.forEach((render, index) => {
            zip.file(exportFileName(index, render.title, "png"), render.dataUrl.split(",")[1], { base64: true });
          });
          downloadBlob(await zip.generateAsync({ type: "blob" }), `${baseName} series${sizeSuffix}.zip`);
        } else {
          // One page per piece, each page the size of its own artwork, so a
          // client review deck never letterboxes a portrait post.
          const first = renders[0];
          const pdf = new jsPDF({ orientation: first.width >= first.height ? "landscape" : "portrait", unit: "px", format: [first.width, first.height] });
          renders.forEach((render, index) => {
            if (index > 0) pdf.addPage([render.width, render.height], render.width >= render.height ? "landscape" : "portrait");
            pdf.addImage(render.dataUrl, "PNG", 0, 0, render.width, render.height);
          });
          pdf.save(`${baseName} series${sizeSuffix}.pdf`);
        }
        const ordering = plan.ordering === "sequence" ? " in the order your arrows set" : "";
        toast({ description: format === "png"
          ? `Exported ${renders.length} pieces as a ZIP archive${ordering}.`
          : `Exported ${renders.length} pieces as a ${renders.length}-page PDF${ordering}.` });
        return;
      }

      const viewportElement = document.querySelector<HTMLElement>(".creative-flow-wrap .react-flow__viewport");
      const stage = document.querySelector<HTMLElement>(".creative-flow-wrap");
      if (!viewportElement || !stage) return;
      const ids = new Set(selection.map((node) => node.id));
      let expanded = true;
      while (expanded) {
        expanded = false;
        nodes.forEach((node) => { if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); expanded = true; } });
      }
      const bounds = getNodesBounds(nodes.filter((node) => ids.has(node.id)));
      const [width, height] = preset?.size ?? [
        Math.min(2400, Math.max(640, Math.ceil(bounds.width))),
        Math.min(2400, Math.max(480, Math.ceil(bounds.height))),
      ];
      // No padding for a delivery size: the frame is the deliverable edge.
      const transform = getViewportForBounds(bounds, width, height, .1, 4, preset?.size ? 0 : .04);
      const edgeIds = new Set(edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => edge.id));
      // Live class rather than a filter: html-to-image copies computed styles, so
      // hiding the chrome here is what keeps it out of the capture.
      stage.classList.add("creative-exporting");
      try {
        const dataUrl = await toPng(viewportElement, {
          cacheBust: true,
          backgroundColor: format === "pdf" ? "#ffffff" : undefined,
          // A delivery preset means exact pixels; only a free-size capture of
          // canvas cards benefits from the extra resolution.
          width, height, pixelRatio: preset?.size ? 1 : 2,
          style: { width: `${width}px`, height: `${height}px`, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})` },
          filter: (element) => {
            const html = element as HTMLElement;
            if (html.classList?.contains("react-flow__node")) return ids.has(html.dataset.id ?? "");
            if (html.classList?.contains("react-flow__edge")) return edgeIds.has(html.dataset.id ?? "");
            return true;
          },
        });
        deliverImage(dataUrl, width, height);
      } finally {
        stage.classList.remove("creative-exporting");
      }
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setExporting(null); setExportProgress(null); }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-[#171415] text-white"><Loader2 className="animate-spin text-[#CB2039]" /></div>;
  if (isError || !canvas) return <div className="flex h-screen flex-col items-center justify-center gap-4"><p className="font-medium">Canvas not found or access denied.</p><Button asChild variant="outline"><Link to="/dashboard/creative-canvas">Back to projects</Link></Button></div>;

  return <div className="creative-canvas-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!flow || !event.dataTransfer.files.length) return; void upload(event.dataTransfer.files, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
    <header className="creative-canvas-topbar"><div className="flex min-w-0 items-center gap-3"><Button asChild size="icon" variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white"><Link to="/dashboard/creative-canvas" aria-label="Back to Canvas projects"><ArrowLeft size={17} /></Link></Button><div className="h-5 w-px bg-white/10" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{canvas.projects.name}</p><p className="truncate text-[11px] text-white/45">{canvas.projects.client_name || "LV Branding internal"} · {canvas.name}</p></div></div><div className="flex items-center gap-2"><span className={`creative-save-state creative-save-state--${saveState}`}>{saveState === "saving" ? <Loader2 size={12} className="animate-spin" /> : saveState === "offline" ? <WifiOff size={12} /> : saveState === "error" ? <CloudOff size={12} /> : saveState === "saved" ? <Cloud size={12} /> : <Save size={12} />}{saveState}</span><Button size="icon" variant="ghost" className="h-8 w-8 text-white/55 hover:bg-white/10 hover:text-white" title="How nodes work" aria-label="How nodes work" onClick={() => setHelpOpen(true)}><HelpCircle size={16} /></Button><Select value={exportPreset} onValueChange={setExportPreset}><SelectTrigger className="h-8 w-[210px] border-white/10 bg-white/5 text-xs text-white" aria-label="Export size"><SelectValue /></SelectTrigger><SelectContent>{PRESET_GROUPS.map((group) => { const items = EXPORT_PRESETS.filter((preset) => preset.group === group); return items.length ? <SelectGroup key={group}><SelectLabel>{group}</SelectLabel>{items.map((preset) => <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>)}</SelectGroup> : null; })}</SelectContent></Select><Button size="sm" variant="ghost" className="text-white/70" title={batchCount ? `Export ${batchCount} pieces as a ZIP of PNGs` : "Export the selected artwork as a PNG"} disabled={Boolean(exporting)} onClick={() => void exportSelection("png")}>{exporting === "png" ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}{exporting === "png" && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : batchCount ? `ZIP · ${batchCount}` : "PNG"}</Button><Button size="sm" className="bg-[#CB2039]" title={batchCount ? `Export ${batchCount} pieces as a ${batchCount}-page PDF` : "Export the selected artwork as a PDF"} disabled={Boolean(exporting)} onClick={() => void exportSelection("pdf")}>{exporting === "pdf" && <Loader2 size={14} className="mr-1.5 animate-spin" />}{exporting === "pdf" && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : batchCount ? `PDF · ${batchCount} pages` : "Export PDF"}</Button></div></header>
    <div className="creative-canvas-stage">
      <aside className={`creative-toolbar ${leftOpen ? "creative-toolbar--open" : ""}`}><button className="creative-panel-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label={leftOpen ? "Collapse creation toolbar" : "Open creation toolbar"}>{leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>{leftOpen && <div className="space-y-1 p-2"><p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-white/35">Create</p>{NODE_TOOLS.filter((tool) => !tool.group).map(({ type, label, icon: Icon }) => <button key={type} className="creative-tool-button" onClick={() => addNode(type)}><Icon size={16} /><span>{label}</span></button>)}<div className="my-2 h-px bg-white/10" /><button className="creative-tool-button" onClick={() => setUgcOpen(!ugcOpen)} aria-expanded={ugcOpen}><Video size={16} /><span>UGC</span>{ugcOpen ? <ChevronLeft size={13} className="ml-auto rotate-90 opacity-50" /> : <ChevronRight size={13} className="ml-auto opacity-50" />}</button>{ugcOpen && NODE_TOOLS.filter((tool) => tool.group === "ugc").map(({ type, label, icon: Icon }) => <button key={type} className="creative-tool-button pl-5" onClick={() => addNode(type)}><Icon size={15} /><span>{label}</span></button>)}<button className="creative-tool-button" onClick={() => fileInput.current?.click()}><Upload size={16} /><span>Upload</span></button><input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => event.target.files && void upload(event.target.files)} /><div className="my-2 h-px bg-white/10" /><button className="creative-tool-button" onClick={() => { setPaletteQuery(""); setPaletteOpen(true); }} title="Search the LV Creative Command System"><Slash size={16} /><span>Commands</span></button><button className="creative-tool-button" onClick={() => setSeriesOpen(true)} title="Combine selected objects into a grid of posts"><Grid3x3 size={16} /><span>Series</span></button><div className="my-2 h-px bg-white/10" /><button className="creative-tool-button" onClick={() => void flow?.fitView({ nodes: selection, padding: .25, duration: 250 })}><Focus size={16} /><span>Fit selection</span></button><button className="creative-tool-button" onClick={() => void flow?.fitView({ padding: .15, duration: 250 })}><Maximize2 size={16} /><span>Fit canvas</span></button></div>}</aside>
      {selection.length > 0 && <div className="creative-selection-actions"><span className="max-w-40 truncate text-xs text-white/55">{selection.length === 1 ? selection[0].data.title : `${selection.length} selected`}</span><Button size="icon" variant="ghost" className="h-8 w-8" title="Group" disabled={selection.length < 2} onClick={groupSelection}><Group size={14} /></Button><Button size="icon" variant="ghost" className="h-8 w-8" title="Ungroup" onClick={ungroupSelection}><Ungroup size={14} /></Button><Button size="icon" variant="ghost" className="h-8 w-8" title="Bring forward" onClick={() => changeOrder(1)}><ArrowUpToLine size={14} /></Button><Button size="icon" variant="ghost" className="h-8 w-8" title="Send backward" onClick={() => changeOrder(-1)}><ArrowDownToLine size={14} /></Button>{selection.length === 1 && <Select value={["favorite","shortlisted","rejected","needs_revision","client_selected","approved_final"].includes(selection[0].data.status) ? selection[0].data.status : undefined} onValueChange={(value) => void applyDecision(value as CreativeDecision)}><SelectTrigger className="h-8 w-36 border-white/10 bg-white/5 text-xs text-white"><SelectValue placeholder="Set decision" /></SelectTrigger><SelectContent><SelectItem value="favorite">Favorite</SelectItem><SelectItem value="shortlisted">Shortlisted</SelectItem><SelectItem value="needs_revision">Needs revision</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="client_selected">Client selected</SelectItem><SelectItem value="approved_final">Approved final</SelectItem></SelectContent></Select>}{selectedAsset?.signedUrl && <Button size="sm" variant="ghost" className="h-8 text-white/65" onClick={async () => { try { const response = await fetch(selectedAsset.signedUrl!); downloadBlob(await response.blob(), selectedAsset.original_filename); } catch { toast({ title: "Download failed", variant: "destructive" }); } }}><Download size={13} className="mr-1.5" />Original</Button>}</div>}
      <main className="creative-flow-wrap"><CreativeNodeActionsProvider updateNodeData={updateNodeData}><ReactFlow<CreativeFlowNode, CreativeFlowEdge> nodes={nodes} edges={edges} nodeTypes={creativeNodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onInit={(instance) => { setFlow(instance); void instance.setViewport(viewportRef.current); }} onNodeDragStart={recordHistory} onMoveEnd={(_, viewport) => { viewportRef.current = viewport; if (hydrated.current) { setPendingScene(flowToScene(nodesRef.current, edgesRef.current, viewport)); setSaveState(navigator.onLine ? "unsaved" : "offline"); } }} deleteKeyCode={null} multiSelectionKeyCode={["Meta", "Control"]} selectionOnDrag panOnDrag={[1, 2]} minZoom={.1} maxZoom={4} fitViewOptions={{ padding: .15 }}><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,.14)" /><Controls position="bottom-left" /><MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => String(node.data.accent)} maskColor="rgba(23,20,21,.76)" /></ReactFlow></CreativeNodeActionsProvider>{nodes.length === 0 && <div className="creative-empty-state"><div className="creative-empty-mark"><Sparkles size={22} /></div><h2>Begin with direction, not decoration.</h2><p>Build a brief, upload the right references, then turn strategy into creative work.</p><div><Button size="sm" onClick={() => addNode("brand_context")}><Plus size={14} className="mr-1.5" />Add project brief</Button><Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Upload size={14} className="mr-1.5" />Upload references</Button><Button size="sm" variant="outline" onClick={() => addNode("creative_direction")}><Sparkles size={14} className="mr-1.5" />Creative direction</Button></div></div>}</main>
      <aside className={`creative-inspector ${rightOpen ? "creative-inspector--open" : ""}`}><button className="creative-panel-toggle creative-panel-toggle--right" onClick={() => setRightOpen(!rightOpen)} aria-label={rightOpen ? "Collapse inspector" : "Open inspector"}>{rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>{rightOpen && <Tabs defaultValue="properties" className="flex h-full flex-col"><TabsList className="m-2 grid grid-cols-4 bg-white/5"><TabsTrigger value="properties">Object</TabsTrigger><TabsTrigger value="brand">Brand</TabsTrigger><TabsTrigger value="assets">Assets</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList><ScrollArea className="flex-1"><TabsContent value="properties" className="m-0 p-4">{selection.length === 1 ? <div className="space-y-4"><div><p className="creative-inspector-label">Selected object</p><p className="mt-1 text-sm font-medium capitalize text-white">{selection[0].data.nodeType.replaceAll("_", " ")}</p></div><div className="space-y-1.5"><Label className="text-white/70">Title</Label><Input value={selection[0].data.title} onChange={(event) => updateNodeData(selection[0].id, { title: event.target.value })} /></div><div className="space-y-1.5"><Label className="text-white/70">Content</Label><Textarea className="min-h-32" value={selection[0].data.body} onChange={(event) => updateNodeData(selection[0].id, { body: event.target.value })} /></div></div> : !selection.length && edgeSelection.length === 1 ? <ConnectionInspector kind={edgeKindOf(edgeSelection[0])} sourceTitle={nodes.find((node) => node.id === edgeSelection[0].source)?.data.title ?? ""} targetTitle={nodes.find((node) => node.id === edgeSelection[0].target)?.data.title ?? ""} onChange={(kind) => setEdgeKind(edgeSelection[0].id, kind)} /> : <div className="py-10 text-center text-sm text-white/45">{selection.length ? `${selection.length} objects selected` : edgeSelection.length ? `${edgeSelection.length} connections selected` : "Select an object or a connection to edit it."}</div>}</TabsContent>
        <TabsContent value="brand" className="m-0 space-y-4 p-4"><div><p className="text-sm font-semibold text-white">Project source of truth</p><p className="mt-1 text-xs leading-5 text-white/45">Only relevant fields and selected objects are sent to AI providers.</p></div>{BRAND_FIELDS.map((field) => <div key={field.key} className="space-y-1.5"><Label className="text-xs text-white/65">{field.label}</Label><Textarea value={brandDraft[field.key] ?? ""} placeholder={field.placeholder} className="min-h-16 bg-white/5 text-xs text-white" onChange={(event) => setBrandDraft((current) => ({ ...current, [field.key]: event.target.value }))} /></div>)}<Button className="w-full bg-[#CB2039]" disabled={saveBrand.isPending} onClick={async () => { try { await saveBrand.mutateAsync(brandDraft); toast({ description: "Brand context saved." }); } catch (error) { toast({ title: "Brand context was not saved", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); } }}>{saveBrand.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}Save brand context</Button></TabsContent>
        <TabsContent value="assets" className="m-0 space-y-3 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Asset library</p><p className="text-xs text-white/45">Private · {assets.length} assets</p></div><Button size="icon" variant="outline" onClick={() => fileInput.current?.click()} aria-label="Upload asset"><Plus size={14} /></Button></div>{assets.length === 0 ? <p className="py-10 text-center text-xs text-white/40">No uploaded or generated assets.</p> : <div className="grid grid-cols-2 gap-2">{assets.map((asset) => <button key={asset.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/5 text-left" onClick={() => addNode(asset.source_type === "reference" ? "reference" : "image", { title: asset.original_filename, body: `${asset.source_type} asset`, assetId: asset.id, assetUrl: asset.signedUrl ?? "", width: 360, height: 340 })}>{asset.signedUrl ? <img src={asset.signedUrl} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-white/5" />}<p className="truncate p-2 text-[10px] text-white/60">{asset.original_filename}</p></button>)}</div>}</TabsContent>
        <TabsContent value="history" className="m-0 space-y-3 p-4"><div className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-white/60"><CircleDollarSign size={14} className="text-[#CB2039]" />Estimated project usage</div><p className="mt-1 text-xl font-semibold text-white">${(usage?.total ?? 0).toFixed(4)}</p><p className="text-[10px] text-white/35">Estimates may differ from provider billing.</p></div>{generations.length === 0 ? <p className="py-10 text-center text-xs text-white/40">No generations yet.</p> : generations.map((item) => <div key={item.id} className="rounded-lg border border-white/10 bg-white/[.03] p-3"><div className="flex items-center justify-between"><Badge variant="outline" className="border-white/15 text-[10px] text-white/65">{item.provider}</Badge><span className={`text-[10px] ${item.status === "failed" ? "text-red-400" : "text-white/40"}`}>{item.status}</span></div><p className="mt-2 line-clamp-2 text-xs text-white/75">{item.original_instruction}</p><div className="mt-2 flex justify-between text-[10px] text-white/35"><span>{item.model}</span><span>${Number(item.estimated_cost_usd ?? 0).toFixed(4)}</span></div>{item.error_message && <p className="mt-2 text-[10px] text-red-400">{item.error_message}</p>}</div>)}</TabsContent></ScrollArea></Tabs>}</aside>
      <section className="creative-ai-bar"><div className="flex items-center gap-2 border-r border-white/10 pr-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#CB2039]"><Bot size={16} /></div><div><p className="text-xs font-semibold text-white">LV Intelligence</p><p className={`text-[10px] ${imageBlocker ? "text-[#F2495F]" : "text-white/40"}`}>{selection.length ? `${selection.length} selected${inherited.length ? ` · ${inherited.length} connected` : ""}${isImageOperation ? ` · ${referenceAssetIds.length} image${referenceAssetIds.length === 1 ? "" : "s"} sent` : ""}` : imageBlocker ? "No picture selected to edit" : "Project context"}</p></div></div><Select value={operation} onValueChange={(value) => setOperation(value as CreativeOperation)}><SelectTrigger className="h-9 w-[170px] border-white/10 bg-white/5 text-xs text-white"><SelectValue /></SelectTrigger><SelectContent>{AI_ACTIONS.map((action) => <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>)}</SelectContent></Select><Input className="h-9 min-w-52 flex-1 border-white/10 bg-white/5 text-xs text-white placeholder:text-white/30" value={instruction} onChange={(event) => { const next = event.target.value; setInstruction(next); const parsed = parseSlash(next); if (parsed.isCommand) { setPaletteQuery(parsed.query); setPaletteOpen(true); } }} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void runGeneration(); }} placeholder="Direct the next move, or type / for commands…" /><Select value={provider} onValueChange={(value) => setProvider(value as CreativeProvider)}><SelectTrigger className="h-9 w-[128px] border-white/10 bg-white/5 text-xs text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem>{enabledProviders.map((item) => <SelectItem key={item.id} value={item.id}>{PROVIDER_LABELS[item.id] ?? item.id}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-9 bg-[#CB2039]" disabled={!instruction.trim() || generate.isPending || saveState === "offline"} onClick={() => void runGeneration()}>{generate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}<span className="ml-1.5">Create</span></Button></section>
    </div>
    <CanvasHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    <CommandPalette open={paletteOpen} onOpenChange={(next) => { setPaletteOpen(next); if (!next && instruction.startsWith("/")) setInstruction(""); }} initialQuery={paletteQuery} onPick={(command) => { setInstruction(""); setActiveCommand(command); }} />
    <CommandPanel command={activeCommand} open={Boolean(activeCommand)} onOpenChange={(next) => { if (!next && !commandProgress) setActiveCommand(null); }} selection={commandSelection} running={Boolean(commandProgress)} progress={commandProgress} onRun={(values, chosenProvider, permission) => void runCommand(values, chosenProvider, permission)} />
    <SeriesDialog open={seriesOpen} onOpenChange={setSeriesOpen} candidates={seriesCandidates} running={Boolean(seriesProgress)} progress={seriesProgress} onRun={(plan) => void runSeriesGeneration(plan)} />
  </div>;
}
