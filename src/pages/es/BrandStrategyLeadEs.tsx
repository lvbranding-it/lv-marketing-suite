import { Compass, MessageSquareQuote, PenTool, Palette, BookOpen, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "brand-strategy",
  lang:     "es",
  subtitle: "Estrategia de Marca e Identidad",

  typeQuestion: "¿Qué necesita tu marca?",
  types: [
    "Marca nueva (desde cero)",
    "Rebranding / renovación de marca",
    "Logo e identidad visual",
    "Posicionamiento y mensaje",
    "Guía de marca",
    "Naming",
    "Otra cosa",
  ],

  servicesQuestion: "¿De qué nos encargamos?",
  services: [
    { title: "Posicionamiento de marca",  desc: "Dónde estás en el mercado y por qué ganas",   icon: Compass },
    { title: "Arquitectura de mensaje",   desc: "Qué dice tu marca, a quién y cómo",           icon: MessageSquareQuote },
    { title: "Diseño de logo",            desc: "Un símbolo basado en estrategia, no en modas", icon: PenTool },
    { title: "Identidad visual",          desc: "Colores, tipografía y un sistema que escala",  icon: Palette },
    { title: "Guía de marca",             desc: "El manual que mantiene todo consistente",      icon: BookOpen },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos el enfoque adecuado", icon: PartyPopper },
  ],

  timeframeLabel: "¿Cuándo quieres empezar?",
  timeframes: ["Lo antes posible", "1–3 meses", "3–6 meses", "6+ meses", "Solo explorando"],
  dateHint: "Fecha objetivo, si la tienes",

  venueLabel: "¿Tienes un sitio web o presencia de marca actual?",
  venuePlaceholder: "tuempresa.com — o déjalo en blanco si empiezas de cero",

  sizeLabel: "Tamaño de la empresa",
  sizeOptions: ["Solo yo", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Menos de $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Aún no sé"],
};

export default function BrandStrategyLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
