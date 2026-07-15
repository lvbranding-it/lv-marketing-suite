import { Globe, LayoutDashboard, ShoppingCart, CalendarCheck, Wrench, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "web-solutions",
  subtitle: "Industry Web Solutions & Web App Development",

  typeQuestion: "What are you looking to build?",
  types: [
    "New website",
    "Website redesign",
    "Web application",
    "Client / customer portal",
    "E-commerce store",
    "Booking or scheduling system",
    "Internal tool or dashboard",
    "Something else",
  ],

  servicesQuestion: "What should it do for your business?",
  services: [
    { title: "Custom web application",         desc: "Workflows, portals, and tools built around your operation", icon: LayoutDashboard },
    { title: "Marketing website",              desc: "A fast, strategy-led site that converts",                   icon: Globe },
    { title: "E-commerce / online payments",   desc: "Sell products or take payments online",                     icon: ShoppingCart },
    { title: "Booking & scheduling",           desc: "Reservations, appointments, and calendars",                 icon: CalendarCheck },
    { title: "Integrations & automation",      desc: "Connect your existing tools and automate busywork",         icon: Wrench },
    { title: "Not sure yet — help me scope it", desc: "We'll recommend the right solution",                       icon: PartyPopper },
  ],

  industries: [
    "Construction",
    "Legal",
    "Real Estate & PropTech",
    "Manufacturing",
    "Hospitality & Booking",
    "Healthcare",
    "Nonprofit",
    "Other",
  ],

  timeframeLabel: "When do you want to launch?",
  timeframes: ["ASAP", "1–3 months", "3–6 months", "6+ months", "Just exploring"],
  dateHint: "Target launch date, if you have one",

  venueLabel: "Do you have a current website?",
  venuePlaceholder: "yourcompany.com — or leave blank if starting fresh",

  sizeLabel: "Company size",
  sizeOptions: ["Just me", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"],
};

export default function WebSolutionsLead() {
  return <ServiceLeadWizard config={config} />;
}
