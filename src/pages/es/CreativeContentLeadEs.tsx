import { Lightbulb, Repeat, FileText, Megaphone, Sparkles, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "creative-content",
  lang:     "es",
  subtitle: "Estrategia Creativa y Diseño de Contenido",

  typeQuestion: "¿Qué necesitas crear?",
  types: [
    "Estrategia y planeación de contenido",
    "Creatividad de campaña",
    "Sistema de contenido para redes",
    "Diseño de material e impresos",
    "Activación de marca",
    "Dirección creativa",
    "Otra cosa",
  ],

  servicesQuestion: "¿De qué nos encargamos?",
  services: [
    { title: "Dirección creativa",           desc: "Una visión creativa basada en estrategia",       icon: Lightbulb },
    { title: "Sistemas de contenido",        desc: "Contenido continuo y repetible en tus canales",  icon: Repeat },
    { title: "Diseño de material",           desc: "Folletos, presentaciones, impresos y ventas",    icon: FileText },
    { title: "Creatividad de campaña",       desc: "Del concepto al lanzamiento de una campaña",     icon: Megaphone },
    { title: "Activación de marca",          desc: "Momentos de marca experienciales y presenciales", icon: Sparkles },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos el enfoque adecuado", icon: PartyPopper },
  ],

  timeframeLabel: "¿Cuándo lo necesitas?",
  timeframes: ["Lo antes posible", "1–3 meses", "3–6 meses", "Soporte continuo", "Solo explorando"],
  dateHint: "Fecha límite o de lanzamiento, si la tienes",

  venueLabel: "¿Dónde vivirá el contenido?",
  venuePlaceholder: "Redes, web, impreso, eventos, anuncios…",

  sizeLabel: "Tamaño de la empresa",
  sizeOptions: ["Solo yo", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Menos de $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Aún no sé"],
};

export default function CreativeContentLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
