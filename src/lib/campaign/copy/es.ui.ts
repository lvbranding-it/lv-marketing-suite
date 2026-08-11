// ── Spanish: interface chrome and static prose ──────────────────────────────────
// The wizard, the results screen, and the report. Voice matches the /es/ landing
// pages: warm, direct, "tú", and never softer about the numbers than the English
// version. The calculator's whole value is telling people uncomfortable truths
// kindly; a translation that hedges more than the original would break that.

import type { CalcCopy } from "./types";

export const esMeta: CalcCopy["meta"] = {
  pageTitle:       "Calculadora de Inversión en Campañas | LV Branding",
  pageDescription: "Calcula cómo distribuir la inversión de tu campaña entre estrategia, marca, producción creativa, experiencia digital, medios pagados, gestión y pruebas.",
  productName:     "Calculadora de Inversión en Campañas",
  tagline:         "Una herramienta gratuita de LV Branding",
  slogan:          "PRIMERO LA ESTRATEGIA. SIEMPRE.",
  site:            "www.lvbranding.com",
};

export const esIntro: CalcCopy["intro"] = {
  heading:  "Conoce lo que tu campaña realmente requiere.",
  body:     "Arma un plan de inversión práctico entre estrategia, marca, producción creativa, medios pagados y gestión de campaña, según tus objetivos, tu mercado y lo que ya tienes listo.",
  emphasis: "Los medios amplifican lo que ya existe. Una campaña sólida tiene que financiar tanto el mensaje como su distribución.",
  cta:      "Calcular mi inversión",
  reassurance: "Seis pasos cortos · unos 3 minutos · sin cuenta, y el resultado completo es tuyo",
  resumeLead: "Tienes un plan en progreso.",
  resumeLink: "continuar donde lo dejaste",
};

export const esNav: CalcCopy["nav"] = {
  back:       "Atrás",
  next:       "Siguiente",
  seeResults: "Ver mi plan",
  startOver:  "Empezar de nuevo",
  startOverConfirmTitle: "¿Empezar de nuevo?",
  startOverConfirmBody:  "Esto borra tus respuestas y el plan que armaste. No se puede deshacer.",
  startOverConfirm: "Sí, empezar de nuevo",
  cancel: "Cancelar",
  stepOf: (current, total) => `Paso ${current} de ${total}`,
};

export const esSteps: CalcCopy["steps"] = {
  labels: ["Perfil", "Objetivo", "Alcance", "Destino", "Punto de partida", "Números", "Revisión"],
  titles: [
    "Cuéntanos de tu negocio",
    "¿Qué debe lograr esta campaña?",
    "Define la campaña",
    "¿Qué tienes listo para esta campaña?",
    "¿Cómo quieres planear tu inversión?",
    "Revisa tus respuestas",
  ],
  optional: "(opcional)",
  buildPlan: "Armar mi plan de inversión",

  profile: {
    heading: "Cuéntanos de tu negocio",
    blurb:   "Esto ajusta las recomendaciones a tu mercado y a la etapa en la que estás.",
    audienceFocus: "¿A quién le vendes o le comunicas principalmente?",
    stage:   "¿En qué etapa está el negocio?",
    reach:   "¿Hasta dónde llega tu mercado?",
    industry: "Industria",
    industryPlaceholder: "Elige una industria",
    currency: "Moneda",
  },

  objective: {
    heading: "¿Cuál es el resultado que esta campaña existe para producir?",
    blurb:   "Elige el resultado principal. Todo lo demás se dimensiona a partir de esto.",
    footer:  "Las campañas que intentan hacer de todo casi nunca miden nada. Elige el resultado principal; los beneficios secundarios igual ocurren, solo que no dirigen el plan.",
  },

  scope: {
    heading: "¿Qué tan grande es la campaña?",
    blurb:   "La duración, los canales y el tamaño de la audiencia determinan cuánto trabajo y cuánta pauta necesita.",
    duration: "¿Cuánto va a durar?",
    customDuration: "Otra",
    days: "días",
    durationLabel: "Duración de la campaña",
    alwaysOn: "Siempre activa",
    alwaysOnHint: "Corre de forma continua, puede empezar cuando sea",
    fixedDate: "Con fecha fija",
    fixedDateHint: "Fecha fija: evento, lanzamiento, temporada",
    channels: "¿Qué canales de publicidad estás considerando?",
    channelsHint: "Elige solo los que realmente vas a operar. Menos canales bien hechos rinden más que muchos a medias.",
    channelsSelected: (n) => `${n} ${n === 1 ? "seleccionado" : "seleccionados"}. El plan te dirá cuántos respalda tu presupuesto de forma realista.`,
    audience: "Tamaño estimado de la audiencia",
    timing: "Temporalidad",
    durationDays: "Duración en días",
    audienceHint: "Un estimado está bien. Si no sabes, elige “No estoy seguro”.",
    timeSensitive: "¿Tiene una fecha fija?",
    timeSensitiveHint: "Un evento o lanzamiento concentra la inversión; una campaña siempre activa la distribuye.",
  },

  destination: {
    heading: "¿A dónde debe ir la gente, o qué debe hacer, después de ver la campaña?",
    blurb:   "Esto define qué piezas del destino importan de verdad para tu campaña.",
  },

  readiness: {
    heading: "¿Qué tienes listo hoy?",
    blurb:   "Sé honesto aquí; nadie tiene todo listo. Lo que falte se convierte en presupuesto, no en un regaño.",
    relevanceNote: "Solo preguntamos por lo que esta campaña realmente necesita, según tu objetivo, tus canales y tu destino.",
    notApplicable: "No aplica para esta campaña",
    intro: "No todas las campañas necesitan los mismos materiales. Según tu objetivo y los canales que elegiste, identificamos qué es esencial, recomendado u opcional para este plan. Dinos qué se puede usar con confianza hoy; si algo existe pero podría mejorar, elige \"Hay que revisarlo\".",
    introEmphasis: "No necesitas todos los elementos de la lista.",
    answeredOf: (a, t) => `${a} de ${t} respondidos`,
    notRequiredFor: (n) => `No se requiere para este plan (${n})`,
    unansweredNote: "Todo lo que quede sin responder se planea como si aún estuviera por crear.",
    markRestUnsure: 'Marcar el resto de esta sección como "No estoy seguro"',
  },

  financial: {
    heading: "¿Cómo quieres planear?",
    blurb:   "Puedes partir de un presupuesto o de una meta. Lo que no sepas, lo llenamos con un supuesto que puedes editar.",
    modeBudget: "Tengo un presupuesto",
    modeGoal:   "Tengo una meta",
    budgetTotal: "Inversión total disponible",
    goalCount:   "Resultados que buscas",
    avgValue:    "Valor promedio por cliente",
    conversionRate: "Tasa de conversión",
    costPerResult:  "Costo estimado por resultado",
    targetFrequency: "Frecuencia deseada",
    marginPct:  "Margen bruto",
    expectedRevenue: "Ingreso esperado",
    assumptionBadge: "Supuesto de planeación",
    optional: "opcional",
    budgetHint: "Todo: estrategia, creatividad, medios y gestión, no solo la pauta.",
    marginHint: "Aproximadamente lo que queda de cada venta después de los costos directos.",
    modeBudgetHint: "Parte de la inversión que tienes disponible y arma una distribución equilibrada.",
    modeGoalHint: "Parte del objetivo de tu campaña y estima lo que podría requerir.",
    breakEvenHeading: "Para el análisis de punto de equilibrio",
    breakEvenHint: "(opcional, habilita la vista de punto de equilibrio)",
  },

  review: {
    heading: "Revisa tus respuestas",
    blurb:   "Una revisión rápida antes de armar el plan. Puedes volver a cualquier paso sin perder tus respuestas.",
    edit:    "Editar",
    rowBusiness: "Negocio",
    rowObjective: "Objetivo",
    rowScope: "Alcance",
    rowReadiness: "Lo que tienes",
    rowFinancials: "Números",
    scopeValue: (duration, channels, timeSensitive) =>
      `${duration} · ${channels} ${channels === 1 ? "canal" : "canales"} · ${timeSensitive ? "con fecha fija" : "siempre activa"}`,
    readinessValue: (destination, phrase, ready, total) =>
      `${destination} · ${phrase} · ${ready} de ${total} ${total === 1 ? "pieza esencial lista" : "piezas esenciales listas"}`,
    destinationMissing: "Destino sin seleccionar",
    foundationNeedsWork: "La base de la campaña necesita desarrollo",
    partiallyPrepared: "Parcialmente preparado",
    budgetFirst: (amount) => `Desde el presupuesto · ${amount}`,
    goalFirstLabel: "Desde la meta",
    audienceReach: "de alcance de audiencia",
    frequencyLabel: (n) => `Frecuencia ${n}`,
    cpmLabel: (amount, assumed) => `CPM de ${amount}${assumed ? " (supuesto)" : ""}`,
    estimatedImpressions: (n) => `${n} impresiones estimadas`,
    assumption: "supuesto",
  },
};

export const esErrors: CalcCopy["errors"] = {
  "profile.audienceFocus": "Elige a quién le habla la campaña.",
  "profile.stage":         "Elige la etapa del negocio.",
  "profile.reach":         "Elige el alcance de tu mercado.",
  "profile.industry":      "Escribe o elige tu industria.",
  objective:               "Elige un objetivo para la campaña.",
  "scope.durationDays":    "La duración debe ser de al menos 7 días.",
  "scope.channels":        "Elige al menos un canal.",
  destination:             "Elige qué debe hacer la gente.",
  "financial.budgetTotal": "Escribe una inversión disponible.",
  "financial.goalCount":   "Escribe cuántos resultados buscas.",
  "financial.avgValue":    "Escribe el valor promedio por cliente.",
  "financial.marginPct":   "El margen debe estar entre 1% y 95%.",
  "financial.conversionRate": "La conversión debe estar entre 0.1% y 100%.",
  "financial.costPerResult":  "Escribe un costo por resultado válido.",
  "financial.targetFrequency": "La frecuencia debe estar entre 1 y 20.",
};

export const esResults: CalcCopy["results"] = {
  heading: "Tu plan de inversión en campaña",
  blurb:   "Según tus objetivos y tu punto de partida, aquí hay tres formas de hacerlo. Son estimados de planeación para ayudarte a decidir, no una garantía de lo que hará una campaña.",
  recommended: "Recomendado",
  whyThisAmount: "¿Por qué este monto?",
  whySuggest: "Por qué lo sugerimos:",
  protectedInvestment: "Inversión protegida de campaña",
  mediaDistribution: "Distribución en medios",
  campaignReserve: "Reserva de campaña",
  allocationTitle: "Asignación de campaña",
  adjustAllocation: "Ajustar la asignación",
  resetAllocation: "Volver a la recomendación",
  lockCategory: "Fijar esta categoría",
  unlockCategory: "Liberar esta categoría",
  categoryMinimum: "Mínimo de la categoría:",
  tableView: "Ver como tabla",
  print: "Imprimir",
  copySummary: "Copiar resumen",
  copied: "Copiado",
  adjustAnswers: "Ajustar respuestas",
  totalInvestment: "Inversión total",
  campaignAllocation: "Asignación de campaña",
  amount: "Monto",
  share: "Porcentaje",
  category: "Categoría",
  currentPhaseAllocation: "Asignación de esta fase",
  protectedBlurb:    "Este es el trabajo que hace que valga la pena correr una campaña: estrategia, creatividad, el lugar donde aterriza la gente, operarla y mejorarla.",
  belowMinimumBlurb: (leanRange) => `Esto es lo que financia la fase actual. Queda por debajo del mínimo austero de ${leanRange}, así que no la vamos a llamar inversión protegida de campaña.`,
  mediaBlurb:        "Lo que le pagas a las plataformas por poner tu campaña frente a la gente.",
  reserveBlurb:      "Reservado para cambios que autorices, imprevistos de producción u una oportunidad que valga la pena aprovechar mientras la campaña está al aire.",
  identity: ({ protectedAmount, media, reserve, total, funded }) =>
    `${protectedAmount} ${funded ? "protegidos" : "en esta fase"} + ${media} en medios + ${reserve} de reserva = ${total} en total. El presupuesto de medios compra distribución; la inversión protegida de campaña financia la estrategia, la producción creativa, la infraestructura digital, la gestión y la optimización necesarias para que esa distribución sea intencional y medible.`,
  preparationPhase:  "Fase de preparación",
  focusedPilot:      "Piloto enfocado",
  prepSprintTagline: "Sprint de estrategia y configuración · sin activación de medios",
  noMediaActivation: "Sin activación de medios con esta inversión",
  reducedScope:      (n) => `Alcance reducido · ${n} ${n === 1 ? "canal" : "canales"}`,
  scopeChannels:     (tagline, n) => `${tagline} · ${n} ${n === 1 ? "canal" : "canales"}`,
  prepOnlyNote:      "Esto financia solo la preparación. No es una campaña completa y no incluye activación de medios.",
  reducedScopeNote:  (selected) => `Este es un plan de alcance reducido, no la campaña completa de ${selected} ${selected === 1 ? "canal" : "canales"} que seleccionaste al principio.`,
  extraNeeded:       (amount) => `unos ${amount} más`,
  mediaAdjustable:   "Ajustable. Reducir medios reduce alcance, canales o duración.",
  floorDeferred:     (a) => `Mínimo austero de la categoría: ${a} (queda fuera de esta fase)`,
  floorPartial:      (a) => `Mínimo austero de la categoría: ${a} (financiado parcialmente en esta fase)`,
  floorPlain:        (a) => `Mínimo austero de la categoría: ${a}`,
  floorProtected:    "Esta cubre trabajo del que depende la campaña. Para bajarla, cambiaríamos el alcance en lugar de quitar el trabajo.",
  bestFitBadge:      "La mejor opción para tu presupuesto",
  tableCaption:      "Distribución del escenario seleccionado por categoría",
  rebalanceNote:     "Subir una categoría redistribuye proporcionalmente las que no están fijadas, así que el plan siempre suma 100%. Las categorías protegidas no pueden bajar del trabajo del que depende la campaña.",
  scopeLeversTitle:  "Formas responsables de reducirlo",
  breakEvenLead:     (profit, unitSingular, units, unitNoun) =>
    `Con unos ${profit} de utilidad bruta por ${unitSingular}, este escenario llega al punto de equilibrio alrededor de ${units} ${unitNoun}.`,
};

export const esCards: CalcCopy["cards"] = {
  startingPoint:     "Tu punto de partida",
  budgetCanDo:       "Qué puede hacer tu inversión",
  phaseScope:        "Qué haríamos en esta fase",
  worthChecking:     "Algunas cosas que vale la pena revisar",
  breakEven:         "Punto de equilibrio",
  allocationDetail:  "Para qué es cada asignación",
  otherScenarios:    "Las otras formas de hacerlo",
  assumptions:       "Los supuestos detrás de estos números",
  disclaimerHeading: "Léelo junto con los números",
};

export const esMeters: CalcCopy["meters"] = {
  readiness:   ["Empezando", "A medias", "Listo", "Escalar"],
  feasibility: ["Preparación", "Base", "Piloto", "Alcance completo"],
};

export const esProse: CalcCopy["prose"] = {
  readinessMeterNote:
    "Solo contamos las piezas que esta campaña en particular realmente necesita. No es una calificación de tu negocio, es simplemente desde dónde estás empezando, y evita que la pauta se adelante al mensaje.",
  startingPointFooter:
    "Tu punto de partida es sobre lo que ya tienes. Esto es sobre hasta dónde puede llegar tu dinero de forma realista. Todas las cifras son estimados de planeación basados en referencias de mercado, no cotizaciones de LV Branding.",
  feasibilityFooter:
    "Todas las cifras son estimados de planeación basados en referencias de mercado, no cotizaciones de LV Branding, y con gusto las repasamos contigo.",
  allocationFooter:
    "Los montos describen capacidad de planeación, no una cotización; lo que cuesten los entregables específicos depende del alcance y del mercado. Nada aquí te compromete (ni a ti ni a LV Branding) a un precio.",
  breakEvenFooter:
    "El ingreso no es utilidad: la utilidad bruta proyectada ya resta los costos directos con tu margen, pero no la inversión de campaña. Estas cifras salen de tus propios supuestos; son aritmética de planeación, no un pronóstico.",
  scenariosFooter:
    "Los escenarios cambian el alcance: cobertura, número de canales, cobertura creativa y profundidad de pruebas. No son el mismo plan a tres precios.",
  assumptionsFooter:
    "Los valores marcados como supuesto de planeación no los proporcionaste; se usó un punto de partida en su lugar. Son los primeros números que vale la pena reemplazar con los tuyos.",
  nothingWorthChecking:
    "No hay nada que resalte como problema. El equilibrio entre base, alcance y pruebas se ve proporcionado a lo que nos contaste.",
  preparationCaveat:
    "Para que quede claro: pautar anuncios y entregar una campaña completa no son parte de esta fase.",
  quotedSeparately: "Se cotiza por separado",
  deferredFromPhase: "Queda fuera de esta fase",
  waysForward: "Caminos posibles",
  disclaimer:
    "Este reporte contiene estimados de planeación basados en la información y los supuestos que se ingresaron. Los costos publicitarios reales y el desempeño de una campaña varían según industria, mercado, audiencia, plataforma, competencia, calidad creativa y ejecución. Los resultados no están garantizados. Las cifras de mercado son referencias de planeación, no cotizaciones ni precios garantizados, y nada aquí te compromete ni compromete a LV Branding a un precio. Esta herramienta es solo para fines de planeación y no constituye asesoría financiera.",
  disclaimerPrepared:
    "Preparado con la Calculadora de Inversión en Campañas de LV Branding. Con gusto repasamos contigo cualquier parte.",
  privacy:
    "Tus respuestas se guardan en este navegador para que puedas volver a ellas, y ahí se quedan. Nada nos llega a menos que decidas enviarnos tu plan con el formulario de arriba.",
  howEstimatesWork: "Cómo funcionan estos estimados",
  howEstimatesBody: [
    "Las asignaciones parten de rangos de planeación configurables (por ejemplo, los medios pagados suelen quedar entre 30% y 55% del presupuesto de campaña) y se adaptan a tus respuestas: las bases que faltan mueven presupuesto hacia estrategia, creatividad y experiencia digital; una base completa libera más hacia medios. Los tres escenarios cambian el alcance (cobertura, número de canales, cobertura creativa y profundidad de pruebas) en lugar de multiplicar un solo número.",
    "Los estimados que parten de una meta convierten tu meta en presupuesto de medios usando los valores de costo y conversión que ingresaste (o que aceptaste como supuestos de planeación), y luego dimensionan la inversión alrededor para que la distribución no se financie a costa del mensaje. Donde aparece un valor por defecto, es un punto de partida para editar, no un referente, ni una promesa de lo que tu mercado va a cobrar realmente.",
    "Esta herramienta es solo para fines de planeación y no constituye asesoría financiera.",
  ],
};

export const esReport: CalcCopy["report"] = {
  planningEstimate: "Estimado de planeación",
  notAQuote:        "No es una cotización",
  pageOf:           (page, total) => `Página ${page} de ${total}`,
  channelsLine:     (channels) => `Canales: ${channels}`,
  contradictionsTitle: "Vale la pena resolver esto antes de confiar en el plan.",
  figures: {
    planAtAGlance:        "Tu plan de un vistazo",
    allocationHeading:    "Cómo se distribuye la inversión",
    couldCover:           "Puede cubrir:",
    shapedBy:             "Definido por tus respuestas:",
    planShown:            "Plan mostrado",
    objective:            "Objetivo",
    campaignLength:       "Duración de la campaña",
    channelsSelected:     "Canales seleccionados",
    destination:          "Destino de la campaña",
    audienceSize:         "Tamaño de audiencia",
    industry:             "Industria",
    marketReach:          "Alcance de mercado",
    businessStage:        "Etapa del negocio",
    timing:               "Temporalidad",
    feasibilityScore:     "Puntaje de viabilidad",
    available:            "Inversión disponible",
    leanMinimum:          "Mínimo profesional",
    completeScope:        "Alcance completo seleccionado",
    gapMinimum:           "Faltante para el mínimo",
    gapComplete:          "Faltante para el alcance completo",
    mediaAvailable:       "Medios disponibles tras los requisitos protegidos",
    channelsSupported:    "Canales con respaldo a ese nivel de medios",
    essentialsReady:      "Piezas esenciales listas",
    componentsToReview:   "Componentes aplicables por revisar",
    estimatedUnits:       "Resultados estimados de este plan",
    projectedRevenue:     "Ingreso proyectado",
    projectedGrossProfit: "Utilidad bruta proyectada",
    planInvestment:       "Inversión del plan",
    planningMode:         "Modo de planeación",
    budgetFirst:          "Desde el presupuesto",
    goalFirst:            "Desde la meta",
    statedBudget:         "Presupuesto indicado",
    goal:                 "Meta",
    avgValue:             "Valor promedio por cliente",
    conversionRate:       "Tasa de conversión",
    costPerResult:        "Costo por resultado",
    targetFrequency:      "Frecuencia deseada",
    marginPct:            "Margen bruto",
    expectedRevenue:      "Ingreso esperado",
    totalInvestment:      "Inversión total",
    campaignReserve:      "Reserva de campaña",
  },
  tableHeaders: {
    component:      "Componente",
    mattersHere:    "Importancia aquí",
    whereYouAre:    "Cómo estás",
    scenario:       "Escenario",
    estimatedRange: "Rango estimado",
    whatItChanges:  "Qué cambia",
  },
};

/** "$6,000 a $9,000" reads correctly in Spanish; "to" does not. */
export const esFormatRange: CalcCopy["formatRange"] = (r, formatMoney) =>
  `${formatMoney(r.min)} a ${formatMoney(r.max)}`;
