import { MonitorPlay, Video, Sparkles, Users, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "av-landing",
  lang:     "es",
  subtitle: "Producción AV y Eventos en Vivo",

  typeQuestion: "¿Qué tipo de evento es?",
  types: [
    "Festival o evento comunitario",
    "Evento corporativo",
    "Conferencia o convención",
    "Bienes raíces / desarrollador",
    "Sin fines de lucro o recaudación",
    "Deportes o atletismo",
    "Activación de marca",
    "Concierto o entretenimiento en vivo",
    "Otra cosa",
  ],

  servicesQuestion: "¿Qué necesitas en el lugar?",
  services: [
    { title: "Producción de pantallas LED",                 desc: "Pantallas LED de gran formato, interior y exterior", icon: MonitorPlay },
    { title: "Cobertura en vivo multicámara y transmisión",  desc: "Cobertura de cinco cámaras en vivo a pantalla",      icon: Video },
    { title: "Gráficos de marca y visibilidad de patrocinadores", desc: "Branding en pantalla y paquetes de patrocinio", icon: Sparkles },
    { title: "Experiencias interactivas y sistemas de fotos", desc: "Sistema de fotos para asistentes + interacción",    icon: Users },
    { title: "Aún no estoy seguro — ayúdame a definirlo",    desc: "Te recomendamos el paquete adecuado",                icon: PartyPopper },
  ],

  timeframeLabel: "¿Cuándo es el evento?",
  timeframes: ["En 1 mes", "1–3 meses", "3–6 meses", "6+ meses", "Solo explorando"],
  dateHint: "Fecha exacta, si la tienes",

  venueLabel: "¿Dónde será el evento?",
  venuePlaceholder: "Hotel, centro de convenciones, nombre del lugar o ciudad",

  sizeLabel: "Asistentes esperados",
  sizeOptions: ["Menos de 250", "250–1,000", "1,000–5,000", "5,000–20,000", "20,000+"],

  budgets: ["Menos de $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Aún no sé"],
};

export default function AvEventProductionEs() {
  return <ServiceLeadWizard config={config} />;
}
