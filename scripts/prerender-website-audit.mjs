import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const origin = "https://marketing.lvbranding.com";
const routes = {
  en: "/en/tools/website-opportunity-audit",
  es: "/es/tools/auditoria-de-oportunidades-web",
};
/**
 * Title and description are read from the shared copy catalogs rather than
 * repeated here. `AuditShell` sets the same two values on the client during
 * navigation, so a second copy in this file would silently drift: the crawler
 * would see one sentence and the visitor another.
 *
 * `noEmit` is set for this project, so there is no compiled JS to import and the
 * values are lifted from the TypeScript source. That is why this throws instead
 * of falling back to a default; a rename should fail the build loudly rather
 * than publish stale metadata.
 */
async function metadataFor(language) {
  const file = new URL(
    `../supabase/functions/_shared/website-audit/copy/${language}.ts`,
    import.meta.url,
  );
  const source = await readFile(file, "utf8");
  const meta = /\bmeta:\s*\{([\s\S]*?)\n\s{2}\}/.exec(source);
  if (!meta) throw new Error(`Could not find the meta block in copy/${language}.ts`);

  const read = (key) => {
    const found = new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(meta[1]);
    if (!found) throw new Error(`Could not read meta.${key} from copy/${language}.ts`);
    return found[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  };

  return { title: read("title"), description: read("description") };
}

const metadata = {
  en: await metadataFor("en"),
  es: await metadataFor("es"),
};

function shell(language, indexable) {
  const canonical = `${origin}${routes[language]}`;
  const head = [
    `<meta name="description" content="${metadata[language].description}" />`,
    `<meta name="robots" content="${indexable ? "index,follow" : "noindex,nofollow"}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<link rel="alternate" hreflang="en" href="${origin}${routes.en}" />`,
    `<link rel="alternate" hreflang="es" href="${origin}${routes.es}" />`,
    `<link rel="alternate" hreflang="x-default" href="${origin}${routes.en}" />`,
  ].join("\n    ");
  return source
    .replace(/<html\s+lang="[^"]*">/i, `<html lang="${language}">`)
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${metadata[language].title}</title>`)
    .replace("</head>", `    ${head}\n  </head>`);
}

await Promise.all([
  writeFile(new URL("../dist/website-audit-en.html", import.meta.url), shell("en", true)),
  writeFile(new URL("../dist/website-audit-es.html", import.meta.url), shell("es", true)),
  writeFile(new URL("../dist/website-audit-private-en.html", import.meta.url), shell("en", false)),
  writeFile(new URL("../dist/website-audit-private-es.html", import.meta.url), shell("es", false)),
]);
