// ── Spanish: keyed metadata ─────────────────────────────────────────────────────
// Neutral Latin American Spanish, addressing the reader as "usted": the formal
// register is deliberate, and reads as a considered service rather than an app.
// existing /es/ landing pages. Terminology follows what a Houston-market
// Spanish-speaking business owner would actually say: "medios pagados" rather
// than "media", "clientes potenciales" rather than "leads" in prose (though
// "leads" survives where it is the working term).
//
// These sit in their own file because the metadata is the bulk of the
// vocabulary; the sentences the engine composes live in es.phrases.ts.

import type { CalcCopy } from "./types";

export const esCategories: CalcCopy["categories"] = {
  strategy: {
    label: "Estrategia y planeación",
    short: "Estrategia",
    why: "Posicionamiento, definición de audiencia y el plan de campaña. Esto es lo que hace que cada dólar posterior apunte en la misma dirección.",
    covers: "Estrategia de campaña, investigación de audiencia, arquitectura de mensajes, planeación de canales y planificación de los recursos de medición.",
  },
  creative: {
    label: "Marca y creatividad",
    short: "Creatividad",
    why: "El mensaje y las piezas que lo transmiten. La pauta amplifica lo que ya existe; la creatividad fuerte es lo que se amplifica.",
    covers: "Desarrollo de concepto, piezas visuales, fotografía, video, gráficos publicitarios y textos de anuncios para los canales que eligió.",
  },
  digital: {
    label: "Experiencia digital",
    short: "Digital",
    why: "Donde aterrizan los clics. Una campaña que paga por tráfico hacia una página que no convierte y no está lista para ese tráfico pierde dinero en silencio.",
    covers: "Páginas de destino (Landing pages), mejoras al formulario o al proceso de compra, seguimiento de conversiones y configuración de analítica.",
  },
  media: {
    label: "Medios pagados",
    short: "Medios",
    why: "El presupuesto de distribución publicitaria: lo que cobran las plataformas o medios por poner su mensaje frente a la audiencia que eligió.",
    covers: "Inversión publicitaria en los canales que eligió, incluyendo presupuesto de pruebas de audiencia dentro de cada plataforma.",
  },
  management: {
    label: "Gestión de campaña",
    short: "Gestión",
    why: "Alguien tiene que operarla. Las campañas que se lanzan y nunca se vuelven a tocar rinden menos que las que se gestionan activamente.",
    covers: "Configuración de campaña, monitoreo, ajustes de pujas y presupuesto, reportes y coordinación entre canales.",
  },
  testing: {
    label: "Pruebas y optimización",
    short: "Pruebas",
    why: "Una reserva para aprender. Las primeras suposiciones rara vez son las mejores. Este es el presupuesto que permite mejorar la campaña sobre la marcha.",
    covers: "Variaciones creativas, pruebas de audiencia y canal, experimentos en la página de destino, optimización controlada y análisis de medición",
  },
};

export const esObjectives: CalcCopy["objectives"] = {
  awareness: {
    label: "Lograr presencia y reconocimiento de marca",
    hint: "Que la gente que no conoce su oferta, la vea y se identifique con ella y/o que más gente sepa acerca de su marca o producto",
    unitNoun: "personas alcanzadas",
    unitSingular: "persona alcanzada",
  },
  leads: {
    label: "Generar clientes potenciales",
    hint: "Conseguir contactos calificados",
    unitNoun: "clientes potenciales",
    unitSingular: "cliente potencial",
  },
  sales: {
    label: "Ventas en línea",
    hint: "Vender directa por internet",
    unitNoun: "ventas",
    unitSingular: "venta",
  },
  visits: {
    label: "Visitas a su tienda en línea",
    hint: "Llevar gente a su local",
    unitNoun: "visitas",
    unitSingular: "visita",
  },
  event: {
    label: "Asistencia a su evento",
    hint: "Llenar un evento o actividad",
    unitNoun: "registros",
    unitSingular: "registro",
  },
  launch: {
    label: "Lanzamiento de producto o negocio",
    hint: "Presentar algo nuevo al mercado",
    unitNoun: "clientes",
    unitSingular: "cliente",
  },
  retention: {
    label: "Retención de clientes",
    hint: "Que los clientes actuales regresen",
    unitNoun: "clientes recurrentes",
    unitSingular: "cliente recurrente",
  },
};

export const esScenarios: CalcCopy["scenarios"] = {
  essential: {
    label: "Esencial",
    tagline: "Un inicio enfocado",
    description: "Una campaña enfocada con la estrategia y la creatividad desarrolladas para hacer bien el trabajo: menos canales, un set creativo austero y una reserva de pruebas más pequeña.",
    limitations: "Una buena manera de comprobar que algo funciona, o de hacer rendir un presupuesto ajustado. El alcance es limitado a propósito, y queda menos margen para intentar un segundo enfoque si el primero no rinde.",
  },
  growth: {
    label: "Crecimiento",
    tagline: "El plan equilibrado",
    description: "Un plan equilibrado con creatividad más sólida, pruebas reales y margen para seguir mejorando en un conjunto acotado de canales.",
    limitations: "Este recurso está pensado para campañas que corren un buen tiempo. Asume que puede comprometerte con toda la duración y actuar según lo que digan las pruebas.",
  },
  expansion: {
    label: "Expansión",
    tagline: "Mayor alcance",
    description: "Una campaña más amplia con más alcance, más variaciones creativas, pruebas más profundas y margen para escalar donde la mezcla de canales lo justifique.",
    limitations: "Una operación más grande necesita a alguien gestionándola activamente y disposición real a cambiar cosas sobre la marcha. La escala amplifica lo que funciona, y también lo que no.",
  },
};

export const esChannels: CalcCopy["channels"] = {
  "google-search":  "Google Search",
  "google-display": "Google Display",
  youtube:          "YouTube",
  "meta-facebook":  "Meta (Facebook)",
  instagram:        "Instagram",
  linkedin:         "LinkedIn",
  tiktok:           "TikTok",
  programmatic:     "Programática",
  email:            "Correo electrónico",
  other:            "Otro",
};

export const esDestinations: CalcCopy["destinations"] = {
  "landing-page":       "Visitar una página establecida (Landing Page)",
  "lead-form":          "Llenar un formulario de contacto",
  "buy-online":         "Comprar en su tienda en línea",
  "physical-location":  "Visitar su local o establecimiento físico",
  "event-registration": "Registrarse a su evento",
  "call-message":       "Llamar o escribir a su negocio",
  none:                 "Por ahora, ninguna acción directa; es una campaña de reconocimiento de marca",
};

export const esReadinessGroups: CalcCopy["readinessGroups"] = {
  foundation:  { label: "Estado base de la campaña",       blurb: "La estrategia sobre la que se construye todo lo demás." },
  creative:    { label: "Piezas creativas",         blurb: "Lo que necesitan mostrar los canales que eligió." },
  destination: { label: "Destino de la campaña",    blurb: "A dónde envía la campaña a las personas." },
  measurement: { label: "Medición y optimización",  blurb: "Esta herramienta es fundamental, es la que podrás usar para medir y determinar que su campaña funcionó." },
};

export const esReadinessItems: CalcCopy["readinessItems"] = {
  positioning:    { label: "Tiene una audiencia y posicionamiento claros",        hint: "Ya sabe a quién le hablas y por qué elegirían su marca en vez de otra" },
  objectiveOffer: { label: "Objetivo de campaña y respuesta esperada",   hint: "Qué quiere lograr y qué debe hacer la gente" },
  message:        { label: "Mensaje de campaña",                        hint: "Cual es la idea central que llevará la campaña" },
  channelStrategy:{ label: "Estrategia de canales",                     hint: "En qué plataformas debes competir y por qué" },
  campaignPlan:   { label: "Plan de campaña",                           hint: "Calendario, fases y responsables" },
  visualIdentity: { label: "Identidad de marca y dirección visual",     hint: "Logotipo, colores, tipografías y estilo" },
  photography:    { label: "Fotografía",                                hint: "Ya tiene imágenes propias listas para usar" },
  video:          { label: "Video",                                     hint: "Piezas en video para los canales que lo requieren" },
  graphics:       { label: "Gráficos de campaña",                       hint: "Piezas para anuncios en cada formato" },
  adCopy:         { label: "Textos publicitarios",                      hint: "Titulares y descripciones de los anuncios" },
  landingPage:    { label: "Página de destino",                         hint: "La página a la que llega el tráfico pagado" },
  leadForm:       { label: "Formulario de contacto",                    hint: "Cómo capturas los datos de un interesado" },
  checkoutFlow:   { label: "Ecommerce o proceso de compra",             hint: "El camino completo hasta el pago" },
  eventPage:      { label: "Página de registro al evento",              hint: "Donde la gente reserva su lugar" },
  tracking:       { label: "Seguimiento de conversiones",               hint: "Saber qué anuncio generó qué resultado" },
  analytics:      { label: "Analítica",                                 hint: "Medición del comportamiento en su sitio" },
  pixels:         { label: "Píxeles o etiquetas de las plataformas",    hint: "El código que cada plataforma necesita" },
  successMetrics: { label: "Métricas de éxito definidas",               hint: "En qué números se acuerda que funcionó" },
};

export const esReadinessStates: CalcCopy["readinessStates"] = {
  ready:  { label: "Listo para usar",            short: "Listo" },
  review: { label: "Existe, pero hay que revisarlo", short: "Por revisar" },
  create: { label: "Hay que crearlo",            short: "Por crear" },
  unsure: { label: "No estoy seguro",            short: "No sé" },
};

export const esReadinessBands: CalcCopy["readinessBands"] = {
  scale: {
    label: "Listo para escalar",
    summary: "Está en muy buena forma. La base está hecha, así que la mayor parte de su inversión puede ir a llegar a más gente y a mejorar sobre la marcha.",
  },
  ready: {
    label: "Listo para arrancar",
    summary: "Tiene lo esencial. Un poco de pulido mantiene todo afilado, y su inversión puede concentrarse en poner la campaña frente a la gente.",
  },
  partial: {
    label: "Va a medio camino",
    summary: "Algunas piezas están listas y otras no, lo cual es completamente normal. Su plan reserva inversión para las piezas que aún necesitan atención antes de gastar más en alcance.",
  },
  foundation: {
    label: "Apenas empezando",
    summary: "Hay trabajo de base por hacer, y es un buen punto de partida para ser honestos. Construir el mensaje antes de comprar alcance hace que cada dólar que sigue rinda más.",
  },
};

export const esRelevance: CalcCopy["relevance"] = {
  essential:      "Esencial para este plan",
  recommended:    "Recomendado",
  optional:       "Opcional",
  "not-required": "No se requiere",
};

export const esFeasibilityBands: CalcCopy["feasibilityBands"] = {
  "scope-supported": {
    label: "Su plan está financiado",
    short: "Su inversión cubre el alcance que seleccionó. Aun así revisaríamos los detalles con usted antes de que algo salga al aire.",
  },
  "focused-pilot": {
    label: "Empiece enfocado",
    short: "Una campaña enfocada en un solo canal se ve viable. Abajo encontrarás exactamente qué incluye, qué reutiliza y qué queda para una fase posterior.",
  },
  "campaign-preparation": {
    label: "Primero la base",
    short: "Puede construir la base ahora. Todavía no alcanza para pautar como se debe, así que activaríamos medios en una fase siguiente.",
  },
  "preparation-only": {
    label: "Empiece por la preparación",
    short: "Esta inversión queda por debajo de lo que una campaña necesita para correr con responsabilidad, y saberlo ahora es genuinamente útil. Puede financiar un arranque enfocado de estrategia y configuración, que es un primer paso sólido más que una campaña completa.",
  },
};

export const esFeasibilityScoreLabels = [
  "Alcance completo respaldado",
  "Viable con ajustes",
  "Piloto enfocado",
  "Requiere preparación o revisar el alcance",
];

export const esAudienceBands: CalcCopy["audienceBands"] = {
  unknown:     "Aún no estoy seguro",
  "under-10k": "Menos de 10,000",
  "10k-100k":  "10,000 a 100,000",
  "100k-1m":   "100,000 a 1 millón",
  "over-1m":   "Más de 1 millón",
};

export const esAudienceFocus: CalcCopy["audienceFocus"] = [
  { key: "businesses", label: "Empresas" },
  { key: "consumers",  label: "Consumidores" },
  { key: "both",       label: "Empresas y consumidores" },
  { key: "community",  label: "Donantes, miembros o comunidades" },
];

export const esStages: CalcCopy["stages"] = [
  { key: "new",         label: "Nueva o por lanzar", hint: "Construyendo audiencia desde cero" },
  { key: "growing",     label: "En crecimiento",     hint: "Con algo de tracción, listo para más" },
  { key: "established", label: "Establecida",        hint: "Marca conocida, queremos expandirnos" },
];

export const esReaches: CalcCopy["reaches"] = [
  { key: "local",         label: "Local" },
  { key: "regional",      label: "Regional" },
  { key: "national",      label: "Nacional" },
  { key: "international", label: "Internacional" },
];

export const esDurationPresets: CalcCopy["durationPresets"] = {
  30:  "30 días",
  60:  "60 días",
  90:  "90 días",
  180: "6 meses",
  365: "12 meses",
};

export const esLists: CalcCopy["lists"] = {
  leanScopeAssumptions: [
    "Un canal, un objetivo y una audiencia principal",
    "Un concepto creativo, adaptado al formato del canal",
    "Textos y gráficos limitados, sin producción de foto o video a la medida",
    "Se reutiliza su identidad de marca actual",
    "Se reutiliza su sitio web o tienda actual",
    "Seguimiento básico de conversiones y analítica",
    "Gestión y optimización durante la duración de la campaña",
  ],
  separateScopeAdditions: [
    "Producción de fotografía o video a la medida",
    "Rediseño de marca o identidad nueva",
    "Desarrollo de sitio web o tienda en línea",
    "Integraciones con CRM o automatización",
    "Traducción y adaptación cultural a otros idiomas",
  ],
  scopeLevers: [
    "Usar piezas que ya tiene",
    "Quitar el video",
    "Reducir las variaciones creativas",
    "Quitar canales",
    "Acortar la campaña",
    "Simplificar el destino",
    "Separar la base y la activación en fases",
  ],
  preparationTitle: "Fase de estrategia y configuración",
  preparationInclusions: [
    "Definición del objetivo de campaña y la audiencia",
    "Recomendación de un solo canal",
    "Dirección del mensaje central",
    "Plan básico de activación",
  ],
};

/**
 * Industries. Kept as free text in the model, so this list only seeds the
 * picker; anything the user types is preserved as entered.
 */
export const esIndustries: string[] = [
  "Restaurantes y alimentos",
  "Comercio y ecommerce",
  "Servicios profesionales",
  "Salud y bienestar",
  "Bienes raíces",
  "Construcción y oficios",
  "Educación",
  "Organizaciones sin fines de lucro",
  "Eventos y entretenimiento",
  "Manufactura",
  "Tecnología",
  "Turismo y hospitalidad",
  "Automotriz",
  "Belleza y cuidado personal",
  "Servicios financieros",
  "Legal",
  "Otro",
];

/** Clause fragments folded into "Definido por sus respuestas: …". */
export const esReadinessClauses: Record<string, string> = {
  positioning:     "la audiencia y el posicionamiento aún están por definir",
  objectiveOffer:  "el objetivo de campaña y la respuesta esperada aún están por definir",
  message:         "el mensaje de campaña aún necesita desarrollo",
  channelStrategy: "la estrategia de canales aún está por definir",
  campaignPlan:    "el plan de campaña aún está por construir",
  visualIdentity:  "la dirección visual aún necesita trabajo",
  photography:     "la fotografía aún está por producir",
  video:           "el video aún está por producir",
  graphics:        "los gráficos de campaña aún están por diseñar",
  adCopy:          "los textos publicitarios aún están por escribir",
  landingPage:     "la página de destino aún necesita trabajo",
  leadForm:        "el formulario de contacto aún necesita trabajo",
  checkoutFlow:    "el proceso de compra aún necesita trabajo",
  eventPage:       "la página de registro aún necesita trabajo",
  tracking:        "el seguimiento de conversiones aún no está en su lugar",
  analytics:       "la analítica aún está por configurar",
  pixels:          "el seguimiento de las plataformas aún está por instalar",
  successMetrics:  "las métricas de éxito aún están por acordar",
};
