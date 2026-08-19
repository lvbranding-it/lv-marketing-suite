import { describe, expect, it } from "vitest";
import {
  MAX_HTML_DEPTH,
  MAX_HTML_EVIDENCE_CHARACTERS,
  MAX_HTML_NODES,
  MAX_HTML_TOKENS,
  createHtmlExtractionBudget,
  decodeHtmlBytes,
  decodeHtmlEntities,
  htmlNodes,
  interactiveHtml,
  machineReadableHtml,
  observableHtml,
  parseHtmlDocument,
  supportsMobileViewport,
} from "../../../supabase/functions/_shared/website-audit/html.ts";

describe("website audit observable HTML", () => {
  it("removes executable, template, and explicitly hidden evidence subtrees", () => {
    const source = `<!doctype html><html><head><title>Real title</title>
      <script>const fake = '<h1>Fake heading</h1><a href="/contact">Contact us</a>';</script>
      <style>.offer { display: none }</style></head><body>
      <template><form><button>Request a quote</button></form></template>
      <div aria-hidden="true"><h1>Hidden ARIA heading</h1></div>
      <section hidden><a href="/pricing">Buy now</a></section>
      <div data-rule="a > b" hidden><h1>Quoted delimiter fake</h1></div>
      <div style="display: none"><img alt="Fake proof" /></div>
      <main><h1>Visible heading</h1><a href="/services">Explore services</a></main>
      </body></html>`;

    const result = observableHtml(source);
    expect(result).toContain("Real title");
    expect(result).toContain("Visible heading");
    expect(result).toContain("Explore services");
    expect(result).not.toMatch(/Fake heading|Contact us|Request a quote|Hidden ARIA|Buy now|Fake proof|Quoted delimiter fake/);
  });

  it("keeps public page structure and visible controls intact", () => {
    const source = `<html lang="es"><body><form action="/contacto"><label for="email">Email</label><input id="email"><button>Enviar</button></form></body></html>`;
    expect(observableHtml(source)).toBe(source);
  });

  it("does not treat inert or disabled controls as actionable", () => {
    const source = `<main><div inert><a href="/comprar">Comprar</a></div><form><button disabled>Enviar</button><button>Continuar</button></form></main>`;
    expect(interactiveHtml(source)).not.toMatch(/Comprar|Enviar/);
    expect(interactiveHtml(source)).toContain("Continuar");
    expect(observableHtml(source)).toMatch(/Comprar|Enviar|Continuar/);
  });

  it("decodes Spanish named entities and legacy Windows-1252 pages", () => {
    expect(decodeHtmlEntities("Cotizaci&oacute;n, dise&ntilde;o y tel&eacute;fono")).toBe("Cotización, diseño y teléfono");
    const legacy = Uint8Array.from([0x3c, 0x68, 0x31, 0x3e, 0x44, 0x69, 0x73, 0x65, 0xf1, 0x6f, 0x3c, 0x2f, 0x68, 0x31, 0x3e]);
    expect(decodeHtmlBytes(legacy, "text/html; charset=iso-8859-1")).toContain("Diseño");
  });

  it("requires a usable mobile viewport instead of mere meta presence", () => {
    expect(supportsMobileViewport("width=device-width, initial-scale=1")).toBe(true);
    expect(supportsMobileViewport("width=1024, initial-scale=1")).toBe(false);
    expect(supportsMobileViewport("width=device-width, user-scalable=no")).toBe(false);
    expect(supportsMobileViewport("width=device-width; maximum-scale=1")).toBe(false);
  });

  it("keeps visible JSON-LD but removes schema hidden inside templates", () => {
    const visible = `<script type="application/ld+json">{"@type":"Organization"}</script>`;
    const hidden = `<template><script type="application/ld+json">{"@type":"Fake"}</script></template>`;
    expect(machineReadableHtml(`${visible}${hidden}`)).toContain("Organization");
    expect(machineReadableHtml(`${visible}${hidden}`)).not.toContain("Fake");
  });

  it("does not let unmatched closing tags escape a hidden ancestor", () => {
    const source = `<main><div hidden></span><h1>Fabricated proof</h1></div><h1>Visible proof</h1></main>`;
    const result = observableHtml(source);
    expect(result).not.toContain("Fabricated proof");
    expect(result).toContain("Visible proof");
  });

  it("bounds malformed and unclosed tag nesting without searching for every missing pair", () => {
    const source = `<main>${"<a href='/never-closes'>".repeat(MAX_HTML_DEPTH + 4_000)}`;
    const document = parseHtmlDocument(source);
    expect(document.truncated).toBe(true);
    expect(document.nodes.length).toBeLessThanOrEqual(MAX_HTML_NODES);
    expect(document.nodes.length).toBeLessThanOrEqual(MAX_HTML_DEPTH + 1);
    expect(document.tokenCount).toBeLessThanOrEqual(MAX_HTML_TOKENS);
  });

  it("drops an unclosed raw-text tail after a bounded forward scan", () => {
    const opening = `<script type="application/ld+json">`;
    const source = `${opening}{"@type":"Fabricated"}${"</style>".repeat(MAX_HTML_TOKENS + 4_000)}`;
    const filtered = machineReadableHtml(source);
    const document = parseHtmlDocument(filtered);

    expect(filtered).toBe(opening);
    expect(filtered).not.toContain("Fabricated");
    expect(document.truncated).toBe(true);
    expect(htmlNodes(document, "script")[0]?.closed).toBe(false);
  });

  it("caps both closed-node count and aggregate nested-subtree extraction", () => {
    const nestedGroup = `${"<div>".repeat(200)}proof${"</div>".repeat(200)}`;
    const source = nestedGroup.repeat(120);
    const document = parseHtmlDocument(source);
    const budget = createHtmlExtractionBudget();
    let extractedCharacters = 0;
    for (const node of htmlNodes(document, "div")) {
      extractedCharacters += budget.inner(document, node, 16_000).length;
    }

    expect(document.nodes.length).toBe(MAX_HTML_NODES);
    expect(document.truncated).toBe(true);
    expect(extractedCharacters).toBeLessThanOrEqual(MAX_HTML_EVIDENCE_CHARACTERS);
    expect(budget.consumed).toBe(extractedCharacters);
    expect(budget.remaining).toBe(MAX_HTML_EVIDENCE_CHARACTERS - extractedCharacters);
  });
});
