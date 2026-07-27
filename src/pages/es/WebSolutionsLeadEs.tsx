import { Globe, LayoutDashboard, ShoppingCart, CalendarCheck, Wrench, PartyPopper } from "lucide-react";
import ServiceLeadWizard, { type ServiceLeadWizardConfig } from "@/components/leads/ServiceLeadWizard";

const config: ServiceLeadWizardConfig = {
  source:   "web-solutions",
  lang:     "es",
  subtitle: "Soluciones Web por Industria & Desarrollo de Apps",

  typeQuestion: "¿Qué quieres construir?",
  types: [
    "Sitio web nuevo",
    "Rediseño de sitio web",
    "Aplicación web",
    "Portal de clientes",
    "Tienda en línea",
    "Sistema de reservas o citas",
    "Herramienta o panel interno",
    "Otra cosa",
  ],

  servicesQuestion: "¿Qué debe hacer por tu negocio?",
  services: [
    { title: "Aplicación web a medida",             desc: "Flujos, portales y herramientas para tu operación", icon: LayoutDashboard },
    { title: "Sitio web de marketing",              desc: "Un sitio rápido y estratégico que convierte",       icon: Globe },
    { title: "E-commerce / pagos en línea",         desc: "Vende productos o recibe pagos en línea",           icon: ShoppingCart },
    { title: "Reservas y agendamiento",             desc: "Reservaciones, citas y calendarios",                icon: CalendarCheck },
    { title: "Integraciones y automatización",      desc: "Conecta tus herramientas y automatiza tareas",      icon: Wrench },
    { title: "Aún no estoy seguro — ayúdame a definirlo", desc: "Te recomendamos la solución adecuada",         icon: PartyPopper },
  ],

  industries: [
    "Construcción",
    "Legal",
    "Bienes raíces & PropTech",
    "Manufactura",
    "Hotelería & reservas",
    "Salud",
    "Sin fines de lucro",
    "Otra",
  ],

  timeframeLabel: "¿Cuándo quieres lanzar?",
  timeframes: ["Lo antes posible", "1–3 meses", "3–6 meses", "6+ meses", "Solo explorando"],
  dateHint: "Fecha de lanzamiento, si la tienes",

  venueLabel: "¿Tienes un sitio web actual?",
  venuePlaceholder: "tuempresa.com — o déjalo en blanco si empiezas de cero",

  sizeLabel: "Tamaño de la empresa",
  sizeOptions: ["Solo yo", "2–10", "11–50", "51–200", "200+"],

  budgets: ["Menos de $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Aún no sé"],
};

export default function WebSolutionsLeadEs() {
  return <ServiceLeadWizard config={config} />;
}
