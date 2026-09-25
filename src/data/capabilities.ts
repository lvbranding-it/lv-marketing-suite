/**
 * What the suite can already do, in both languages.
 *
 * This is the single source for the internal capability index at `/about` and
 * for the shareable version published outside the app. Both read from here so a
 * capability cannot be described one way in the product and another way in the
 * page someone forwards to a client.
 *
 * `status` is deliberately honest. An index that calls everything "ready" costs
 * the team trust the first time somebody opens a module and finds it empty.
 */

export type CapabilityGroup =
  | "win" | "market" | "make" | "deliver" | "events" | "partner" | "tools";

/** live: real work has gone through it. new: live, a handful of records. ready: finished, waiting on a first job. */
export type CapabilityStatus = "live" | "new" | "ready";

interface Copy {
  name: string;
  /** What it is, in one or two sentences. */
  what: string;
  /** The moment in a job when you would reach for it. */
  when: string;
}

export interface Capability {
  id: string;
  group: CapabilityGroup;
  status: CapabilityStatus;
  /** An in-app route, when there is one to open. */
  path?: string;
  /** Where to find it, when it is not its own route. */
  where?: { en: string; es: string };
  en: Copy;
  es: Copy;
}

export const CAPABILITY_GROUPS: {
  id: CapabilityGroup;
  label: { en: string; es: string };
  hint: { en: string; es: string };
}[] = [
  {
    id: "win",
    label: { en: "Win the work", es: "Ganar el trabajo" },
    hint: {
      en: "Everything between a stranger and a signed project.",
      es: "Todo lo que ocurre entre un desconocido y un proyecto firmado.",
    },
  },
  {
    id: "market",
    label: { en: "Send the marketing", es: "Enviar el marketing" },
    hint: {
      en: "Getting a message out, to a list or to the public.",
      es: "Sacar un mensaje, a una lista o al público.",
    },
  },
  {
    id: "make",
    label: { en: "Make the work", es: "Hacer el trabajo" },
    hint: {
      en: "The production tools, including all three AI systems.",
      es: "Las herramientas de producción, incluidos los tres sistemas de IA.",
    },
  },
  {
    id: "deliver",
    label: { en: "Deliver to clients", es: "Entregar al cliente" },
    hint: {
      en: "Handing work over, and keeping a record that it was agreed.",
      es: "Entregar el trabajo y dejar constancia de lo acordado.",
    },
  },
  {
    id: "events",
    label: { en: "Run events", es: "Producir eventos" },
    hint: {
      en: "Booking, scheduling and the live room itself.",
      es: "Reservas, agenda y la sala en vivo.",
    },
  },
  {
    id: "partner",
    label: { en: "Partners", es: "Aliados" },
    hint: {
      en: "The ambassador side of the business, kept separate by design.",
      es: "El lado de embajadores del negocio, separado por diseño.",
    },
  },
  {
    id: "tools",
    label: { en: "Quick tools", es: "Herramientas rápidas" },
    hint: {
      en: "Small jobs that used to mean opening something else.",
      es: "Tareas pequeñas que antes obligaban a abrir otra cosa.",
    },
  },
];

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, { en: string; es: string }> = {
  live:  { en: "In use",       es: "En uso" },
  new:   { en: "Just started", es: "Recién iniciado" },
  ready: { en: "Ready to use", es: "Listo para usar" },
};

export const CAPABILITIES: Capability[] = [
  // ── Win the work ──────────────────────────────────────────────────────────
  {
    id: "contacts", group: "win", status: "live", path: "/contacts",
    en: {
      name: "Contacts",
      what: "The CRM. Tags, pipeline stages, follow-up dates, deal values and a research queue, sorted by most recent activity so new enquiries surface first.",
      when: "Any time you need to know where a relationship stands, or who has gone quiet.",
    },
    es: {
      name: "Contactos",
      what: "El CRM. Etiquetas, etapas del embudo, fechas de seguimiento, valor del negocio y una cola de investigación, ordenado por actividad más reciente para que las consultas nuevas aparezcan primero.",
      when: "Cuando necesites saber en qué punto está una relación, o quién dejó de responder.",
    },
  },
  {
    id: "lead-forms", group: "win", status: "live", path: "/lead-forms",
    en: {
      name: "Lead Forms",
      what: "Eight shareable public funnels, each in English and Spanish, with views, leads and conversion rate tracked per form.",
      when: "You want a link to put in a bio, an email or an ad, and you want to know whether it worked.",
    },
    es: {
      name: "Formularios de captación",
      what: "Ocho embudos públicos para compartir, cada uno en inglés y español, con visitas, prospectos y tasa de conversión por formulario.",
      when: "Necesitas un enlace para una bio, un correo o un anuncio, y quieres saber si funcionó.",
    },
  },
  {
    id: "website-audit", group: "win", status: "live", path: "/en/tools/website-opportunity-audit",
    en: {
      name: "Website Opportunity Audit",
      what: "A prospect enters their own website and gets a real audit back. Fifteen have been run.",
      when: "Opening a conversation with someone who has not asked for anything yet.",
    },
    es: {
      name: "Auditoría de oportunidades web",
      what: "Un prospecto ingresa su propio sitio y recibe una auditoría real. Se han ejecutado quince.",
      when: "Para abrir una conversación con alguien que todavía no ha pedido nada.",
    },
  },
  {
    id: "service-pages", group: "win", status: "live",
    where: { en: "7 services, EN + ES", es: "7 servicios, EN + ES" },
    en: {
      name: "Service Landing Pages",
      what: "A page per service, each with its own multi-step intake wizard. Submissions land in Contacts already tagged by service and language.",
      when: "You are running paid media or SEO for one specific service rather than the agency generally.",
    },
    es: {
      name: "Páginas de servicio",
      what: "Una página por servicio, cada una con su propio asistente de captación por pasos. Los envíos llegan a Contactos ya etiquetados por servicio e idioma.",
      when: "Cuando inviertes en medios pagados o SEO para un servicio concreto y no para la agencia en general.",
    },
  },
  {
    id: "intake", group: "win", status: "live", path: "/intake",
    en: {
      name: "Intake",
      what: "Structured onboarding questionnaires sent to a client by link.",
      when: "A project is starting and you would otherwise be gathering the brief across a dozen emails.",
    },
    es: {
      name: "Cuestionario de inicio",
      what: "Cuestionarios estructurados de incorporación que se envían al cliente por enlace.",
      when: "Empieza un proyecto y de otro modo reunirías el brief a lo largo de doce correos.",
    },
  },

  // ── Send the marketing ────────────────────────────────────────────────────
  {
    id: "campaigns", group: "market", status: "live", path: "/campaigns",
    en: {
      name: "Email Campaigns",
      what: "Compose from reusable blocks, send to a segment, track delivery. Bounces and unsubscribes suppress themselves, and a dead mailbox is recorded differently from a temporary failure.",
      when: "Anything going to more than a handful of people at once.",
    },
    es: {
      name: "Campañas de correo",
      what: "Redacta con bloques reutilizables, envía a un segmento y sigue la entrega. Los rebotes y las bajas se suprimen solos, y un buzón muerto se registra distinto de un fallo temporal.",
      when: "Cualquier envío que vaya a más de un puñado de personas a la vez.",
    },
  },
  {
    id: "social-publisher", group: "market", status: "ready", path: "/social-publisher",
    en: {
      name: "Social Publisher",
      what: "Plan a message once, adapt it per network, then publish through an approval step rather than a fire-and-forget post.",
      when: "The same announcement needs to go out in four places without sounding copy-pasted.",
    },
    es: {
      name: "Publicador social",
      what: "Planifica un mensaje una vez, adáptalo a cada red y publícalo pasando por una aprobación en lugar de lanzarlo y olvidarlo.",
      when: "El mismo anuncio debe salir en cuatro lugares sin que parezca copiado y pegado.",
    },
  },
  {
    id: "contests", group: "market", status: "live", path: "/contests",
    en: {
      name: "Contests",
      what: "Public voting with voter verification and an embeddable widget for a client's own site. 602 votes cast so far.",
      when: "A client wants their audience to choose something, and the result has to be defensible.",
    },
    es: {
      name: "Concursos",
      what: "Votación pública con verificación de votantes y un widget para incrustar en el sitio del cliente. Van 602 votos emitidos.",
      when: "Un cliente quiere que su audiencia elija algo y el resultado tiene que ser defendible.",
    },
  },

  // ── Make the work ─────────────────────────────────────────────────────────
  {
    id: "creative-canvas", group: "make", status: "new", path: "/dashboard/creative-canvas",
    en: {
      name: "LV Creative Canvas",
      what: "A visual board for creative direction. Cards hold references, prompts and generated images; arrows either carry context forward or mark sequence. Exports to PNG and multi-page PDF.",
      when: "Working out a look before anyone writes a brief, or building a series that has to hang together.",
    },
    es: {
      name: "LV Creative Canvas",
      what: "Un tablero visual para dirección creativa. Las tarjetas guardan referencias, instrucciones e imágenes generadas; las flechas arrastran contexto o marcan secuencia. Exporta a PNG y a PDF de varias páginas.",
      when: "Para definir un look antes de que nadie escriba un brief, o para armar una serie que debe verse coherente.",
    },
  },
  {
    id: "commands", group: "make", status: "live",
    where: { en: "inside the Canvas", es: "dentro del Canvas" },
    en: {
      name: "Creative Command System",
      what: "141 slash commands, 82 of them live today, across people, photography, product, brand, copy and 35 for UGC. A command is only switched on once its whole workflow is built and tested.",
      when: "You know the adjustment you want and would rather name it than describe it from scratch.",
    },
    es: {
      name: "Sistema de comandos creativos",
      what: "141 comandos, 82 activos hoy, entre personas, fotografía, producto, marca, texto y 35 para UGC. Un comando solo se activa cuando su flujo completo está construido y probado.",
      when: "Sabes qué ajuste quieres y prefieres nombrarlo antes que describirlo desde cero.",
    },
  },
  {
    id: "skills", group: "make", status: "live", path: "/skills",
    en: {
      name: "Skills",
      what: "33 single-shot marketing specialists: SEO audits, page CRO, copywriting, paid ads, pricing strategy and more. Each asks a few questions and returns finished thinking.",
      when: "You need one solid answer on a specific discipline, today.",
    },
    es: {
      name: "Habilidades",
      what: "33 especialistas de marketing de una sola pasada: auditorías SEO, CRO de páginas, redacción, medios pagados, estrategia de precios y más. Cada uno hace unas preguntas y devuelve un razonamiento terminado.",
      when: "Necesitas una respuesta sólida sobre una disciplina concreta, hoy.",
    },
  },
  {
    id: "agents", group: "make", status: "live", path: "/agents",
    en: {
      name: "Agents",
      what: "Nine agents that hold a brief across a project: lead intel, strategy, offers, proposals, content systems, production, website audits, client comms, project management. 218 runs to date, exportable to PDF or Word.",
      when: "The output is going in front of a client and needs to be structured, not conversational.",
    },
    es: {
      name: "Agentes",
      what: "Nueve agentes que sostienen un brief a lo largo de un proyecto: inteligencia de prospectos, estrategia, ofertas, propuestas, sistemas de contenido, producción, auditoría web, comunicación con el cliente y gestión de proyectos. 218 ejecuciones hasta hoy, exportables a PDF o Word.",
      when: "El resultado va a ponerse frente a un cliente y necesita estructura, no una conversación.",
    },
  },
  {
    id: "projects", group: "make", status: "live", path: "/projects",
    en: {
      name: "Projects",
      what: "The container everything attaches to. A project's marketing context is what makes Skills and Agents write about that business instead of generically.",
      when: "Before running anything AI-assisted for a client. This is the step people skip and then wonder why the output is bland.",
    },
    es: {
      name: "Proyectos",
      what: "El contenedor al que se engancha todo lo demás. El contexto de marketing de un proyecto es lo que hace que Habilidades y Agentes escriban sobre ese negocio y no en general.",
      when: "Antes de ejecutar cualquier cosa con IA para un cliente. Es el paso que se salta la gente y luego se pregunta por qué el resultado sale soso.",
    },
  },
  {
    id: "workspace", group: "make", status: "live", path: "/workspace",
    en: {
      name: "Workspace",
      what: "A block-based page tree for notes, drafts and operating docs. 14 pages, 147 blocks.",
      when: "Something needs writing down where the rest of the team will find it.",
    },
    es: {
      name: "Espacio de trabajo",
      what: "Un árbol de páginas por bloques para notas, borradores y documentos de operación. 14 páginas, 147 bloques.",
      when: "Hay algo que anotar donde el resto del equipo lo vaya a encontrar.",
    },
  },

  // ── Deliver to clients ────────────────────────────────────────────────────
  {
    id: "ccs", group: "deliver", status: "new", path: "/ccs",
    en: {
      name: "Creative Collaboration Standard",
      what: "A guided nine-step acknowledgment covering revisions, AI input, confidentiality, IP and scope. The client signs without needing an account, and the record is timestamped and immutable.",
      when: "Before creative work starts, so scope and AI use are agreed in writing rather than assumed.",
    },
    es: {
      name: "Estándar de Colaboración Creativa",
      what: "Un reconocimiento guiado de nueve pasos que cubre revisiones, uso de IA, confidencialidad, propiedad intelectual y alcance. El cliente firma sin necesidad de cuenta y el registro queda sellado e inalterable.",
      when: "Antes de empezar el trabajo creativo, para que el alcance y el uso de IA queden por escrito y no supuestos.",
    },
  },
  {
    id: "photo-sessions", group: "deliver", status: "new", path: "/photo-sessions",
    en: {
      name: "Photo Sessions",
      what: "Client proofing galleries with per-photo comments and selections, then published deliverables. Sessions can be invoiced, including top-ups.",
      when: "A shoot is done and the client needs to choose, comment and receive finals in one place.",
    },
    es: {
      name: "Sesiones de fotografía",
      what: "Galerías de revisión para el cliente con comentarios y selección foto por foto, y luego entregables publicados. Las sesiones se pueden facturar, incluidas las ampliaciones.",
      when: "Terminó una sesión y el cliente necesita elegir, comentar y recibir los finales en un solo lugar.",
    },
  },
  {
    id: "file-drop", group: "deliver", status: "live", path: "/files",
    en: {
      name: "File Drop",
      what: "Request files from a client by link, or share finished files back. 134 submissions across 8 requests.",
      when: "Anything too big to email, or anything you would rather not put in a third-party drive.",
    },
    es: {
      name: "Entrega de archivos",
      what: "Pide archivos al cliente por enlace, o comparte los archivos terminados de vuelta. 134 envíos en 8 solicitudes.",
      when: "Cualquier cosa demasiado pesada para un correo, o que prefieras no dejar en un disco de terceros.",
    },
  },
  {
    id: "history", group: "deliver", status: "live", path: "/history",
    en: {
      name: "History and Outputs",
      what: "Every skill and agent output, kept, searchable, printable and shareable. Transcripts and brand context export on the LV letterhead.",
      when: "Someone asks for that thing the AI wrote three weeks ago.",
    },
    es: {
      name: "Historial y resultados",
      what: "Todo lo que han producido Habilidades y Agentes, guardado, buscable, imprimible y compartible. Las transcripciones y el contexto de marca se exportan con el membrete de LV.",
      when: "Alguien pide aquello que la IA escribió hace tres semanas.",
    },
  },

  // ── Run events ────────────────────────────────────────────────────────────
  {
    id: "event-experiences", group: "events", status: "live", path: "/event-experiences",
    en: {
      name: "Event Experiences",
      what: "A live photo wall. Guests upload from their phones, you moderate, approved photos appear on the room screen in real time. 156 photos so far.",
      when: "An event where the audience should see themselves on the screen. Built to feed a video switcher, so it never needs touching mid-show.",
    },
    es: {
      name: "Experiencias de evento",
      what: "Un muro de fotos en vivo. Los invitados suben desde su teléfono, tú moderas y las fotos aprobadas aparecen en la pantalla de la sala en tiempo real. Van 156 fotos.",
      when: "Un evento donde el público debe verse en pantalla. Está hecho para alimentar un switcher de video, así que nunca hay que tocarlo durante el show.",
    },
  },
  {
    id: "event-scheduling", group: "events", status: "ready", path: "/events/admin",
    en: {
      name: "Event Scheduling",
      what: "Create events, share booking links, manage guest check-in.",
      when: "An event with a guest list that needs to register in advance.",
    },
    es: {
      name: "Agenda de eventos",
      what: "Crea eventos, comparte enlaces de reserva y gestiona el registro de invitados.",
      when: "Un evento con lista de invitados que deben registrarse por adelantado.",
    },
  },
  {
    id: "appointments", group: "events", status: "ready", path: "/appointments",
    en: {
      name: "Appointment Calendar",
      what: "Schedule prospects, route them to the right host, keep calendars in sync. Public booking at /book.",
      when: "You want someone to pick a slot themselves instead of trading five emails about timing.",
    },
    es: {
      name: "Calendario de citas",
      what: "Agenda prospectos, dirígelos al anfitrión correcto y mantén los calendarios sincronizados. Reserva pública en /book.",
      when: "Quieres que alguien elija su propio horario en lugar de intercambiar cinco correos sobre la hora.",
    },
  },

  // ── Partners ──────────────────────────────────────────────────────────────
  {
    id: "portal", group: "partner", status: "new", path: "/portal",
    en: {
      name: "Ambassador Portal",
      what: "A separate portal where ambassadors and business developers track their own leads, follow-ups and commissions. Role isolation is enforced in the database, so they never see agency-internal data.",
      when: "Onboarding someone who refers business but is not part of the agency.",
    },
    es: {
      name: "Portal de Embajadores",
      what: "Un portal aparte donde embajadores y desarrolladores de negocio siguen sus propios prospectos, seguimientos y comisiones. El aislamiento por rol se aplica en la base de datos, así que nunca ven datos internos de la agencia.",
      when: "Cuando incorporas a alguien que refiere negocio pero no forma parte de la agencia.",
    },
  },
  {
    id: "boss", group: "partner", status: "new",
    where: { en: "inside the portal", es: "dentro del portal" },
    en: {
      name: "BOSS",
      what: "The AI advisor ambassadors talk to by name. Prepares discovery questions, rehearses objections and drafts outreach, by voice or typing, in English or Spanish.",
      when: "An ambassador has a conversation coming up and wants to walk in prepared.",
    },
    es: {
      name: "BOSS",
      what: "El asesor de IA al que los embajadores se dirigen por su nombre. Prepara preguntas de descubrimiento, ensaya objeciones y redacta mensajes, por voz o escribiendo, en inglés o español.",
      when: "Un embajador tiene una conversación próxima y quiere llegar preparado.",
    },
  },

  // ── Quick tools ───────────────────────────────────────────────────────────
  {
    id: "calculator", group: "tools", status: "live", path: "/campaign-investment-calculator",
    en: {
      name: "Campaign Investment Calculator",
      what: "A public calculator that lets a prospect size their own budget. English and Spanish.",
      when: "Someone asks what a campaign costs and you would rather they reason it through than hear a number.",
    },
    es: {
      name: "Calculadora de inversión en campañas",
      what: "Una calculadora pública que permite al prospecto dimensionar su propio presupuesto. En inglés y español.",
      when: "Alguien pregunta cuánto cuesta una campaña y prefieres que lo razone en lugar de darle una cifra.",
    },
  },
  {
    id: "image-studio", group: "tools", status: "live", path: "/image-studio",
    en: {
      name: "Image Studio",
      what: "Crop, fill, resize and set a background.",
      when: "An image needs to be the right shape in the next two minutes.",
    },
    es: {
      name: "Estudio de imagen",
      what: "Recorta, rellena, cambia el tamaño y define un fondo.",
      when: "Una imagen tiene que quedar con la forma correcta en los próximos dos minutos.",
    },
  },
  {
    id: "motion-palette", group: "tools", status: "live", path: "/motion-palette",
    en: {
      name: "Motion Palette",
      what: "Load a Lottie animation, see every colour and gradient ramp it uses, and recolour it to a brand palette.",
      when: "A stock animation is nearly right but wearing the wrong brand's colours.",
    },
    es: {
      name: "Paleta de movimiento",
      what: "Carga una animación Lottie, ve todos los colores y degradados que usa y recolórea a la paleta de una marca.",
      when: "Una animación de stock casi sirve, pero lleva los colores de otra marca.",
    },
  },
  {
    id: "qr", group: "tools", status: "live", path: "/qr-generator",
    en: {
      name: "QR Generator",
      what: "Branded QR codes with a logo in the middle.",
      when: "Anything printed that needs to lead somewhere: signage, a flyer, a table card.",
    },
    es: {
      name: "Generador de QR",
      what: "Códigos QR con marca y logotipo en el centro.",
      when: "Cualquier impreso que deba llevar a algún sitio: señalética, un volante, una tarjeta de mesa.",
    },
  },
  {
    id: "signature", group: "tools", status: "live", path: "/email-signature-generator",
    en: {
      name: "Email Signature Generator",
      what: "Consistent branded signatures for the whole team.",
      when: "Someone new joins, or the team's signatures have drifted apart again.",
    },
    es: {
      name: "Generador de firmas de correo",
      what: "Firmas con marca consistentes para todo el equipo.",
      when: "Entra alguien nuevo, o las firmas del equipo volvieron a descuadrarse.",
    },
  },
];

/** The three AI systems, which are the thing most often confused. */
export const AI_SYSTEMS: { id: string; en: Copy; es: Copy }[] = [
  {
    id: "skills",
    en: { name: "Skills", what: "One job, one answer.", when: "Answer a few questions, get a finished piece of thinking back. An SEO audit, a pricing model, a page teardown." },
    es: { name: "Habilidades", what: "Un trabajo, una respuesta.", when: "Contestas unas preguntas y recibes un razonamiento terminado. Una auditoría SEO, un modelo de precios, el desglose de una página." },
  },
  {
    id: "agents",
    en: { name: "Agents", what: "A brief, not a question.", when: "They hold context across a whole project and produce a structured deliverable. Use them when the output has to survive review." },
    es: { name: "Agentes", what: "Un brief, no una pregunta.", when: "Sostienen el contexto de un proyecto entero y producen un entregable estructurado. Úsalos cuando el resultado tenga que aguantar una revisión." },
  },
  {
    id: "commands",
    en: { name: "Commands", what: "They act on what is in front of you.", when: "Typed inside the Creative Canvas, they work on the cards you have already put on the board." },
    es: { name: "Comandos", what: "Actúan sobre lo que tienes delante.", when: "Se escriben dentro del Creative Canvas y trabajan sobre las tarjetas que ya pusiste en el tablero." },
  },
];
