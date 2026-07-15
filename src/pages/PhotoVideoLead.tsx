import { Camera, Package, Clapperboard, CalendarDays, Plane, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "photo-video",
  subtitle: "Commercial Photography & Video Production",

  typeQuestion: "What kind of shoot do you need?",
  types: [
    "Commercial photography",
    "Video production",
    "Photo + video package",
    "Event coverage",
    "Product photography",
    "Corporate & headshots",
    "Sports photography",
    "Something else",
  ],

  servicesQuestion: "What should we capture?",
  services: [
    { title: "Brand & lifestyle photography",  desc: "Strategy-rooted imagery for your brand",          icon: Camera },
    { title: "Product photography",            desc: "E-commerce, catalog, and hero shots",             icon: Package },
    { title: "Video production & editing",     desc: "Concept, filming, and post-production",           icon: Clapperboard },
    { title: "Event coverage",                 desc: "Photo + video coverage of your event",            icon: CalendarDays },
    { title: "Drone / aerial",                 desc: "Aerial photo and video for properties & events",  icon: Plane },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right package",              icon: PartyPopper },
  ],

  industries: [
    "Restaurants & food",
    "Healthcare & wellness",
    "Construction & real estate",
    "Nonprofits & education",
    "Products & retail",
    "Corporate & executive",
    "Events & activations",
    "Sports",
  ],

  timeframeLabel: "When is the shoot?",
  timeframes: ["Within 1 month", "1–3 months", "3–6 months", "6+ months", "Just exploring"],
  dateHint: "Shoot date, if you have one",

  venueLabel: "Where will we be shooting?",
  venuePlaceholder: "Studio, your location, venue, or city",

  budgets: ["Under $2.5k", "$2.5k–$7.5k", "$7.5k–$20k", "$20k+", "Not sure yet"],
};

export default function PhotoVideoLead() {
  return <ServiceLeadWizard config={config} />;
}
