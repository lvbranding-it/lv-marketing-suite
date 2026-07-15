import { Search, Megaphone, TrendingUp, Mail, Target, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "digital-marketing",
  subtitle: "Digital Marketing & Paid Media",

  typeQuestion: "What's your main goal?",
  types: [
    "Get more leads",
    "Increase online sales",
    "Launch a product or service",
    "Improve SEO & visibility",
    "Grow social presence",
    "Full marketing strategy",
    "Something else",
  ],

  servicesQuestion: "Which channels should we run?",
  services: [
    { title: "Paid search (Google Ads)",       desc: "Capture demand that's already searching",        icon: Search },
    { title: "Paid social",                    desc: "Meta, Instagram, LinkedIn, and TikTok ads",      icon: Megaphone },
    { title: "SEO",                            desc: "Rank for the searches that matter",              icon: TrendingUp },
    { title: "Email marketing",                desc: "Campaigns and automations that convert",         icon: Mail },
    { title: "Campaign strategy",              desc: "Full-funnel planning tied to business goals",    icon: Target },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right mix",                 icon: PartyPopper },
  ],

  timeframeLabel: "When do you want to start?",
  timeframes: ["ASAP", "1–3 months", "3–6 months", "Ongoing support", "Just exploring"],
  dateHint: "Ideal start date, if you have one",

  venueLabel: "What's your website?",
  venuePlaceholder: "yourcompany.com",

  sizeLabel: "Company size",
  sizeOptions: ["Just me", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Under $1k/mo", "$1k–$3k/mo", "$3k–$10k/mo", "$10k+/mo", "Not sure yet"],
};

export default function DigitalMarketingLead() {
  return <ServiceLeadWizard config={config} />;
}
