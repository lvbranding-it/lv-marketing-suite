// Choosing the client of a photo session from the organization's contacts.

export interface ClientContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  pipeline_stage?: string | null;
}

/**
 * Who a session is for. Either a contact (contactId) or someone being added
 * to the contacts when the session is saved (adding). The name and email are
 * what the session keeps and what the client sees on their page.
 */
export interface SessionClient {
  contactId: string | null;
  name: string;
  email: string;
  adding: boolean;
}

export const NO_CLIENT: SessionClient = { contactId: null, name: "", email: "", adding: false };

export function contactName(contact: ClientContact): string {
  const person = [contact.first_name, contact.last_name].filter((part) => part?.trim()).join(" ").trim();
  return person || contact.company?.trim() || contact.email?.trim() || "Unnamed contact";
}

/** The line under the name: the company when the name is a person, then the email. */
export function contactDetail(contact: ClientContact): string {
  const name = contactName(contact);
  return [contact.company, contact.email]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part && part !== name)
    .join(" · ");
}

export const isClient = (contact: ClientContact) => contact.pipeline_stage === "won";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The contacts matching a search, split into clients (won) and everyone else,
 * each in name order. Every word of the search has to appear in the name,
 * company or email, accents ignored, so "jose gar" finds "José García".
 */
export function searchContacts(contacts: ClientContact[], query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = contacts.filter((contact) => {
    const text = fold([contactName(contact), contact.company, contact.email].filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  });
  const byName = (a: ClientContact, b: ClientContact) =>
    contactName(a).localeCompare(contactName(b), undefined, { sensitivity: "base" });
  return {
    clients: matches.filter(isClient).sort(byName),
    others: matches.filter((contact) => !isClient(contact)).sort(byName),
  };
}

/** First name and the rest, the way contacts store a name. */
export function splitName(name: string): { first_name: string; last_name: string | null } {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first_name: first ?? name.trim(), last_name: rest.join(" ") || null };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What stops a session from being saved with this client, or null. */
export function clientProblem(client: SessionClient): { name?: string; email?: string } | null {
  const problems: { name?: string; email?: string } = {};
  if (!client.contactId && !client.adding) problems.name = "Choose a client, or add a new one";
  else if (!client.name.trim()) problems.name = "Client name is required";
  if (client.email.trim() && !EMAIL.test(client.email.trim())) problems.email = "Invalid email";
  return problems.name || problems.email ? problems : null;
}
