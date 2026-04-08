/**
 * Flexible CSV parser for contact imports.
 * Handles case-insensitive headers, spaces, dashes, and common field aliases.
 */

export interface ParsedContact {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  tags: string[];
}

// Normalize a header: lowercase, replace spaces/dashes with underscores, strip non-alphanum_
function normalizeKey(h: string) {
  return h.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// Map normalized header → contact field
const FIELD_MAP: Record<string, keyof ParsedContact> = {
  // email
  email: "email",
  e_mail: "email",
  email_address: "email",
  correo: "email",
  correo_electronico: "email",

  // first_name
  first_name: "first_name",
  firstname: "first_name",
  first: "first_name",
  given_name: "first_name",
  nombre: "first_name",
  f_name: "first_name",

  // last_name
  last_name: "last_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  family_name: "last_name",
  apellido: "last_name",
  l_name: "last_name",

  // company
  company: "company",
  organization: "company",
  organisation: "company",
  employer: "company",
  business: "company",
  empresa: "company",
  compania: "company",

  // title / job title
  title: "title",
  job_title: "title",
  position: "title",
  role: "title",
  cargo: "title",
  puesto: "title",

  // phone
  phone: "phone",
  phone_number: "phone",
  telephone: "phone",
  tel: "phone",
  mobile: "phone",
  cell: "phone",
  telefono: "phone",
  movil: "phone",

  // city
  city: "city",
  address_city: "city",    // "Address - City" → "address_city"
  ciudad: "city",
  town: "city",

  // state
  state: "state",
  province: "state",
  region: "state",
  estado: "state",

  // country
  country: "country",
  address_country: "country",  // "Address - Country" → "address_country"
  pais: "country",
  nation: "country",

  // tags
  tags: "tags",
  tag: "tags",
  labels: "tags",
  label: "tags",
  group: "tags",
  groups: "tags",
  category: "tags",
  categories: "tags",
  etiquetas: "tags",
};

/** Parse a CSV string into structured contacts. Returns valid rows (must have email). */
export function parseContactsCSV(text: string): ParsedContact[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const colMap: Record<number, keyof ParsedContact> = {};

  rawHeaders.forEach((h, i) => {
    const normalized = normalizeKey(h);
    const field = FIELD_MAP[normalized];
    if (field) colMap[i] = field;
  });

  const results: ParsedContact[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r].trim();
    if (!line) continue;

    // Split respecting quoted fields
    const cells = splitCSVLine(line);

    const contact: ParsedContact = {
      email: "", first_name: "", last_name: "", company: "",
      title: "", phone: "", city: "", state: "", country: "", tags: [],
    };

    cells.forEach((val, i) => {
      const field = colMap[i];
      if (!field) return;
      const cleaned = val.replace(/^"|"$/g, "").trim();
      if (!cleaned) return;
      if (field === "tags") {
        // Split by semicolons or pipes for multiple tags
        contact.tags = cleaned.split(/[;|]/).map((t) => t.trim()).filter(Boolean);
      } else {
        (contact[field] as string) = cleaned;
      }
    });

    if (contact.email && contact.email.includes("@")) {
      results.push(contact);
    }
  }

  return results;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
