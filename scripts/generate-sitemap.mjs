import { writeFile } from "node:fs/promises";

/**
 * Emits dist/sitemap.xml for the publicly indexable pages.
 *
 * Only marketing pages belong here. Everything behind authentication is
 * excluded, and so is every route that carries a secret in its URL: a report
 * link, a signing link, an upload link and an intake link are all capabilities,
 * not pages, and submitting one to a search engine would publish it.
 *
 * The paths below must stay in step with public/robots.txt, which allows the
 * same set. A page missing from either one will not be indexed.
 */

const ORIGIN = "https://marketing.lvbranding.com";

const SERVICES = [
  "av-event-production-houston",
  "brand-strategy-identity-houston",
  "commercial-photography-video-production-houston",
  "creative-strategy-content-design-houston",
  "digital-marketing-paid-media-houston",
  "industry-web-solutions-web-app-development",
  "ux-ui-web-design-user-experiences-web-development",
];

/**
 * `alternates` names the same page in the other language so each URL can carry
 * hreflang. Search engines treat the pair as one page in two languages instead
 * of two competing pages.
 */
const PAGES = [
  ...SERVICES.map((slug) => ({
    path: `/${slug}`,
    priority: "0.8",
    alternates: { en: `/${slug}`, es: `/es/${slug}` },
  })),
  ...SERVICES.map((slug) => ({
    path: `/es/${slug}`,
    priority: "0.8",
    alternates: { en: `/${slug}`, es: `/es/${slug}` },
  })),
  {
    path: "/campaign-investment-calculator",
    priority: "0.9",
    alternates: {
      en: "/campaign-investment-calculator",
      es: "/es/calculadora-de-inversion-en-campanas",
    },
  },
  {
    path: "/es/calculadora-de-inversion-en-campanas",
    priority: "0.9",
    alternates: {
      en: "/campaign-investment-calculator",
      es: "/es/calculadora-de-inversion-en-campanas",
    },
  },
  {
    path: "/en/tools/website-opportunity-audit",
    priority: "0.9",
    alternates: {
      en: "/en/tools/website-opportunity-audit",
      es: "/es/tools/auditoria-de-oportunidades-web",
    },
  },
  {
    path: "/es/tools/auditoria-de-oportunidades-web",
    priority: "0.9",
    alternates: {
      en: "/en/tools/website-opportunity-audit",
      es: "/es/tools/auditoria-de-oportunidades-web",
    },
  },
  { path: "/qr-generator", priority: "0.6" },
  { path: "/image-studio", priority: "0.6" },
  { path: "/email-signature-generator", priority: "0.6" },
];

const lastmod = new Date().toISOString().slice(0, 10);

const entry = ({ path, priority, alternates }) => {
  const links = alternates
    ? Object.entries(alternates)
        .map(([lang, href]) =>
          `\n    <xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN}${href}" />`,
        )
        .join("") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${alternates.en}" />`
    : "";

  return `  <url>
    <loc>${ORIGIN}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>${links}
  </url>`;
};

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(entry).join("\n")}
</urlset>
`;

await writeFile(new URL("../dist/sitemap.xml", import.meta.url), xml);
console.log(`sitemap.xml: ${PAGES.length} public URLs`);
