// ── Spanish: composed sentences ─────────────────────────────────────────────────
// These are functions rather than templates with placeholders because Spanish
// agreement moves with the value:
//
//   1 canal    / 3 canales          (plural)
//   1 día      / 30 días
//   un mes     / 3 meses
//   listo      / lista              (gender, when the noun changes)
//   0 de 13    ("de", not "of")
//
// Writing them as functions means each language owns its own grammar instead of
// contorting one sentence to fit both.

import type { CalcCopy } from "./types";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const esPhrases: CalcCopy["phrases"] = {
  // The surrounding label already names the components, so this stays a bare
  // count. Repeating the noun read as "2 de 13 piezas esenciales listas" next to
  // a label saying exactly that.
  essentialsReady: (ready, total) => `${ready} de ${total}`,

  componentsToReview: (n) =>
    `${n} ${plural(n, "componente por revisar", "componentes por revisar")}`,

  channelCount: (n) => `${n} ${plural(n, "canal", "canales")}`,

  dayCount: (n) => `${n} ${plural(n, "día", "días")}`,

  monthCount: (n) => `${n} ${plural(n, "mes", "meses")}`,

  channelsSupported: (supported, selected) =>
    `${supported} de ${selected} ${plural(selected, "seleccionado", "seleccionados")}`,

  feasibilityScore: (score, label) => `${score}/100 · ${label}`,

  readinessScore: (score, band) => `${score}/100 · ${band}`,

  planShown: (scenario, total) => `${scenario} · ${total}`,

  scenarioShownHere: "(el que se muestra arriba)",

  heldSeparately: "se mantiene aparte",

  notAnswered: "Sin responder",

  notNeeded: "No se necesita en esta campaña",

  planningAssumption: "supuesto de planeación",

  perPerson: (n) => `${n}x por persona`,

  resultsGoal: (n) => `${n.toLocaleString("es-MX")} ${plural(n, "resultado", "resultados")}`,

  goalFirst: (n) =>
    `Desde la meta: ${n.toLocaleString("es-MX")} ${plural(n, "resultado", "resultados")}`,

  alwaysOn: "Siempre activa, sin fecha fija",

  fixedDate: "Fecha fija o ventana de lanzamiento",
};

export const esCta: CalcCopy["cta"] = {
  byStatus: {
    "preparation-only": {
      heading: "¿Te ayudamos a que esta primera fase cuente?",
      body: "Saber el número real antes de gastarlo es la parte difícil, y ya lo tienes. Con gusto vemos contigo qué cubriría una fase de preparación enfocada y qué deja listo para lo que sigue.",
      action: "Hablemos de la primera fase",
    },
    "campaign-preparation": {
      heading: "¿Te ayudamos a ordenar las dos fases?",
      body: "Tienes con qué construir la base ahora y activar medios después. Podemos definir contigo qué va en cada fase, para que nada se tenga que construir dos veces.",
      action: "Planeemos ambas fases",
    },
    "focused-pilot": {
      heading: "¿Una segunda opinión antes de invertir?",
      body: "Un piloto enfocado se ve viable aquí. Con gusto revisamos contigo la elección de canal, la creatividad que necesita y el reparto de medios antes de arrancar.",
      action: "Revisemos este piloto",
    },
    "scope-supported": {
      heading: "Cuando quieras, arrancamos.",
      body: "Tu inversión cubre el alcance que seleccionaste. Aun así recorreríamos contigo la estrategia, los requerimientos creativos y la estructura de medios antes de que algo salga al aire.",
      action: "Empecemos la conversación",
    },
  },

  intents: [
    {
      key: "second-opinion",
      label: "Una segunda opinión sobre estos números",
      hint: "Revisamos el plan contigo y te decimos en qué coincidimos y en qué no.",
    },
    {
      key: "build-missing",
      label: "Ayuda para construir lo que falta",
      hint: "Cotizamos las piezas que tu plan indica que aún no están listas.",
    },
    {
      key: "quote",
      label: "Una cotización para este alcance",
      hint: "Convertimos el plan en una propuesta con números reales y tiempos.",
    },
    {
      key: "send-plan",
      label: "Solo envíenme el plan por ahora",
      hint: "Te mandamos una copia y el siguiente paso lo decides tú.",
    },
  ],

  name: "Tu nombre",
  email: "Correo electrónico",
  phone: "Teléfono",
  optional: "(opcional)",
  intentQuestion: "¿Qué te ayudaría más en este momento?",
  disclosure: "Tu plan va con esto en PDF. Mira exactamente qué recibimos.",
  plusLine: "tu objetivo, canales, mercado y las respuestas detrás del plan.",
  submitting: "Preparando tu plan",
  reassurance: "Te enviamos el PDF y también puedes descargarlo aquí. Sin compromiso, y el plan es tuyo de cualquier forma.",

  errorName: "Por favor escribe tu nombre.",
  errorEmail: "Por favor escribe tu correo.",
  errorEmailInvalid: "Ese correo no se ve bien.",
  submitFailed: "No se pudo enviar. Inténtalo de nuevo o escríbenos a",

  successHeading: (firstName) => `Listo, ${firstName}. Tu plan va en camino.`,
  successEmailed: (email) =>
    `Tu plan va en camino a ${email} en PDF, y llegó a nuestro equipo con todo lo que armaste aquí.`,
  successNotEmailed:
    "Llegó a nuestro equipo con todo lo que armaste aquí. El PDF resultó demasiado grande para enviarlo por correo, así que descárgalo abajo y es tuyo.",
  successFollowUp:
    "Alguien te contactará en un día hábil, y va a llegar con el plan ya leído.",
  successUnchanged: "Nada en esta página cambió. Puedes imprimirla o copiar el resumen cuando quieras.",
  download: "Descargar tu plan (PDF)",
};

export const esBrief: CalcCopy["brief"] = {
  planStatus:         "Estado del plan",
  available:          "Inversión disponible",
  leanMinimum:        "Mínimo profesional",
  completeScope:      "Alcance completo",
  gapMinimum:         "Faltante para el mínimo",
  gapComplete:        "Faltante para el alcance completo",
  planShown:          "Plan mostrado",
  startingPoint:      "Punto de partida",
  essentialsNotReady: "Esenciales que no están listos",
  alsoMissing:        "También falta",
  channelsVsFunding:  "Canales vs. financiamiento",
  flagged:            "Señalado en las respuestas",
  noMediaActivation:  "fase de preparación, sin activación de medios",
  mediaSuffix:        (amount) => `${amount} en medios`,
  channelsVsFundingValue: (selected, supported) =>
    `${selected} ${selected === 1 ? "seleccionado" : "seleccionados"}, ${supported} con respaldo una vez pagado el alcance mínimo`,
};
