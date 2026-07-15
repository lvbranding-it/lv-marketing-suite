import { MonitorPlay, Video, Sparkles, Users, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "av-landing",
  subtitle: "AV & Live Event Production",

  typeQuestion: "What kind of event?",
  types: [
    "Festival or community event",
    "Corporate event",
    "Conference or convention",
    "Real estate / developer",
    "Nonprofit or fundraiser",
    "Sports or athletics",
    "Brand activation",
    "Concert or live entertainment",
    "Something else",
  ],

  servicesQuestion: "What do you need on-site?",
  services: [
    { title: "LED Screen Production",                     desc: "Large-format indoor & outdoor screens",        icon: MonitorPlay },
    { title: "Multi-Camera Live Coverage & Broadcasting", desc: "Five-camera live-to-screen coverage",          icon: Video },
    { title: "Branded Graphics & Sponsor Visibility",     desc: "On-screen branding & sponsor packages",        icon: Sparkles },
    { title: "Interactive Experiences & Photo Systems",   desc: "Attendee photo system + audience interaction", icon: Users },
    { title: "Not sure yet — help me scope it",           desc: "We'll recommend the right package",            icon: PartyPopper },
  ],

  timeframeLabel: "When is the event?",
  timeframes: ["Within 1 month", "1–3 months", "3–6 months", "6+ months", "Just exploring"],
  dateHint: "Exact date, if you have one",

  venueLabel: "Where will the event be?",
  venuePlaceholder: "Hotel, convention center, venue name, or city",

  sizeLabel: "Expected attendees",
  sizeOptions: ["Under 250", "250–1,000", "1,000–5,000", "5,000–20,000", "20,000+"],

  budgets: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"],
};

export default function AvEventProduction() {
  return <ServiceLeadWizard config={config} />;
}
