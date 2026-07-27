import { Palette, Search, MousePointerClick, Layers, Code2, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "ux-ui-design",
  lang:     "es",
  subtitle: "Diseño UX/UI y Experiencias de Usuario",

  typeQuestion: "¿Qué necesitas diseñar?",
  types: [
    "Diseño de sitio nuevo",
    "Rediseño de sitio web",
    "UX/UI de app web",
    "Diseño de app móvil",
    "Auditoría / revisión de usabilidad",
    "Branding + diseño web",
    "Otra cosa",
  ],

  servicesQuestion: "¿Dónde quieres que enfoquemos?",
  services: [
    { title: "Investigación y estrategia UX",      desc: "Insights de usuarios, recorridos y arquitectura", icon: Search },
    { title: "UI y diseño visual",                 desc: "Interfaces pulidas y de marca que convierten",    icon: Palette },
    { title: "Prototipado y pruebas con usuarios", desc: "Prototipos validados con usuarios reales",        icon: MousePointerClick },
    { title: "Sistema de diseño",                  desc: "Componentes reutilizables para consistencia",     icon: Layers },
    { title: "Diseño + desarrollo",                desc: "Lo diseñamos y lo construimos",                   icon: Code2 },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos el enfoque adecuado",       icon: PartyPopper },
  ],

  timeframeLabel: "¿Cuándo quieres lanzar?",
  timeframes: ["Lo antes posible", "1–3 meses", "3–6 meses", "6+ meses", "Solo explorando"],
  dateHint: "Fecha de lanzamiento, si la tienes",

  venueLabel: "¿Tienes un sitio o app actual?",
  venuePlaceholder: "tuempresa.com o enlace de la app — o déjalo en blanco",

  sizeLabel: "Tamaño de la empresa",
  sizeOptions: ["Solo yo", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Menos de $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Aún no sé"],
};

export default function UxUiDesignLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
