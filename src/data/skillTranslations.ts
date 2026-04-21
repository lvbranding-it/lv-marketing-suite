import type { Language } from "@/hooks/useLanguage";
import type { ContextField, Skill, SkillCategory } from "./skills";

type FieldTranslation = Partial<Pick<ContextField, "label" | "placeholder">>;

interface SkillTranslation {
  name: string;
  description: string;
  fields?: Record<string, FieldTranslation>;
}

const CATEGORY_LABELS_ES: Record<SkillCategory, string> = {
  foundation: "Fundamentos",
  conversion: "Conversion",
  content: "Contenido y Copy",
  seo: "SEO y Descubrimiento",
  paid: "Pauta y Distribucion",
  measurement: "Medicion",
  retention: "Retencion",
  growth: "Crecimiento",
  strategy: "Estrategia",
  sales: "Ventas y RevOps",
};

const OPTION_LABELS_ES: Record<string, string> = {
  Homepage: "Pagina de inicio",
  "Landing Page": "Landing page",
  "Pricing Page": "Pagina de precios",
  "Feature Page": "Pagina de funcionalidad",
  "About Page": "Pagina acerca de",
  Email: "Email",
  Ad: "Anuncio",
  Other: "Otro",
  Marketplace: "Marketplace",
  "Mobile App": "App movil",
  "E-commerce": "E-commerce",
  "Content Site": "Sitio de contenido",
  Agency: "Agencia",
  Startup: "Startup",
  Multiple: "Multiple",
  Onboarding: "Onboarding",
  Welcome: "Bienvenida",
  Nurture: "Nutricion",
  "Re-engagement": "Reactivacion",
  "Post-purchase": "Post-compra",
  "Trial Expiry": "Fin de prueba",
  LinkedIn: "LinkedIn",
  Instagram: "Instagram",
  "Twitter/X": "Twitter/X",
  TikTok: "TikTok",
  Facebook: "Facebook",
  Directory: "Directorio",
  "Product/Service": "Producto/Servicio",
  "Blog Post": "Articulo de blog",
  FAQ: "FAQ",
  Pricing: "Precios",
  About: "Acerca de",
  Review: "Resena",
  "Google Ads": "Google Ads",
  "Meta Ads": "Meta Ads",
  "LinkedIn Ads": "LinkedIn Ads",
  "TikTok Ads": "TikTok Ads",
  "Lead Generation": "Generacion de leads",
  "Brand Awareness": "Reconocimiento de marca",
  Conversions: "Conversiones",
  "App Installs": "Instalaciones de app",
  Retargeting: "Retargeting",
  "Google Search": "Google Search",
  "Google Display": "Google Display",
  "Meta/Instagram": "Meta/Instagram",
  "Google Analytics 4": "Google Analytics 4",
  Mixpanel: "Mixpanel",
  Amplitude: "Amplitude",
  Heap: "Heap",
  PostHog: "PostHog",
  Subscription: "Suscripcion",
  "Consumer App": "App de consumo",
  Service: "Servicio",
  "Pre-launch": "Pre-lanzamiento",
  "Early (0-100 customers)": "Inicial (0-100 clientes)",
  "Early (0–100 customers)": "Inicial (0-100 clientes)",
  "Growth (100-1k)": "Crecimiento (100-1k)",
  "Growth (100–1k)": "Crecimiento (100-1k)",
  "Scale (1k+)": "Escala (1k+)",
  Enterprise: "Enterprise",
  "Usage-based": "Por uso",
  Freemium: "Freemium",
  "One-time": "Pago unico",
  "SEO / Organic Traffic": "SEO / Trafico organico",
  "Thought Leadership": "Liderazgo de opinion",
  "Community Building": "Comunidad",
  "All of the above": "Todo lo anterior",
  Any: "Cualquiera",
  Template: "Plantilla",
  Checklist: "Checklist",
  "Guide/eBook": "Guia/eBook",
  Calculator: "Calculadora",
  "Email Course": "Curso por email",
  Webinar: "Webinar",
  Tool: "Herramienta",
  "Battle Card": "Battle card",
  "Case Study": "Caso de estudio",
  "One-Pager": "One-pager",
  "Demo Script": "Guion de demo",
  "Objection Handling": "Manejo de objeciones",
  "Sales Playbook": "Playbook de ventas",
  "Email Templates": "Plantillas de email",
};

const SKILL_TRANSLATIONS_ES: Record<string, SkillTranslation> = {
  "product-marketing-context": {
    name: "Contexto de Marketing del Producto",
    description: "Construye el documento base de contexto que alimenta todas las demas habilidades de marketing.",
    fields: {
      product_name: { label: "Nombre del producto / empresa" },
      website: { label: "URL del sitio web", placeholder: "https://..." },
      product_description: { label: "Que hace? (2-3 oraciones)" },
      target_audience: { label: "Quien es la audiencia objetivo?" },
    },
  },
  "page-cro": {
    name: "CRO de Pagina",
    description: "Optimiza cualquier pagina de marketing para aumentar conversiones con auditoria y recomendaciones estructuradas.",
    fields: {
      page_url: { label: "URL de la pagina", placeholder: "https://..." },
      page_content: { label: "Copy o descripcion de la pagina", placeholder: "Pega el contenido de la pagina o describela..." },
      conversion_goal: { label: "Objetivo principal de conversion", placeholder: "ej. registrarse, agendar demo, comprar" },
      traffic_source: { label: "Fuente principal de trafico", placeholder: "ej. organico, pauta, email" },
    },
  },
  "signup-flow-cro": {
    name: "CRO de Registro",
    description: "Reduce friccion y abandono en tu flujo de registro.",
    fields: {
      flow_description: { label: "Describe tu flujo actual de registro" },
      current_dropoff: { label: "Donde abandonan los usuarios?" },
      product_type: { label: "Tipo de producto" },
    },
  },
  "onboarding-cro": {
    name: "CRO de Onboarding",
    description: "Mejora la activacion y el tiempo hasta valor en la experiencia de onboarding.",
    fields: {
      onboarding_steps: { label: "Describe los pasos actuales de onboarding" },
      activation_event: { label: "Cual es tu evento de activacion?", placeholder: "ej. primer proyecto creado, primera importacion" },
      current_activation_rate: { label: "Tasa de activacion actual (si la conoces)" },
    },
  },
  "form-cro": {
    name: "CRO de Formularios",
    description: "Optimiza formularios de leads, checkout y contacto para maximizar completitud.",
    fields: {
      form_purpose: { label: "Para que sirve este formulario?", placeholder: "ej. captura de leads, checkout, contacto" },
      form_fields: { label: "Lista los campos actuales del formulario" },
      completion_rate: { label: "Tasa de completitud actual (si la conoces)" },
    },
  },
  "popup-cro": {
    name: "CRO de Popups",
    description: "Disena popups y overlays de alta conversion que capturan leads sin destruir la experiencia.",
    fields: {
      popup_goal: { label: "Que debe lograr el popup?", placeholder: "ej. captura de email, descuento, salida" },
      trigger: { label: "Cuando se activa?", placeholder: "ej. salida, temporizador 30s, scroll 50%" },
      current_offer: { label: "Oferta o incentivo actual" },
    },
  },
  "paywall-upgrade-cro": {
    name: "CRO de Paywall y Upgrade",
    description: "Aumenta la conversion de gratis a pago con mejores paywalls y prompts de upgrade.",
    fields: {
      current_paywall: { label: "Describe tu paywall o prompt de upgrade actual" },
      free_tier_limits: { label: "Cuales son los limites del plan gratis?" },
      conversion_rate: { label: "Tasa actual de gratis a pago (si la conoces)" },
    },
  },
  copywriting: {
    name: "Copywriting",
    description: "Escribe o reescribe copy de marketing de alta conversion para paginas, anuncios o emails.",
    fields: {
      page_type: { label: "Tipo de copy necesario" },
      existing_copy: { label: "Copy existente para reescribir (o dejalo vacio para copy nuevo)" },
      goal: { label: "Objetivo principal", placeholder: "ej. conseguir registros, agendar demos" },
      audience: { label: "Audiencia especifica para este copy" },
    },
  },
  "copy-editing": {
    name: "Edicion de Copy",
    description: "Pulir y mejorar copy de marketing existente para claridad, tono y persuasion.",
    fields: {
      copy_to_edit: { label: "Copy a editar" },
      issues: { label: "Que problemas se han detectado?", placeholder: "ej. demasiado largo, mucho jargon, fuera de marca" },
      target_tone: { label: "Tono deseado", placeholder: "ej. conversacional, profesional, audaz" },
    },
  },
  "cold-email": {
    name: "Email Frio",
    description: "Escribe emails de prospeccion personalizados que consiguen respuestas.",
    fields: {
      prospect_role: { label: "Cargo / rol del prospecto" },
      prospect_company: { label: "Tipo o nombre de empresa del prospecto" },
      offer: { label: "Que estas ofreciendo?" },
      desired_cta: { label: "Llamado a la accion deseado", placeholder: "ej. llamada de 15 min, demo, prueba gratis" },
    },
  },
  "email-sequence": {
    name: "Secuencia de Emails",
    description: "Construye secuencias automatizadas para onboarding, nutricion o reactivacion.",
    fields: {
      sequence_type: { label: "Tipo de secuencia" },
      audience_segment: { label: "Quien recibe esta secuencia?" },
      sequence_goal: { label: "Resultado deseado", placeholder: "ej. activar usuarios, convertir prueba, retener clientes" },
      num_emails: { label: "Numero de emails", placeholder: "ej. 5" },
    },
  },
  "social-content": {
    name: "Contenido Social",
    description: "Crea publicaciones, captions y calendarios de contenido que detienen el scroll.",
    fields: {
      platform: { label: "Plataforma" },
      content_goal: { label: "Objetivo del contenido", placeholder: "ej. awareness, leads, engagement" },
      topic_or_theme: { label: "Tema, idea o campana" },
      num_posts: { label: "Numero de publicaciones", placeholder: "ej. 10" },
    },
  },
  "seo-audit": {
    name: "Auditoria SEO",
    description: "Diagnostica problemas tecnicos y on-page de SEO con recomendaciones priorizadas.",
    fields: {
      website_url: { label: "URL del sitio web", placeholder: "https://..." },
      target_keywords: { label: "Keywords objetivo (si las conoces)" },
      main_issues: { label: "Problemas o preocupaciones SEO conocidas" },
    },
  },
  "ai-seo": {
    name: "SEO para IA",
    description: "Optimiza contenido para aparecer en resultados de busqueda con IA (ChatGPT, Perplexity, Google SGE).",
    fields: {
      target_topic: { label: "Tema a optimizar" },
      existing_content: { label: "Contenido existente o URL" },
      competitor_urls: { label: "URLs de competidores rankeando para este tema" },
    },
  },
  "programmatic-seo": {
    name: "SEO Programatico",
    description: "Disena y construye paginas SEO a escala con plantillas basadas en datos.",
    fields: {
      website_type: { label: "Tipo de sitio web" },
      target_keywords_pattern: { label: "Patron de keywords a atacar", placeholder: "ej. \"mejor [herramienta] para [industria]\"" },
      data_source: { label: "Fuente de datos disponible", placeholder: "ej. CSV, base de datos, API" },
    },
  },
  "site-architecture": {
    name: "Arquitectura del Sitio",
    description: "Estructura tu sitio para maxima rastreabilidad SEO y claridad de navegacion.",
    fields: {
      site_type: { label: "Tipo de sitio" },
      current_pages: { label: "Lista las paginas principales actuales" },
      business_goals: { label: "Objetivos principales del negocio" },
    },
  },
  "competitor-alternatives": {
    name: "Alternativas a Competidores",
    description: "Crea landing pages de \"alternativa a [competidor]\" para capturar trafico de alta intencion.",
    fields: {
      competitor_name: { label: "Nombre del competidor" },
      competitor_url: { label: "URL del competidor" },
      your_differentiators: { label: "Tus diferenciadores clave contra este competidor" },
    },
  },
  "schema-markup": {
    name: "Marcado Schema",
    description: "Agrega datos estructurados para mejorar rich results y visibilidad en busqueda.",
    fields: {
      page_type: { label: "Tipo de pagina" },
      page_content: { label: "Contenido o descripcion de la pagina" },
      schema_goals: { label: "Rich results deseados", placeholder: "ej. FAQ snippet, estrellas, info de producto" },
    },
  },
  "paid-ads": {
    name: "Anuncios Pagados",
    description: "Construye y optimiza campanas pagadas en Google, Meta y LinkedIn.",
    fields: {
      platform: { label: "Plataforma de anuncios" },
      campaign_goal: { label: "Objetivo de campana" },
      budget: { label: "Presupuesto mensual (aprox.)", placeholder: "ej. $2,000/mes" },
      target_audience: { label: "Audiencia objetivo" },
    },
  },
  "ad-creative": {
    name: "Creatividad de Anuncios",
    description: "Escribe copy de anuncios y briefs creativos de alta conversion para cualquier plataforma.",
    fields: {
      ad_platform: { label: "Plataforma de anuncios" },
      ad_format: { label: "Formato del anuncio", placeholder: "ej. imagen unica, carrusel, video" },
      offer: { label: "Oferta o mensaje" },
      audience: { label: "Audiencia objetivo" },
    },
  },
  "analytics-tracking": {
    name: "Tracking de Analytics",
    description: "Configura analytics correctamente para medir lo que importa para tu negocio.",
    fields: {
      analytics_tool: { label: "Herramienta de analytics" },
      business_goals: { label: "Objetivos clave del negocio a medir" },
      current_tracking: { label: "Que se mide actualmente?" },
    },
  },
  "ab-test-setup": {
    name: "Setup de A/B Test",
    description: "Disena A/B tests estadisticamente solidos con hipotesis y metricas claras.",
    fields: {
      element_to_test: { label: "Que elemento estas probando?", placeholder: "ej. headline, boton CTA, precios" },
      hypothesis: { label: "Tu hipotesis", placeholder: "Si cambiamos X, esperamos Y porque..." },
      monthly_traffic: { label: "Visitantes mensuales de la pagina" },
      current_conversion_rate: { label: "Tasa de conversion actual" },
    },
  },
  "churn-prevention": {
    name: "Prevencion de Churn",
    description: "Identifica usuarios en riesgo y construye intervenciones para reducir churn.",
    fields: {
      churn_rate: { label: "Churn actual", placeholder: "ej. 5% mensual" },
      churn_signals: { label: "Senales o patrones conocidos de churn" },
      business_model: { label: "Modelo de negocio" },
      customer_segment: { label: "Segmento de clientes a enfocar" },
    },
  },
  "free-tool-strategy": {
    name: "Estrategia de Herramienta Gratis",
    description: "Disena herramientas gratis que generan trafico SEO y leads top-of-funnel.",
    fields: {
      business_category: { label: "Negocio / industria" },
      target_audience: { label: "Audiencia objetivo" },
      existing_tools: { label: "Herramientas gratis existentes (si hay)" },
    },
  },
  "referral-program": {
    name: "Programa de Referidos",
    description: "Disena un programa de referidos que convierte clientes en tu mejor canal de crecimiento.",
    fields: {
      product_type: { label: "Tipo de producto" },
      current_nps: { label: "NPS o satisfaccion actual" },
      reward_budget: { label: "Rango de presupuesto para recompensa", placeholder: "ej. $10-$25 por referido" },
    },
  },
  "marketing-ideas": {
    name: "Ideas de Marketing",
    description: "Genera 10-20 ideas accionables de marketing adaptadas a tu producto y etapa.",
    fields: {
      growth_stage: { label: "Etapa de crecimiento" },
      biggest_challenge: { label: "Mayor reto de marketing ahora" },
      channels_tried: { label: "Canales ya probados" },
    },
  },
  "marketing-psychology": {
    name: "Psicologia de Marketing",
    description: "Aplica principios psicologicos probados para aumentar conversion y persuasion.",
    fields: {
      use_case: { label: "Donde aplicar psicologia", placeholder: "ej. homepage, precios, checkout, email" },
      target_behavior: { label: "Comportamiento deseado", placeholder: "ej. registrarse, hacer upgrade, compartir" },
      current_obstacles: { label: "Obstaculos actuales para ese comportamiento" },
    },
  },
  "launch-strategy": {
    name: "Estrategia de Lanzamiento",
    description: "Planea y ejecuta el lanzamiento exitoso de un producto o funcionalidad.",
    fields: {
      launch_type: { label: "Que estas lanzando?", placeholder: "ej. producto nuevo, funcionalidad, rebrand, mercado" },
      launch_date: { label: "Fecha objetivo de lanzamiento" },
      launch_goal: { label: "Objetivo principal del lanzamiento", placeholder: "ej. 500 registros, $10k MRR, 1k en waitlist" },
      audience: { label: "Audiencia objetivo" },
    },
  },
  "pricing-strategy": {
    name: "Estrategia de Precios",
    description: "Disena un modelo de precios que maximiza ingresos y reduce friccion.",
    fields: {
      current_pricing: { label: "Modelo de precios actual (si hay)" },
      business_model: { label: "Modelo de negocio" },
      customer_segments: { label: "Segmentos de clientes" },
      competitors_pricing: { label: "Precios de competidores (si los conoces)" },
    },
  },
  "content-strategy": {
    name: "Estrategia de Contenido",
    description: "Construye una estrategia de contenido que impulse trafico organico, confianza y pipeline.",
    fields: {
      content_goal: { label: "Objetivo principal del contenido" },
      current_content: { label: "Esfuerzos actuales de contenido", placeholder: "ej. blog 2x/semana, sin newsletter" },
      resources: { label: "Recursos disponibles", placeholder: "ej. 1 redactor, founder-led, agencia" },
    },
  },
  "lead-magnets": {
    name: "Lead Magnets",
    description: "Disena lead magnets de alto valor que atraen y convierten a tus clientes ideales.",
    fields: {
      target_persona: { label: "Persona objetivo" },
      main_pain_point: { label: "Dolor principal a resolver" },
      preferred_format: { label: "Formato preferido" },
    },
  },
  revops: {
    name: "RevOps",
    description: "Alinea marketing, ventas y customer success alrededor de operaciones de ingresos unificadas.",
    fields: {
      current_stack: { label: "Stack tecnologico actual", placeholder: "ej. HubSpot CRM, Outreach, Stripe" },
      team_size: { label: "Tamano del equipo de ventas/CS" },
      main_bottleneck: { label: "Principal cuello de botella de ingresos" },
    },
  },
  "sales-enablement": {
    name: "Sales Enablement",
    description: "Construye materiales de ventas, battle cards y playbooks que cierran mas deals.",
    fields: {
      deliverable_type: { label: "Que crear" },
      target_buyer: { label: "Comprador / persona objetivo" },
      deal_stage: { label: "Contexto de etapa del deal", placeholder: "ej. discovery, demo, cierre" },
    },
  },
};

export function translateSkillCategory(category: SkillCategory, language: Language) {
  return language === "es" ? CATEGORY_LABELS_ES[category] : undefined;
}

export function translateSkillOption(option: string, language: Language) {
  return language === "es" ? OPTION_LABELS_ES[option] ?? option : option;
}

export function localizeSkill(skill: Skill, language: Language): Skill {
  if (language !== "es") return skill;

  const translation = SKILL_TRANSLATIONS_ES[skill.id];
  if (!translation) return skill;

  return {
    ...skill,
    name: translation.name,
    description: translation.description,
    contextFields: skill.contextFields.map((field) => ({
      ...field,
      ...(translation.fields?.[field.key] ?? {}),
    })),
  };
}

export function localizeContextField(skill: Skill, field: ContextField, language: Language) {
  if (language !== "es") return field;
  const fieldTranslation = SKILL_TRANSLATIONS_ES[skill.id]?.fields?.[field.key];
  return {
    ...field,
    ...(fieldTranslation ?? {}),
  };
}
