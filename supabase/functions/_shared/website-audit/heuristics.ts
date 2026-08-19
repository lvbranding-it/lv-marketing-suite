import type { DetectedLanguage } from "./types.ts";

export type SiteSignal = "author" | "address" | "contact" | "trust" | "service" | "entity" | "audience" | "cta";

const PATTERNS: Record<Exclude<DetectedLanguage, "unknown">, Record<SiteSignal, RegExp>> = {
  en: {
    author: /\b(author|written by|reviewed by)\b/i,
    address: /\b(address|located|location|houston|texas|tx)\b|\b\d{5}(?:-\d{4})?\b/i,
    contact: /\b(contact|email|phone|call us)\b/i,
    trust: /\b(case stud(?:y|ies)|testimonial|client stor(?:y|ies)|results|certified|award|years of experience)\b/i,
    service: /\b(services?|solutions?|products?|consulting|design|development)\b/i,
    entity: /\b(we are|our company|our team|about us|company|organization)\b/i,
    audience: /\b(for (?:businesses|companies|teams|leaders|owners|families|people|organizations|nonprofits|creators|professionals|customers)|we help|built for|designed for|serving)\b/i,
    cta: /\b(contact|talk|book|schedule|reserve|appointment|quote|estimate|proposal|pricing|buy|shop|purchase|order|start|sign up|register|join|call|phone|launch|open|portal|dashboard|tool|use (?:the )?(?:tool|portal|dashboard))\b/i,
  },
  es: {
    author: /\b(autor|autora|escrito por|revisado por)\b/i,
    address: /\b(direcci[oó]n|ubicaci[oó]n|ubicad[oa]|houston|texas|tx)\b|\b\d{5}(?:-\d{4})?\b/i,
    contact: /\b(contacto|contacta|correo|tel[eé]fono|ll[aá]manos)\b/i,
    trust: /\b(caso(?:s)? de [eé]xito|testimonio(?:s)?|resultados|certificad[oa]|premio(?:s)?|a[nñ]os de experiencia)\b/i,
    service: /\b(servicios?|soluciones?|productos?|consultor[ií]a|dise[nñ]o|desarrollo)\b/i,
    entity: /\b(somos|nuestra empresa|nuestro equipo|nosotros|organizaci[oó]n)\b/i,
    audience: /\b(para (?:empresas|negocios|equipos|l[ií]deres|familias|personas|organizaciones|clientes|profesionales)|ayudamos a|creado para|dise[nñ]ado para)\b/i,
    cta: /\b(contacta|contacto|habla|agenda|reserva|cita|cotiza|presupuesto|propuesta|precio|comprar|tienda|pedido|empezar|reg[ií]str\w*|inscr[ií]b\w*|unir|llama|tel[eé]fono|abrir|portal|panel|herramienta|usar (?:la |el )?(?:herramienta|portal|panel))\b/i,
  },
};

export function matchesSiteSignal(text: string, language: DetectedLanguage, signal: SiteSignal): boolean {
  if (language === "unknown") return PATTERNS.en[signal].test(text) || PATTERNS.es[signal].test(text);
  return PATTERNS[language][signal].test(text);
}
