function collectRawSchemaTypes(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRawSchemaTypes(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  if (typeof type === "string") output.add(type);
  else if (Array.isArray(type)) {
    type.filter((item): item is string => typeof item === "string").forEach((item) => output.add(item));
  }
  Object.values(object).forEach((item) => collectRawSchemaTypes(item, output));
}

function hasSchemaContext(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSchemaContext);
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  const context = object["@context"];
  if (typeof context === "string" && /(?:https?:\/\/)?schema\.org\/?$/i.test(context.trim())) return true;
  if (Array.isArray(context) && context.some((item) => typeof item === "string" && /schema\.org/i.test(item))) return true;
  return Object.values(object).some(hasSchemaContext);
}

const SUPPORTED_SCHEMA_TYPES = new Set([
  "AggregateRating", "Article", "AutoRepair", "BlogPosting", "BreadcrumbList", "ContactPoint", "Corporation",
  "Dentist", "EducationalOrganization", "Event", "FAQPage", "FinancialService", "FoodEstablishment",
  "GovernmentOrganization", "HealthAndBeautyBusiness", "HomeAndConstructionBusiness", "HowTo", "ImageObject",
  "ItemList", "LegalService", "LocalBusiness", "LodgingBusiness", "MedicalOrganization", "NewsArticle", "NGO",
  "Offer", "Organization", "Person", "Place", "PostalAddress", "Product", "ProfessionalService", "RealEstateAgent",
  "Restaurant", "Review", "SearchAction", "Service", "Store", "TravelAgency", "VideoObject", "WebPage", "WebSite",
]);

/** Return only meaningful schema.org types from a parsed JSON-LD document. */
export function meaningfulSchemaTypes(value: unknown): Set<string> {
  const raw = new Set<string>();
  collectRawSchemaTypes(value, raw);
  const contextual = hasSchemaContext(value);
  const normalized = new Set<string>();
  for (const type of raw) {
    const trimmed = type.trim();
    const schemaUrl = trimmed.match(/^https?:\/\/(?:www\.)?schema\.org\/([^/#?]+)\/?$/i);
    const candidate = schemaUrl?.[1] ?? (contextual && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(trimmed) ? trimmed : "");
    if (SUPPORTED_SCHEMA_TYPES.has(candidate)) normalized.add(candidate);
  }
  return normalized;
}
