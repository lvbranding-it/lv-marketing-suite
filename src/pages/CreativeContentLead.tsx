import { Lightbulb, Repeat, FileText, Megaphone, Sparkles, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "creative-content",
  subtitle: "Creative Strategy & Content Design",

  typeQuestion: "What do you need created?",
  types: [
    "Content strategy & planning",
    "Campaign creative",
    "Social media content system",
    "Collateral & print design",
    "Brand activation",
    "Creative direction",
    "Something else",
  ],

  servicesQuestion: "What should we take on?",
  services: [
    { title: "Creative direction",             desc: "A strategy-led creative vision for your brand",            icon: Lightbulb },
    { title: "Content systems",                desc: "Ongoing, repeatable content across your channels",         icon: Repeat },
    { title: "Collateral design",              desc: "Brochures, decks, print, and sales materials",             icon: FileText },
    { title: "Campaign creative",              desc: "Concept-to-launch creative for a specific campaign",       icon: Megaphone },
    { title: "Brand activation",               desc: "Experiential and in-person brand moments",                 icon: Sparkles },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right approach",                      icon: PartyPopper },
  ],

  timeframeLabel: "When do you need it?",
  timeframes: ["ASAP", "1–3 months", "3–6 months", "Ongoing support", "Just exploring"],
  dateHint: "Deadline or launch date, if you have one",

  venueLabel: "Where will the content live?",
  venuePlaceholder: "Social, web, print, events, ads…",

  sizeLabel: "Company size",
  sizeOptions: ["Just me", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"],
};

export default function CreativeContentLead() {
  return <ServiceLeadWizard config={config} />;
}
