import { Search, Megaphone, TrendingUp, Sparkles, MessageSquare, Mail, Target, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "digital-marketing",
  lang:     "es",
  subtitle: "Marketing Digital y Medios Pagados",

  typeQuestion: "¿Cuál es tu objetivo principal?",
  types: [
    "Conseguir más clientes potenciales",
    "Aumentar ventas en línea",
    "Lanzar un producto o servicio",
    "Mejorar SEO y visibilidad",
    "Crecer en redes sociales",
    "Estrategia de marketing completa",
    "Otra cosa",
  ],

  servicesQuestion: "¿Qué canales debemos operar?",
  services: [
    { title: "Búsqueda pagada (Google Ads)", desc: "Captura la demanda que ya está buscando",                                    icon: Search },
    { title: "Social pagado",                desc: "Anuncios en Meta, Instagram, LinkedIn y TikTok",                             icon: Megaphone },
    { title: "SEO",                          desc: "Optimización para buscadores — posiciónate en las búsquedas clave",           icon: TrendingUp },
    { title: "GEO",                          desc: "Optimización para motores generativos — aparece en respuestas de IA (ChatGPT, Gemini)", icon: Sparkles },
    { title: "AEO",                          desc: "Optimización para motores de respuesta — gana fragmentos destacados y respuestas por voz", icon: MessageSquare },
    { title: "Email marketing",              desc: "Campañas y automatizaciones que convierten",                                 icon: Mail },
    { title: "Estrategia de campaña",        desc: "Planeación de embudo completo ligada a objetivos",                           icon: Target },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos la mezcla adecuada",                            icon: PartyPopper },
  ],

  timeframeLabel: "¿Cuándo quieres empezar?",
  timeframes: ["Lo antes posible", "1–3 meses", "3–6 meses", "Soporte continuo", "Solo explorando"],
  dateHint: "Fecha ideal de inicio, si la tienes",

  venueLabel: "¿Cuál es tu sitio web?",
  venuePlaceholder: "tuempresa.com",

  sizeLabel: "Tamaño de la empresa",
  sizeOptions: ["Solo yo", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Menos de $1k/mes", "$1k–$3k/mes", "$3k–$10k/mes", "$10k+/mes", "Aún no sé"],
};

export default function DigitalMarketingLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
