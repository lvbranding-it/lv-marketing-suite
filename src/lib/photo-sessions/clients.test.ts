import { describe, expect, it } from "vitest";
import { clientProblem, contactDetail, contactName, searchContacts, splitName, NO_CLIENT, type ClientContact } from "./clients";

const contact = (fields: Partial<ClientContact>): ClientContact => ({
  id: fields.id ?? Math.random().toString(36),
  first_name: null,
  last_name: null,
  company: null,
  email: null,
  pipeline_stage: "lead",
  ...fields,
});

describe("contactName", () => {
  it("uses the person's name, then the company, then the email", () => {
    expect(contactName(contact({ first_name: "Ana", last_name: "Ruiz", company: "Acme" }))).toBe("Ana Ruiz");
    expect(contactName(contact({ company: "Acme" }))).toBe("Acme");
    expect(contactName(contact({ email: "ana@acme.com" }))).toBe("ana@acme.com");
    expect(contactName(contact({}))).toBe("Unnamed contact");
  });

  it("does not repeat the name in the detail line", () => {
    expect(contactDetail(contact({ company: "Acme", email: "hi@acme.com" }))).toBe("hi@acme.com");
    expect(contactDetail(contact({ first_name: "Ana", company: "Acme", email: "ana@acme.com" }))).toBe("Acme · ana@acme.com");
  });
});

describe("searchContacts", () => {
  const people = [
    contact({ id: "1", first_name: "Zoe", last_name: "Park", pipeline_stage: "won" }),
    contact({ id: "2", first_name: "José", last_name: "García", company: "Taller Uno" }),
    contact({ id: "3", first_name: "Adam", last_name: "Lee", pipeline_stage: "won", email: "adam@studio.com" }),
    contact({ id: "4", company: "Fajita Butler", email: "hello@fajitabutler.com" }),
  ];

  it("puts clients first, each group in name order", () => {
    const { clients, others } = searchContacts(people, "");
    expect(clients.map((c) => c.id)).toEqual(["3", "1"]);
    expect(others.map((c) => c.id)).toEqual(["4", "2"]);
  });

  it("matches every word across name, company and email, ignoring accents", () => {
    expect(searchContacts(people, "jose gar").others.map((c) => c.id)).toEqual(["2"]);
    expect(searchContacts(people, "taller").others.map((c) => c.id)).toEqual(["2"]);
    expect(searchContacts(people, "studio.com").clients.map((c) => c.id)).toEqual(["3"]);
    expect(searchContacts(people, "fajita")).toEqual({ clients: [], others: [people[3]] });
    expect(searchContacts(people, "nobody")).toEqual({ clients: [], others: [] });
  });
});

describe("splitName", () => {
  it("keeps everything after the first word as the last name", () => {
    expect(splitName("  María  de la Cruz ")).toEqual({ first_name: "María", last_name: "de la Cruz" });
    expect(splitName("Cher")).toEqual({ first_name: "Cher", last_name: null });
  });
});

describe("clientProblem", () => {
  it("asks for a client when none was chosen or added", () => {
    expect(clientProblem(NO_CLIENT)).toEqual({ name: "Choose a client, or add a new one" });
  });

  it("needs a name for a new client and a valid email when one is given", () => {
    expect(clientProblem({ contactId: null, name: " ", email: "", adding: true })).toEqual({ name: "Client name is required" });
    expect(clientProblem({ contactId: "1", name: "Ana", email: "ana@", adding: false })).toEqual({ email: "Invalid email" });
    expect(clientProblem({ contactId: "1", name: "Ana", email: "", adding: false })).toBeNull();
    expect(clientProblem({ contactId: null, name: "Ana", email: "ana@acme.com", adding: true })).toBeNull();
  });
});
