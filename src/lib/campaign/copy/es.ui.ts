// ── Spanish: interface chrome and static prose ──────────────────────────────────
// The wizard, the results screen, and the report. Voice matches the /es/ landing
// pages: warm, direct, "usted", and never softer about the numbers than the English
// version. The calculator's whole value is telling people uncomfortable truths
// kindly; a translation that hedges more than the original would break that.

import type { CalcCopy } from "./types";

export const esMeta: CalcCopy["meta"] = {
  pageTitle:       "Calculadora de inversión para campañas publicitarias",
  pageDescription: "Con esta herramienta exclusiva puede calcular cómo distribuir la inversión de su campaña entre estrategia, marca, producción creativa, experiencia digital, medios pagados, gestión y pruebas.",
  productName:     "Calculadora de inversión para campañas publicitarias",
  tagline:         "Desarrollada para usted por LV Branding",
  byline:          "por LV Branding",
  slogan:          "La Estrategia es lo primero. Siempre",
  site:            "www.lvbranding.com",
};

export const esIntro: CalcCopy["intro"] = {
  heading:  "Descubra qué necesita su campaña",
  body:     "Obtenga un plan práctico para distribuir su presupuesto entre estrategia, marca, producción creativa, medios pagados y gestión, según sus objetivos, su mercado y los activos que ya tiene.",
  emphasis: "Los medios amplifican lo que ya existe. Una campaña sólida debe financiar tanto el mensaje como su producción y distribución.",
  cta:      "Calcule su inversión publicitaria",
  reassurance: "Seis sencillos pasos · 3 minutos · sin tener que registrar una cuenta, y además el resultado completamente suyo",
  resumeLead: "Notamos que tiene un plan en progreso",
  resumeLink: "Continúe con su plan desde donde lo dejó",
  eyebrow: "Planificador gratuito de inversión en campañas",
  headingEmphasis: "antes de invertir el primer dólar",
  cards: [
    {
      title: "Calculado con sus datos, no con promedios",
      body: "Cada cifra sale de su objetivo, su mercado, sus tiempos, sus canales y los activos de marca que ya tiene. No de un promedio de industria que nunca se trató de usted.",
    },
    {
      title: "Le dice cuando la respuesta es no",
      body: "Si el presupuesto no alcanza para la campaña que describió, la herramienta se lo dice y le muestra cómo se ve una primera fase sensata.",
    },
    {
      title: "Un plan, no un porcentaje",
      body: "Sale con una distribución entre seis categorías, tres escenarios y el razonamiento detrás de cada número.",
    },
  ],
  categoriesEyebrow: "Un presupuesto. Seis destinos.",
  categoriesHeading: "Más útil que una regla de porcentajes.",
  categoriesBody: "El plan reparte su inversión entre seis categorías y explica por qué se financia cada una. Es una estimación de planificación que puede ajustar, no una cotización ni una promesa de resultados.",
  stepsHeading: "Qué pasa después de empezar",
  steps: [
    { number: "01", title: "Responda seis preguntas cortas", body: "Su objetivo, su mercado, los tiempos, los canales y los activos de marca que ya puede usar." },
    { number: "02", title: "Armamos la distribución", body: "Su presupuesto se reparte entre las seis categorías, y se señala lo que queda corto." },
    { number: "03", title: "Llévese el plan", body: "El desglose completo, tres escenarios y un PDF que conserva hable o no con nosotros." },
  ],
  badges: ["Sin cuenta", "Resultado sin correo", "English + Español"],
};

export const esNav: CalcCopy["nav"] = {
  back:       "Atrás",
  next:       "Siguiente",
  seeResults: "Ver mi plan",
  startOver:  "Quiero empezar de nuevo",
  startOverConfirmTitle: "¿Quiere empezar de nuevo?",
  startOverConfirmBody:  "Si acepta borrará sus respuestas y el plan que armó. Esta acción no se puede deshacer.",
  startOverConfirm: "Sí, quiero empezar de nuevo",
  cancel: "No, prefiero cancelar",
  stepOf: (current, total) => `Paso ${current} de ${total}`,
};

export const esSteps: CalcCopy["steps"] = {
  labels: ["Perfil", "Objetivo", "Alcance", "Destino", "Punto de partida", "Números", "Revisión"],
  titles: [
    "Cuéntenos acerca de su negocio",
    "¿Qué objetivo debe lograr esta campaña?",
    "¿Cómo se define su campaña?",
    "¿Qué activos de marca tiene listo para esta campaña?",
    "¿Cómo quiere planear su inversión?",
    "Revise sus respuestas",
  ],
  optional: "(opcional)",
  buildPlan: "Armar mi plan de inversión",

  profile: {
    heading: "Cuéntenos acerca de su negocio",
    blurb:   "Nuestro sistema ajusta las recomendaciones a su mercado y a la etapa en la que está, para que pueda ver con mayor precisión sus resultados.",
    audienceFocus: "¿A quién quiere vender o con quién se comunica principalmente?",
    stage:   "¿En qué etapa de madurez está el negocio?",
    reach:   "¿Qué tan amplia es su presencia en el mercado?",
    industry: "Industria",
    industryPlaceholder: "Elija una industria",
    currency: "Moneda",
  },

  objective: {
    heading: "¿Cuál es el resultado que quiere obtener con esta campaña?",
    blurb:   "Elija el resultado principal. Todo lo demás se dimensiona a partir de esto.",
    footer:  "Las campañas que intentan abarcar mucho usualmente logran poco o nada. Asegúrese de elegir bien el resultado principal; los beneficios secundarios igual ocurren, solo que son el resultado de un buen plan.",
  },

  scope: {
    heading: "¿Cuál es el alcance de su campaña?",
    blurb:   "La duración, los canales y el tamaño de la audiencia determinan cuánto tiempo de desarrollo y cuántas pautas necesitan cubrirse.",
    duration: "¿Cuánto va a durar?",
    customDuration: "Otra",
    days: "días",
    durationLabel: "Duración de la campaña",
    alwaysOn: "Quiero una campaña que esté siempre activa",
    alwaysOnHint: "Corre de forma continua y puede empezar cuando sea",
    fixedDate: "Mi campaña tiene un rango de tiempo fijo",
    fixedDateHint: "Fecha fija: evento, lanzamiento, temporada",
    channels: "¿Qué canales publicitarios está considerando?",
    channelsHint: "Elija solo los que realmente va a operar y que se adaptan a un presupuesto realista. Menos canales bien alcanzados rinden más que muchos a medias.",
    channelsSelected: (n) => `${n} ${n === 1 ? "seleccionado" : "seleccionados"}. El plan le dirá cuántos respalda su presupuesto de forma realista.`,
    audience: "Tamaño estimado de la audiencia (A cuantas personas quiere que esté expuesta su campaña)",
    timing: "¿Qué tiempo esperas que dure su campaña?",
    durationDays: "Duración en días",
    audienceHint: "Un estimado está bien. Si no sabe, elija “No estoy seguro”.",
    timeSensitive: "¿Tiene una fecha fija?",
    timeSensitiveHint: "Un evento o lanzamiento concentra la inversión; una campaña siempre activa la distribuye.",
  },

  destination: {
    heading: "En términos de conversión. ¿Qué acción deseas que la gente ejerza después de ver la campaña?",
    blurb:   "La respuesta a esta pregunta define qué lugar de aterrizaje medible y que piezas del destino importan de verdad para su campaña.",
  },

  readiness: {
    heading: "Si tuvieras que lanzar su campaña en este momento ¿Qué recursos de marca tiene listo hoy?",
    blurb:   "Sea honesto aquí; ninguna campaña tiene todo listo antes del lanzamiento. Esta es una herramienta de planificación y de preparación para que su campaña sea exitosa, para que su inversión publicitaria regrese convertida en un extraordinario Retorno de Inversión (ROI)",
    relevanceNote: "Solo preguntamos por lo que esta campaña realmente necesita, según su objetivo, sus canales y su destino.",
    notApplicable: "No aplica para esta campaña",
    intro: "No todas las campañas necesitan los mismos materiales audiovisuales, o de contenido. Según su objetivo y los canales que eligió, identificamos qué es esencial, recomendado u opcional para este plan. Dinos qué se puede usar con confianza hoy; si algo existe pero podría mejorar, elija \"Hay que revisarlo\".",
    introEmphasis: "No necesita todos los elementos de la lista.",
    answeredOf: (a, t) => `${a} de ${t} respondidos`,
    notRequiredFor: (n) => `No se requiere para este plan (${n})`,
    unansweredNote: "Todo lo que quede sin responder se planea como si aún estuviera por crear.",
    markRestUnsure: 'Marcar el resto de esta sección como "No estoy seguro"',
  },

  financial: {
    heading: "¿Cómo quiere planear su campaña?",
    blurb:   "Su campaña la puede planear partir de un presupuesto o de una meta. Lo que no sepas, lo llenaremos con una presunción que puede editar cuando quieras.",
    modeBudget: "Ya tengo tengo un presupuesto para esto",
    modeGoal:   "Tengo una meta clara acerca de lo que quiero lograr en esta campaña",
    budgetTotal: "Inversión total disponible",
    goalCount:   "Resultados que busca",
    avgValue:    "Valor promedio por cliente",
    conversionRate: "Tasa de conversión",
    costPerResult:  "Costo estimado por resultado",
    targetFrequency: "Frecuencia deseada",
    marginPct:  "Margen bruto",
    expectedRevenue: "Ingreso esperado",
    assumptionBadge: "Supuesto de planificación",
    optional: "opcional",
    budgetHint: "Todo: estrategia, creatividad, medios y gestión, no solo la pauta.",
    marginHint: "Aproximadamente lo que queda de cada venta después de los costos directos.",
    modeBudgetHint: "Parte de la inversión que tiene disponible y lista para una distribución equilibrada.",
    modeGoalHint: "Comienza con el objetivo de su campaña y calcula lo que podrías requerir para lograrla.",
    breakEvenHeading: "Para el análisis de punto de equilibrio",
    breakEvenHint: "(opcional, habilita la vista de punto de equilibrio)",
  },

  review: {
    heading: "Revise sus respuestas",
    blurb:   "Una revisión rápida antes de armar el plan. Puede volver a cualquier paso sin perder sus respuestas.",
    edit:    "Editar",
    rowBusiness: "Negocio",
    rowObjective: "Objetivo",
    rowScope: "Alcance",
    rowReadiness: "Lo que tiene",
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
  "profile.audienceFocus": "Elija a quién le habla la campaña.",
  "profile.stage":         "Elija la etapa del negocio.",
  "profile.reach":         "Elija el alcance de su mercado.",
  "profile.industry":      "Escriba o elija su industria.",
  objective:               "Elija un objetivo para la campaña.",
  "scope.durationDays":    "La duración debe ser de al menos 7 días.",
  "scope.channels":        "Elija al menos un canal.",
  destination:             "Elija qué debe hacer la gente.",
  "financial.budgetTotal": "Escriba una inversión disponible.",
  "financial.goalCount":   "Escriba cuántos resultados busca.",
  "financial.avgValue":    "Escriba el valor promedio por cliente.",
  "financial.marginPct":   "El margen debe estar entre 1% y 95%.",
  "financial.conversionRate": "La conversión debe estar entre 0.1% y 100%.",
  "financial.costPerResult":  "Escriba un costo por resultado válido.",
  "financial.targetFrequency": "La frecuencia debe estar entre 1 y 20.",
};

export const esResults: CalcCopy["results"] = {
  heading: "Su plan de inversión para esta campaña",
  blurb:   "Según sus objetivos y su punto de partida, aquí hay tres formas de hacerla. Estos son estimados de planeación para ayudarte a decidir, en ningún caso es una garantía del resultado de esta o ninguna campaña sin el acompañamiento profesional.",
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
  protectedBlurb:    "Estos son los elementos que hacen que valga la pena correr una campaña: estrategia, creatividad, la página de aterrizaje (Landing page), recursos indispensables para operarla y mejorarla.",
  belowMinimumBlurb: (leanRange) => `Esto es lo que financia la fase actual. Queda por debajo del mínimo austero de ${leanRange}, así que no la vamos a llamar inversión protegida de campaña.`,
  mediaBlurb:        "El monto que inviertes en las plataformas o medios publicitarios para poner su campaña frente a la gente.",
  reserveBlurb:      "Reservado para cambios que autorices, imprevistos de producción o una oportunidad que valga la pena aprovechar mientras la campaña está al aire.",
  identity: ({ protectedAmount, media, reserve, total, funded }) =>
    `${protectedAmount} ${funded ? "protegidos" : "en esta fase"} + ${media} en medios + ${reserve} de reserva = ${total} en total. El presupuesto de medios compra distribución; la inversión protegida de campaña financia la estrategia, la producción creativa, la infraestructura digital, la gestión y la optimización necesarias para que esa distribución sea intencional y medible.`,
  preparationPhase:  "Fase de preparación",
  focusedPilot:      "Enfocada en la fase piloto",
  prepSprintTagline: "En la fase de estrategia y configuración · aún sin activación de medios",
  noMediaActivation: "Sin activación de medios con esta inversión",
  reducedScope:      (n) => `Alcance reducido · ${n} ${n === 1 ? "canal" : "canales"}`,
  scopeChannels:     (tagline, n) => `${tagline} · ${n} ${n === 1 ? "canal" : "canales"}`,
  prepOnlyNote:      "Este monto financia solo la fase de preparación, esta base permite estar listo para una futura activación. No es una campaña completa y no incluye pauta publicitaria en ningún medio.",
  reducedScopeNote:  (selected) => `Este es un plan de alcance reducido, no la campaña completa de ${selected} ${selected === 1 ? "canal" : "canales"} que seleccionó al principio.`,
  extraNeeded:       (amount) => `unos ${amount} más`,
  mediaAdjustable:   "Ajustable. Al reducir los medios se reduce alcance, canales o duración.",
  floorDeferred:     (a) => `Mínimo austero de la categoría: ${a} (queda fuera de esta fase)`,
  floorPartial:      (a) => `Mínimo austero de la categoría: ${a} (financiado parcialmente en esta fase)`,
  floorPlain:        (a) => `Mínimo austero de la categoría: ${a}`,
  floorProtected:    "Esta cubre trabajo del que depende la campaña. Para bajarla, cambiaríamos el alcance en lugar de quitar el trabajo.",
  bestFitBadge:      "La mejor opción para su presupuesto",
  tableCaption:      "Distribución del escenario seleccionado por categoría",
  rebalanceNote:     "Subir una categoría redistribuye proporcionalmente las que no están fijadas, así que el plan siempre suma 100%. Las categorías protegidas no pueden bajar del trabajo del que depende la campaña.",
  scopeLeversTitle:  "Formas responsables de reducirlo",
  breakEvenLead:     (profit, unitSingular, units, unitNoun) =>
    `Con unos ${profit} de utilidad bruta por ${unitSingular}, este escenario llega al punto de equilibrio alrededor de ${units} ${unitNoun}.`,
};

export const esCards: CalcCopy["cards"] = {
  startingPoint:     "El punto de partida de su campaña",
  budgetCanDo:       "Qué puede hacer su inversión",
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
    "Solo contamos las piezas que esta campaña en particular realmente necesita. No es una calificación de su negocio, es simplemente desde dónde está empezando, y evita que la pauta se adelante al mensaje.",
  startingPointFooter:
    "Su punto de partida es sobre lo que ya tiene. Esto es sobre hasta dónde puede llegar su dinero de forma realista. Todas las cifras son estimadas y de planeación basadas en referencias de mercado, en ningún caso es una cotización final de LV Branding.",
  feasibilityFooter:
    "Todas las cifras son estimados de planeación basados en referencias de mercado, no cotizaciones de LV Branding, con gusto podríamos revisarlo con usted.",
  allocationFooter:
    "Los montos describen capacidad de planeación, no una cotización; lo que cuesten los entregables específicos depende del alcance y del mercado. Nada aquí lo compromete (ni a usted ni a LV Branding) a un precio final, este sistema le da una importante herramienta de planificación de costos, ha sido desarrollada con el conocimiento y la experiencia de 28 años, sin embargo, es necesaria una revisión final en un caso real y específico.",
  breakEvenFooter:
    "El ingreso no es utilidad: la utilidad bruta proyectada ya resta los costos directos con su margen, pero no la inversión de campaña. Estas cifras salen de los supuestos que usted contestó; son aritmética de planeación, no un pronóstico.",
  scenariosFooter:
    "Los escenarios cambian el alcance: cobertura, número de canales, cobertura creativa y profundidad de pruebas. No son el mismo plan a tres precios.",
  assumptionsFooter:
    "Los valores marcados como supuesto de planeación no los proporcionó al principio; estos se usaron como punto de partida en su lugar. Son los primeros números que vale la pena reemplazar con los tuyos.",
  nothingWorthChecking:
    "No hay nada que resalte como problema. El equilibrio entre base, alcance y pruebas se ve proporcionado a lo que nos contó.",
  preparationCaveat:
    "Una importante aclaratoria: pautar anuncios y entregar una campaña completa no son parte de esta fase.",
  quotedSeparately: "Se cotiza por separado",
  deferredFromPhase: "Queda fuera de esta fase",
  waysForward: "Caminos posibles",
  disclaimer:
    "Este reporte contiene estimados de planeación basados en la información y los supuestos que se ingresaron. Los costos publicitarios reales y el desempeño de una campaña varían según industria, mercado, audiencia, plataforma, competencia, calidad creativa y ejecución. Los resultados no están garantizados. Las cifras de mercado son referencias de planeación, no cotizaciones ni precios garantizados, y nada aquí te compromete ni compromete a LV Branding a un precio. Esta herramienta es solo para fines de planeación, cálculo y análisis y en ningún caso constituye una asesoría financiera.",
  disclaimerPrepared:
    "Preparado con la Calculadora de Inversión en Campañas de LV Branding. Estamos listos para repasar, revisar y planificar con usted cualquier parte.",
  privacy:
    "Sus respuestas se guardan en este navegador para que pueda volver a ellas, y ahí se quedan. Este sistema no almacena ninguna información a menos que decidas enviarnos su plan con el formulario de arriba.",
  howEstimatesWork: "Cómo funcionan estos estimados",
  howEstimatesBody: [
    "Las asignaciones parten de rangos de planeación configurables (por ejemplo, los medios pagados suelen quedar entre 30% y 55% del presupuesto de campaña) y se adaptan a sus respuestas: las bases que faltan mueven presupuesto hacia estrategia, creatividad y experiencia digital; una base completa libera más hacia medios. Los tres escenarios cambian el alcance (cobertura, número de canales, cobertura creativa y profundidad de pruebas) en lugar de multiplicar un solo número.",
    "Los estimados que parten de una meta convierten su meta en presupuesto de medios usando los valores de costo y conversión que ingresó (o que aceptó como supuestos de planeación), y luego dimensionan la inversión alrededor para que la distribución no se financie a costa del mensaje. Donde aparece un valor por defecto, es un punto de partida para editar, no un referente, ni una promesa de lo que su mercado va a cobrar realmente.",
    "Esta herramienta es solo para fines de planeación y no constituye asesoría financiera.",
  ],
};

export const esReport: CalcCopy["report"] = {
  planningEstimate: "Estimado de planeación",
  notAQuote:        "Esto NO es una cotización",
  pageOf:           (page, total) => `Página ${page} de ${total}`,
  channelsLine:     (channels) => `Canales: ${channels}`,
  contradictionsTitle: "Vale la pena resolver esto antes de confiar en el plan.",
  figures: {
    planAtAGlance:        "Su plan de un vistazo",
    allocationHeading:    "Cómo se distribuye la inversión",
    couldCover:           "Puede cubrir:",
    shapedBy:             "Definido por sus respuestas:",
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
    whereYouAre:    "Cómo está",
    scenario:       "Escenario",
    estimatedRange: "Rango estimado",
    whatItChanges:  "Qué cambia",
  },
};

/** "$6,000 a $9,000" reads correctly in Spanish; "to" does not. */
export const esFormatRange: CalcCopy["formatRange"] = (r, formatMoney) =>
  `${formatMoney(r.min)} a ${formatMoney(r.max)}`;
