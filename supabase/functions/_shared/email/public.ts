import { wrapHtml } from './template.ts';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const defaults: Record<string, string> = { first_name: 'there', last_name: '', company: 'your company', title: '', email: '' };
export const publicMerge = (value: string) => value.replace(/\{\{(\w+)\}\}/g, (_, key) => defaults[key] ?? '');

export function renderPublicEmail(campaign: { subject: string; preview_text: string | null; body_html: string }) {
  const title = escapeHtml(publicMerge(campaign.subject));
  const description = escapeHtml(publicMerge(campaign.preview_text || 'News and insights from LV Branding.'));
  return wrapHtml(publicMerge(campaign.body_html), null).replace('<title></title>', `<title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="noindex, nofollow">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://lv-marketing-suite.vercel.app/lv-logo.png">
  <meta name="twitter:card" content="summary">`);
}
