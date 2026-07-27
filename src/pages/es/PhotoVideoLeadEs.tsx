import { Camera, Package, Clapperboard, CalendarDays, Plane, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "photo-video",
  lang:     "es",
  subtitle: "Fotografía y Video Comercial",

  typeQuestion: "¿Qué tipo de sesión necesitas?",
  types: [
    "Fotografía comercial",
    "Producción de video",
    "Paquete de foto + video",
    "Cobertura de evento",
    "Fotografía de producto",
    "Corporativo y retratos",
    "Fotografía deportiva",
    "Otra cosa",
  ],

  servicesQuestion: "¿Qué debemos capturar?",
  services: [
    { title: "Fotografía de marca y lifestyle", desc: "Imágenes con base en estrategia de marca",      icon: Camera },
    { title: "Fotografía de producto",          desc: "E-commerce, catálogo y tomas destacadas",       icon: Package },
    { title: "Producción y edición de video",   desc: "Concepto, grabación y postproducción",          icon: Clapperboard },
    { title: "Cobertura de evento",             desc: "Cobertura de foto + video de tu evento",        icon: CalendarDays },
    { title: "Dron / aéreo",                    desc: "Foto y video aéreo para propiedades y eventos", icon: Plane },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos el paquete adecuado",  icon: PartyPopper },
  ],

  industries: [
    "Restaurantes y comida",
    "Salud y bienestar",
    "Construcción y bienes raíces",
    "ONG y educación",
    "Productos y retail",
    "Corporativo y ejecutivo",
    "Eventos y activaciones",
    "Deportes",
  ],

  timeframeLabel: "¿Cuándo es la sesión?",
  timeframes: ["En 1 mes", "1–3 meses", "3–6 meses", "6+ meses", "Solo explorando"],
  dateHint: "Fecha de la sesión, si la tienes",

  venueLabel: "¿Dónde grabaremos?",
  venuePlaceholder: "Estudio, tu ubicación, lugar o ciudad",

  budgets: ["Menos de $2.5k", "$2.5k–$7.5k", "$7.5k–$20k", "$20k+", "Aún no sé"],
};

export default function PhotoVideoLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
