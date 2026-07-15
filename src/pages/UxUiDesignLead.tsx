import { Palette, Search, MousePointerClick, Layers, Code2, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "ux-ui-design",
  subtitle: "UX/UI Web Design & User Experiences",

  typeQuestion: "What do you need designed?",
  types: [
    "New website design",
    "Website redesign",
    "Web app UX/UI",
    "Mobile app design",
    "Design audit / usability review",
    "Branding + web design",
    "Something else",
  ],

  servicesQuestion: "Where do you want our focus?",
  services: [
    { title: "UX research & strategy",         desc: "User insights, journeys, and information architecture",  icon: Search },
    { title: "UI & visual design",             desc: "Polished, on-brand interfaces that convert",             icon: Palette },
    { title: "Prototyping & user testing",     desc: "Clickable prototypes validated with real users",         icon: MousePointerClick },
    { title: "Design system",                  desc: "Reusable components for a consistent product",           icon: Layers },
    { title: "Design + development",           desc: "We design it and build it",                              icon: Code2 },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right approach",                    icon: PartyPopper },
  ],

  timeframeLabel: "When do you want to launch?",
  timeframes: ["ASAP", "1–3 months", "3–6 months", "6+ months", "Just exploring"],
  dateHint: "Target launch date, if you have one",

  venueLabel: "Do you have a current website or app?",
  venuePlaceholder: "yourcompany.com or app link — or leave blank",

  sizeLabel: "Company size",
  sizeOptions: ["Just me", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"],
};

export default function UxUiDesignLead() {
  return <ServiceLeadWizard config={config} />;
}
