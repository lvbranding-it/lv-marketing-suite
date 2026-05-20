import {
  Search, FileText, Package, Receipt, Film,
  ClipboardList, Globe, Mail, ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AgentCategory = "sales" | "strategy" | "delivery" | "ops";

export interface AgentConfig {
  id: string;
  name: string;
  shortName: string;
  category: AgentCategory;
  description: string;
  icon: LucideIcon;
  maxQuestions: number;
  requiredFields: string[];
}

export const CATEGORY_LABELS: Record<AgentCategory, string> = {
  sales:    "Sales",
  strategy: "Strategy",
  delivery: "Delivery",
  ops:      "Ops",
};

export const CATEGORY_COLORS: Record<AgentCategory, string> = {
  sales:    "bg-rose-50 text-rose-700 border-rose-200",
  strategy: "bg-violet-50 text-violet-700 border-violet-200",
  delivery: "bg-sky-50 text-sky-700 border-sky-200",
  ops:      "bg-slate-100 text-slate-600 border-slate-200",
};

export const agents: AgentConfig[] = [
  {
    id:             "lead_intel_v1",
    name:           "Lead Intel Agent",
    shortName:      "Lead Intel",
    category:       "sales",
    description:    "Turn a prospect name + website into a sales-ready intel brief with pitch angles and recommended first offer.",
    icon:           Search,
    maxQuestions:   5,
    requiredFields: ["prospect_name"],
  },
  {
    id:             "brief_strategy_deliverables_v1",
    name:           "Client Brief → Strategy + Deliverables",
    shortName:      "Brief → Strategy",
    category:       "strategy",
    description:    "Convert a messy brief into strategy + deliverables plan + timeline + roles + risks.",
    icon:           FileText,
    maxQuestions:   5,
    requiredFields: ["client_brand", "need_right_now", "goal"],
  },
  {
    id:             "offer_builder_v1",
    name:           "Offer Builder Agent",
    shortName:      "Offer Builder",
    category:       "sales",
    description:    "Translate what they want into package options with clear scope ladders and pricing logic.",
    icon:           Package,
    maxQuestions:   5,
    requiredFields: ["what_they_want"],
  },
  {
    id:             "proposal_scope_pricing_v1",
    name:           "Proposal + Scope + Pricing",
    shortName:      "Proposal",
    category:       "sales",
    description:    "Produce a client-ready proposal with scope, deliverables, investment, timeline, and terms.",
    icon:           Receipt,
    maxQuestions:   5,
    requiredFields: ["scope_or_deliverables"],
  },
  {
    id:             "content_system_v1",
    name:           "Content System (Reels + Posts)",
    shortName:      "Content System",
    category:       "delivery",
    description:    "Create a 30-day content system: pillars, hooks, scripts, CTAs, repurposing map.",
    icon:           Film,
    maxQuestions:   5,
    requiredFields: [],
  },
  {
    id:             "production_coordinator_v1",
    name:           "Production Coordinator",
    shortName:      "Production",
    category:       "delivery",
    description:    "Convert deliverables into a production plan: timeline, dependencies, asset list, shoot list.",
    icon:           ClipboardList,
    maxQuestions:   5,
    requiredFields: ["deliverables"],
  },
  {
    id:             "website_audit_rewrite_seo_v1",
    name:           "Website Audit + Rewrite + SEO",
    shortName:      "Website Audit",
    category:       "delivery",
    description:    "Audit a website for clarity, conversion, and SEO — then provide rewritten copy and a fix plan.",
    icon:           Globe,
    maxQuestions:   5,
    requiredFields: ["website_url"],
  },
  {
    id:             "client_comms_v1",
    name:           "Client Comms Agent",
    shortName:      "Client Comms",
    category:       "ops",
    description:    "Turn messy updates into clean, professional client communications: emails, agendas, recaps.",
    icon:           Mail,
    maxQuestions:   3,
    requiredFields: ["raw_notes"],
  },
  {
    id:             "project_manager_v1",
    name:           "Project Manager Agent",
    shortName:      "PM Agent",
    category:       "ops",
    description:    "Convert meeting notes and project updates into a trackable execution plan with tasks, owners, and deadlines.",
    icon:           ListChecks,
    maxQuestions:   5,
    requiredFields: [],
  },
];

export const ROUTER_RULES: { match: string[]; agentId: string }[] = [
  { match: ["prospect", "lead", "research", "competitor", "pitch"],          agentId: "lead_intel_v1" },
  { match: ["brief", "strategy", "deliverables", "plan"],                    agentId: "brief_strategy_deliverables_v1" },
  { match: ["offer", "package", "tier", "scope ladder"],                     agentId: "offer_builder_v1" },
  { match: ["proposal", "pricing", "quote", "sow", "contract"],              agentId: "proposal_scope_pricing_v1" },
  { match: ["reels", "posts", "calendar", "content", "hooks", "scripts"],    agentId: "content_system_v1" },
  { match: ["timeline", "production", "shot list", "dependencies", "checklist"], agentId: "production_coordinator_v1" },
  { match: ["website", "audit", "seo", "rewrite", "copy"],                   agentId: "website_audit_rewrite_seo_v1" },
  { match: ["email", "agenda", "recap", "client update", "text message"],    agentId: "client_comms_v1" },
  { match: ["meeting notes", "tasks", "action items", "milestones", "project manager"], agentId: "project_manager_v1" },
];

export const FALLBACK_AGENT_ID = "brief_strategy_deliverables_v1";

export function routeMessage(message: string): string {
  const lower = message.toLowerCase();
  for (const rule of ROUTER_RULES) {
    if (rule.match.some((kw) => lower.includes(kw))) return rule.agentId;
  }
  return FALLBACK_AGENT_ID;
}

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}
