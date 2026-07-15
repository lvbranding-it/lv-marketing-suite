import { Compass, MessageSquareQuote, PenTool, Palette, BookOpen, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "brand-strategy",
  subtitle: "Brand Strategy & Identity",

  typeQuestion: "What does your brand need?",
  types: [
    "New brand (starting fresh)",
    "Rebrand / brand refresh",
    "Logo & visual identity",
    "Brand positioning & messaging",
    "Brand guidelines",
    "Naming",
    "Something else",
  ],

  servicesQuestion: "What should we take on?",
  services: [
    { title: "Brand positioning",              desc: "Where you sit in the market and why you win",         icon: Compass },
    { title: "Messaging architecture",         desc: "What your brand says, to whom, and how",              icon: MessageSquareQuote },
    { title: "Logo design",                    desc: "A mark built on strategy, not trends",                icon: PenTool },
    { title: "Visual identity",                desc: "Colors, type, and a system that scales",              icon: Palette },
    { title: "Brand guidelines",               desc: "The playbook that keeps everything consistent",       icon: BookOpen },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right approach",                 icon: PartyPopper },
  ],

  timeframeLabel: "When do you want to start?",
  timeframes: ["ASAP", "1–3 months", "3–6 months", "6+ months", "Just exploring"],
  dateHint: "Target date, if you have one",

  venueLabel: "Do you have a current website or brand presence?",
  venuePlaceholder: "yourcompany.com — or leave blank if starting fresh",

  sizeLabel: "Company size",
  sizeOptions: ["Just me", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"],
};

export default function BrandStrategyLead() {
  return <ServiceLeadWizard config={config} />;
}
