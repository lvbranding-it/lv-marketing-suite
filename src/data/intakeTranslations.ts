export type Lang = "en" | "es";

// English option values — stored in DB, used by AI prompts (never change)
export const OPTION_VALUES = {
  industry:       ["SaaS / Software","E-commerce / Retail","Professional Services","Healthcare","Education","Finance / Fintech","Real Estate","Media / Entertainment","Non-profit","Other"],
  company_size:   ["Just me (solo)","2–10 people","11–50 people","51–200 people","201–500 people","500+ people"],
  business_model: ["SaaS","Freemium","Usage-based","E-commerce","Marketplace","Service / Agency","Non-profit","Other"],
  timeline:       ["ASAP","Within 2 weeks","Within 1 month","1–3 months","Just exploring"],
  tone:           ["Professional & authoritative","Conversational & approachable","Bold & disruptive","Playful & energetic","Empathetic & supportive","Technical & precise"],
} as const;

export const intakeTranslations = {
  en: {
    langToggle: "🇪🇸 Español",
    footer: "Developed with Love by LV Branding",
    stepIndicator: (n: number) => `Step ${n} of 4`,

    welcome: {
      title:      "We're so glad you're here.",
      body1:      "You've taken the first step toward a brand that truly stands out. We can't wait to learn about your business and create something amazing together.",
      body2a:     "This takes about",
      body2bold:  "3–5 minutes",
      body2b:     "— and your answers help us hit the ground running.",
      button:     "Let's Get Started",
      finePrint:  "No login required · Takes 3–5 min",
    },

    steps: [
      { label: "About You",        emoji: "👋", hint: "Let's start with who you are" },
      { label: "Your Business",    emoji: "🏢", hint: "Tell us about what you do" },
      { label: "Goals & Audience", emoji: "🎯", hint: "What success looks like" },
      { label: "Brand & Fit",      emoji: "✨", hint: "How you want to be seen" },
    ],

    fields: {
      contact_name:    { label: "Your full name",               placeholder: "Jane Smith",                                                                         required: true,  error: "Your name is required" },
      contact_email:   { label: "Work email",                   placeholder: "jane@company.com",                                                                   required: true,  error: "Please enter a valid email" },
      contact_role:    { label: "Your title / role",            placeholder: "e.g. Founder, VP Marketing",                                                         required: false },
      company_name:    { label: "Company / Brand name",         placeholder: "Acme Corp",                                                                          required: true,  error: "Company name is required" },
      website:         { label: "Website",                      placeholder: "https://...",                                                                         required: false },
      industry:        { label: "Industry",                     placeholder: "Select industry...",                                                                  required: true,  error: "Please select an industry" },
      company_size:    { label: "Company size",                 placeholder: "Select size...",                                                                      required: true,  error: "Please select a size" },
      business_model:  { label: "Business model",               placeholder: "Select model...",                                                                     required: true,  error: "Please select a model" },
      one_liner:       { label: "One-liner — what do you do?",  placeholder: "e.g. We help marketing teams ship campaigns 10× faster.",                            required: true,  error: "Please give us a one-liner",          hint: "Finish this sentence: 'We help [who] do [what]'" },
      goals:           { label: "What are you hoping to achieve with us?", placeholder: "e.g. Build brand awareness in the enterprise segment and generate more qualified inbound leads.", required: true, error: "Please share your goals", hint: "Think big — more leads, stronger brand, better content?" },
      ideal_customer:  { label: "Who is your ideal customer?",  placeholder: "e.g. B2B SaaS marketing managers at 50–500 person tech companies.",                  required: true,  error: "Please describe your ideal customer",  hint: "Be specific — role, industry, company size" },
      top_problem:     { label: "Their biggest pain point you solve", placeholder: "e.g. They spend too long on manual campaign work...",                           required: false },
      timeline:        { label: "When are you looking to get started?", placeholder: "Timeline...",                                                                 required: false },
      competitors:     { label: "Top 2–3 competitors",          placeholder: "e.g. HubSpot, Mailchimp, ActiveCampaign",                                            required: false, hint: "Even if you're disrupting the space" },
      differentiators: { label: "What sets you apart?",         placeholder: "e.g. We're 10× faster to set up, require no code, and are built specifically for SMBs.", required: true, error: "This is important — what makes you stand out?", hint: "Why should customers choose you over everyone else?" },
      tone:            { label: "Brand tone",                   placeholder: "Choose a tone...",                                                                    required: true,  error: "Please choose a tone" },
      extra_notes:     { label: "Anything else we should know?", placeholder: "Feel free to share anything that will help us understand your situation better.",    required: false, hint: "Challenges, sensitivities, previous agency experience…" },
    },

    options: {
      industry:       ["SaaS / Software","E-commerce / Retail","Professional Services","Healthcare","Education","Finance / Fintech","Real Estate","Media / Entertainment","Non-profit","Other"],
      company_size:   ["Just me (solo)","2–10 people","11–50 people","51–200 people","201–500 people","500+ people"],
      business_model: ["SaaS","Freemium","Usage-based","E-commerce","Marketplace","Service / Agency","Non-profit","Other"],
      timeline:       ["ASAP","Within 2 weeks","Within 1 month","1–3 months","Just exploring"],
      tone:           ["Professional & authoritative","Conversational & approachable","Bold & disruptive","Playful & energetic","Empathetic & supportive","Technical & precise"],
    },

    nav: { back: "Back", next: "Next", submit: "Submit Brief", submitting: "Submitting..." },

    errors: {
      orgMissing:   "Invalid link — org ID missing.",
      genericError: "Something went wrong. Please try again.",
    },

    success: {
      title:           "You're all set! 🎊",
      thankYouBefore:  "Thank you, ",
      thankYouAfter:   "! We've received everything we need to hit the ground running.",
      followUpBefore:  "Our team will review your brief and reach out to ",
      followUpMiddle:  " within ",
      followUpHours:   "24 hours",
      followUpEnd:     ".",
      nextStepsTitle:  "What happens next",
      steps: [
        "We review your brief & prepare questions",
        "Kickoff call to align on strategy",
        "We get to work building your brand",
      ],
    },
  },

  es: {
    langToggle: "🇺🇸 English",
    footer: "Desarrollado con Amor por LV Branding",
    stepIndicator: (n: number) => `Paso ${n} de 4`,

    welcome: {
      title:      "¡Nos alegra mucho que estés aquí!",
      body1:      "Has dado el primer paso hacia una marca que realmente destaca. Estamos ansiosos por conocer tu negocio y crear algo increíble juntos.",
      body2a:     "Esto toma aproximadamente",
      body2bold:  "3–5 minutos",
      body2b:     "— y tus respuestas nos ayudan a arrancar de inmediato.",
      button:     "Comencemos",
      finePrint:  "Sin registro requerido · Toma 3–5 min",
    },

    steps: [
      { label: "Sobre Ti",                emoji: "👋", hint: "Empecemos con quién eres" },
      { label: "Tu Negocio",              emoji: "🏢", hint: "Cuéntanos qué haces" },
      { label: "Metas y Audiencia",       emoji: "🎯", hint: "Cómo luce el éxito para ti" },
      { label: "Marca y Compatibilidad",  emoji: "✨", hint: "Cómo quieres ser percibido" },
    ],

    fields: {
      contact_name:    { label: "Tu nombre completo",              placeholder: "Juan Pérez",                                                                               required: true,  error: "Tu nombre es obligatorio" },
      contact_email:   { label: "Correo de trabajo",               placeholder: "juan@empresa.com",                                                                         required: true,  error: "Por favor ingresa un correo válido" },
      contact_role:    { label: "Tu título / cargo",               placeholder: "ej. Fundador, VP de Marketing",                                                             required: false },
      company_name:    { label: "Nombre de la empresa / marca",    placeholder: "Acme Corp",                                                                                 required: true,  error: "El nombre de la empresa es obligatorio" },
      website:         { label: "Sitio web",                       placeholder: "https://...",                                                                               required: false },
      industry:        { label: "Industria",                       placeholder: "Selecciona una industria...",                                                               required: true,  error: "Por favor selecciona una industria" },
      company_size:    { label: "Tamaño de la empresa",            placeholder: "Selecciona el tamaño...",                                                                   required: true,  error: "Por favor selecciona un tamaño" },
      business_model:  { label: "Modelo de negocio",               placeholder: "Selecciona un modelo...",                                                                   required: true,  error: "Por favor selecciona un modelo" },
      one_liner:       { label: "En una frase — ¿qué haces?",      placeholder: "ej. Ayudamos a equipos de marketing a lanzar campañas 10× más rápido.",                    required: true,  error: "Por favor danos una frase descriptiva",       hint: "Completa esta frase: 'Ayudamos a [quién] a hacer [qué]'" },
      goals:           { label: "¿Qué esperas lograr con nosotros?", placeholder: "ej. Construir reconocimiento de marca en el segmento empresarial y generar más leads calificados.", required: true, error: "Por favor comparte tus metas", hint: "Piensa en grande — ¿más leads, marca más sólida, mejor contenido?" },
      ideal_customer:  { label: "¿Quién es tu cliente ideal?",     placeholder: "ej. Gerentes de marketing de SaaS B2B en empresas de 50–500 personas.",                    required: true,  error: "Por favor describe a tu cliente ideal",       hint: "Sé específico — rol, industria, tamaño de empresa" },
      top_problem:     { label: "El mayor problema que les resuelves", placeholder: "ej. Invierten demasiado tiempo en trabajo manual de campañas...",                       required: false },
      timeline:        { label: "¿Cuándo buscas comenzar?",        placeholder: "Fecha estimada...",                                                                         required: false },
      competitors:     { label: "Los 2–3 principales competidores", placeholder: "ej. HubSpot, Mailchimp, ActiveCampaign",                                                   required: false, hint: "Aunque estés disrumpiendo el mercado" },
      differentiators: { label: "¿Qué te diferencia?",             placeholder: "ej. Somos 10× más rápidos de configurar, no requieren código y están hechos para PYMEs.",   required: true,  error: "Esto es importante — ¿qué te hace destacar?",hint: "¿Por qué los clientes deberían elegirte sobre todos los demás?" },
      tone:            { label: "Tono de marca",                   placeholder: "Elige un tono...",                                                                          required: true,  error: "Por favor elige un tono" },
      extra_notes:     { label: "¿Algo más que debamos saber?",     placeholder: "Comparte libremente todo lo que nos ayude a entender mejor tu situación.",                 required: false, hint: "Retos, sensibilidades, experiencia previa con agencias…" },
    },

    options: {
      industry:       ["SaaS / Software","E-commerce / Comercio minorista","Servicios profesionales","Salud","Educación","Finanzas / Fintech","Bienes raíces","Medios / Entretenimiento","Sin fines de lucro","Otro"],
      company_size:   ["Solo yo","2–10 personas","11–50 personas","51–200 personas","201–500 personas","500+ personas"],
      business_model: ["SaaS","Freemium","Por uso","E-commerce","Marketplace","Servicio / Agencia","Sin fines de lucro","Otro"],
      timeline:       ["Lo antes posible","En 2 semanas","En 1 mes","1–3 meses","Solo explorando"],
      tone:           ["Profesional y autoritativo","Conversacional y accesible","Audaz y disruptivo","Dinámico y energético","Empático y de apoyo","Técnico y preciso"],
    },

    nav: { back: "Atrás", next: "Siguiente", submit: "Enviar Brief", submitting: "Enviando..." },

    errors: {
      orgMissing:   "Enlace inválido — falta el ID de la organización.",
      genericError: "Algo salió mal. Por favor intenta de nuevo.",
    },

    success: {
      title:           "¡Todo listo! 🎊",
      thankYouBefore:  "¡Gracias, ",
      thankYouAfter:   "! Hemos recibido todo lo que necesitamos para arrancar de inmediato.",
      followUpBefore:  "Nuestro equipo revisará tu brief y se pondrá en contacto a ",
      followUpMiddle:  " en un plazo de ",
      followUpHours:   "24 horas",
      followUpEnd:     ".",
      nextStepsTitle:  "¿Qué sigue?",
      steps: [
        "Revisamos tu brief y preparamos preguntas",
        "Llamada de inicio para alinear la estrategia",
        "Nos ponemos a trabajar en tu marca",
      ],
    },
  },
} as const;

export type IntakeT = typeof intakeTranslations["en"];
