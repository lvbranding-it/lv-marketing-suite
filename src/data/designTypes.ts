export interface DesignContextField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'color' | 'style-select';
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface DesignType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'social' | 'web' | 'print' | 'email' | 'brand';
  previewAspect: string;
  canvasWidth: number;  // natural pixel width of the design canvas
  contextFields: DesignContextField[];
  systemPrompt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function extractHtml(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return trimmed;
  const match = trimmed.match(/```(?:html)?\s*\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return trimmed;
}

/** Extract CSS custom property values from generated HTML */
export function extractCssVars(html: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return vars;
  const lines = rootMatch[1].split(';');
  for (const line of lines) {
    const m = line.trim().match(/^(--[\w-]+)\s*:\s*(.+)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

/** Replace CSS custom property values in HTML string for live editing */
export function injectCssVars(html: string, overrides: Record<string, string>): string {
  let result = html;
  for (const [prop, value] of Object.entries(overrides)) {
    // Replace --prop: <anything>; inside :root block
    result = result.replace(
      new RegExp(`(${prop.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\s*:\\s*)[^;]+`),
      `$1${value}`
    );
  }
  return result;
}

// ─── System prompt base ────────────────────────────────────────────────────────

const BASE_HTML_RULES = `
OUTPUT RULES — CRITICAL:
• Output ONLY a raw, complete HTML document starting with <!DOCTYPE html>
• No markdown, no triple backticks, no explanation — pure HTML only
• Embed ALL styles inside a <style> block (Google Fonts <link> tags are allowed)
• No external image URLs — use CSS gradients, geometric shapes, emoji, or inline SVG
• EXCEPTION: If a Brand Logo data URL is provided in the user message (starting with "data:image/"), use it directly as the src of an <img> tag for the brand logo — do NOT create a CSS/SVG placeholder when a real logo is given
• Display the logo at a natural size appropriate to the design (typically 40–80px tall); preserve its aspect ratio with object-fit: contain
• Use modern CSS: flexbox, grid, gradients, box-shadow, border-radius, transitions
• Typography: load 1–2 Google Fonts matching the style (e.g. Inter, Playfair Display, DM Sans)
• The result must look polished, professional, and client-ready

CSS VARIABLES — REQUIRED:
Define ALL key design tokens as CSS custom properties in :root so the design can be live-edited:
  :root {
    --color-primary: #...;
    --color-secondary: #...;
    --color-accent: #...;
    --color-bg: #...;
    --color-text: #...;
    --color-text-muted: #...;
    --font-heading: 'Font Name', sans-serif;
    --font-body: 'Font Name', sans-serif;
    --radius: 12px;
  }
Use these variables everywhere in your CSS — never hardcode color hex values outside :root.
Match brand colors and style instructions exactly; if none given, choose a beautiful cohesive palette.
`.trim();

// ─── Design Types ──────────────────────────────────────────────────────────────

export const DESIGN_TYPES: DesignType[] = [
  // ── Social ──────────────────────────────────────────────────────────────────
  {
    id: 'social-post',
    name: 'Social Post',
    description: 'Square Instagram or Facebook post — bold, scroll-stopping visuals.',
    icon: '📱',
    category: 'social',
    previewAspect: '1/1',
    canvasWidth: 1080,
    contextFields: [
      { key: 'brand_name', label: 'Brand / Account name', type: 'text', required: true, placeholder: 'e.g. LV Branding' },
      { key: 'message', label: 'Main message or headline', type: 'textarea', required: true, placeholder: 'What should the post say?' },
      { key: 'subtext', label: 'Supporting text or CTA', type: 'text', required: false, placeholder: 'e.g. Link in bio · Shop now' },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'style', label: 'Visual style', type: 'style-select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Gradient & Vibrant'] },
    ],
    systemPrompt: `You are an elite social media designer creating a stunning Instagram/Facebook post graphic.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1080×1080px — set <html> and <body> to exactly width:1080px; height:1080px; overflow:hidden
• The entire canvas must be filled — no white gaps
• Use large, impactful typography as the hero element
• Include decorative shapes, geometric accents, or subtle textures via CSS
• Place brand name as a small but legible label
• Include any CTA text provided
• The design must work as a static image (no scroll needed)`,
  },
  {
    id: 'social-story',
    name: 'Story / Reel Cover',
    description: 'Vertical 9:16 story or reel cover with full-bleed design.',
    icon: '🎬',
    category: 'social',
    previewAspect: '9/16',
    canvasWidth: 1080,
    contextFields: [
      { key: 'brand_name', label: 'Brand / Account name', type: 'text', required: true },
      { key: 'headline', label: 'Headline or topic', type: 'text', required: true, placeholder: 'e.g. 5 Tips for Better Branding' },
      { key: 'subtext', label: 'Subtext or swipe-up CTA', type: 'text', required: false },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'style', label: 'Visual style', type: 'style-select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Gradient & Vibrant'] },
    ],
    systemPrompt: `You are an elite social media designer creating a vertical Instagram/TikTok story or reel cover.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1080×1920px — set <html> and <body> to exactly width:1080px; height:1920px; overflow:hidden
• Full-bleed background — the canvas must be completely filled
• Large bold headline near the center-upper area
• Brand name at top or bottom as a subtle watermark
• Keep critical content between y:250px–y:1670px (safe zone)
• Swipe-up CTA near the bottom (around y:1650px)`,
  },

  // ── Web ─────────────────────────────────────────────────────────────────────
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Hero section or full single-page landing page mockup.',
    icon: '🌐',
    category: 'web',
    previewAspect: '16/9',
    canvasWidth: 1280,
    contextFields: [
      { key: 'brand_name', label: 'Brand / Product name', type: 'text', required: true },
      { key: 'headline', label: 'Hero headline', type: 'text', required: true, placeholder: 'e.g. The smartest way to manage your team' },
      { key: 'subheadline', label: 'Sub-headline or value prop', type: 'textarea', required: false },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Start for free' },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'style', label: 'Visual style', type: 'style-select', required: false, options: ['SaaS / Tech', 'Agency / Creative', 'E-commerce', 'Minimal & Clean', 'Bold & Colorful', 'Dark Mode'] },
      { key: 'sections', label: 'Sections to include', type: 'select', required: false, options: ['Hero only', 'Hero + Features', 'Hero + Features + Testimonial', 'Hero + Pricing', 'Full page (all sections)'] },
    ],
    systemPrompt: `You are an elite UI/UX designer creating a beautiful landing page mockup.

${BASE_HTML_RULES}

DESIGN SPECS:
• Responsive width (max-width: 1280px, centered) — height scrolls naturally
• Include a navbar with logo + navigation links + CTA button
• Hero: large headline, sub-headline, CTA button(s), optional abstract visual (CSS shapes or SVG)
• Additional sections if requested: features grid (3-col cards), testimonials, pricing table, footer
• Consistent design system: one primary, one accent, neutral grays — all from CSS variables
• Cards with subtle shadows; buttons with :hover transitions
• Must look like a real, shippable product`,
  },
  {
    id: 'ad-banner',
    name: 'Ad Banner',
    description: 'Display ad in standard IAB sizes — leaderboard, rectangle, or skyscraper.',
    icon: '📣',
    category: 'web',
    previewAspect: '728/90',
    canvasWidth: 728,
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'headline', label: 'Ad headline', type: 'text', required: true, placeholder: 'e.g. Save 40% this week only' },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Shop Now' },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'size', label: 'Ad size', type: 'select', required: true, options: ['Leaderboard (728×90)', 'Medium Rectangle (300×250)', 'Half Page (300×600)', 'Wide Skyscraper (160×600)', 'Billboard (970×250)'] },
      { key: 'style', label: 'Visual style', type: 'style-select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful'] },
    ],
    systemPrompt: `You are an elite display advertising designer creating a high-converting ad banner.

${BASE_HTML_RULES}

DESIGN SPECS — exact pixel dimensions based on size field:
• Leaderboard: 728×90px | Medium Rectangle: 300×250px | Half Page: 300×600px
• Wide Skyscraper: 160×600px | Billboard: 970×250px
Set <html> and <body> to the exact pixel dimensions; overflow:hidden.
• Brand logo/name, headline, optional subtext, prominent CTA button
• High contrast CTA — must be immediately visible
• Simple and focused — no clutter`,
  },

  // ── Email ────────────────────────────────────────────────────────────────────
  {
    id: 'email-template',
    name: 'Email Template',
    description: 'Polished HTML email — newsletter, promo, or onboarding.',
    icon: '✉️',
    category: 'email',
    previewAspect: '3/4',
    canvasWidth: 640,
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'subject_context', label: 'Email purpose / subject', type: 'text', required: true, placeholder: 'e.g. Welcome email, Monthly newsletter' },
      { key: 'headline', label: 'Main headline', type: 'text', required: true },
      { key: 'body_content', label: 'Email body content', type: 'textarea', required: true, placeholder: 'Key message, sections, or bullet points...' },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Claim your offer' },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
    ],
    systemPrompt: `You are an expert email designer creating a beautiful, email-client-safe HTML email template.

${BASE_HTML_RULES}

DESIGN SPECS:
• Table-based layout for email compatibility (max-width: 600px, centered)
• Include: header with brand name (colored bar), hero section, body content, CTA button, footer with unsubscribe placeholder
• Inline styles on each element for Outlook compatibility (in addition to the <style> block)
• CTA button: table-based background-color approach
• Web-safe fallback fonts: Arial, Georgia
• Must look beautiful in a browser and be structurally sound for real email sending`,
  },

  // ── Print ────────────────────────────────────────────────────────────────────
  {
    id: 'poster-flyer',
    name: 'Poster / Flyer',
    description: 'Print-ready poster or promotional flyer.',
    icon: '🎨',
    category: 'print',
    previewAspect: '8.5/11',
    canvasWidth: 816,
    contextFields: [
      { key: 'brand_name', label: 'Brand / Organizer name', type: 'text', required: true },
      { key: 'event_title', label: 'Event or promo title', type: 'text', required: true, placeholder: 'e.g. Summer Sale · Grand Opening' },
      { key: 'details', label: 'Key details (date, time, location)', type: 'textarea', required: false },
      { key: 'tagline', label: 'Tagline or supporting copy', type: 'text', required: false },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'style', label: 'Visual style', type: 'style-select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Retro / Vintage'] },
    ],
    systemPrompt: `You are an elite graphic designer creating a stunning print poster or flyer.

${BASE_HTML_RULES}

DESIGN SPECS:
• Canvas: 816×1056px (US Letter at 96dpi) — set <html> and <body> to exactly width:816px; height:1056px; overflow:hidden
• High contrast, bold typography, clear visual hierarchy
• Structure: dominant headline → supporting details → brand name
• Geometric shapes, bold color blocks, or abstract patterns as background elements
• Typography hierarchy: Title > Details > Brand Name
• Must look ready to print — professional quality`,
  },

  // ── Brand ────────────────────────────────────────────────────────────────────
  {
    id: 'logo-concept',
    name: 'Logo Concept',
    description: 'SVG-based logo exploration — wordmark, lettermark, or icon combos.',
    icon: '✨',
    category: 'brand',
    previewAspect: '4/3',
    canvasWidth: 1200,
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'brand_description', label: 'What does the brand do?', type: 'textarea', required: true },
      { key: 'style', label: 'Logo style', type: 'select', required: true, options: ['Wordmark only', 'Lettermark / Monogram', 'Icon + Wordmark', 'Abstract mark + Text', 'Emblem / Badge'] },
      { key: 'brand_colors', label: 'Preferred colors', type: 'color', required: false },
      { key: 'mood', label: 'Brand mood', type: 'style-select', required: false, options: ['Professional & Trustworthy', 'Creative & Bold', 'Luxury & Premium', 'Friendly & Approachable', 'Tech & Innovative', 'Natural & Organic'] },
      { key: 'variations', label: 'Show variations?', type: 'select', required: false, options: ['Single concept', '3 variations', 'Light + Dark versions'] },
    ],
    systemPrompt: `You are a world-class brand identity designer creating logo concepts using SVG.

${BASE_HTML_RULES}

DESIGN SPECS:
• Canvas: 1200×900px — set <html> and <body> to width:1200px; height:900px; overflow:hidden
• Neutral background (white or off-white) to showcase the logo
• Single: center the logo large (min 400px wide)
• 3 variations: 3-column grid with labels
• Light + Dark: logo on white (left half) and dark background (right half)
• Logos built entirely with SVG: <path>, <rect>, <circle>, <text>, <polygon>
• No raster images — pure vector
• Include brand name as text using a Google Font
• Must look like a real logo deliverable`,
  },
  {
    id: 'presentation-slide',
    name: 'Presentation Slide',
    description: '16:9 presentation slide — pitch decks, reports, or keynotes.',
    icon: '📊',
    category: 'brand',
    previewAspect: '16/9',
    canvasWidth: 1280,
    contextFields: [
      { key: 'brand_name', label: 'Brand / Company name', type: 'text', required: true },
      { key: 'slide_title', label: 'Slide title', type: 'text', required: true },
      { key: 'content', label: 'Slide content / key points', type: 'textarea', required: true },
      { key: 'slide_type', label: 'Slide type', type: 'select', required: false, options: ['Title / Cover slide', 'Content / Text slide', 'Stats / Numbers slide', 'Quote slide', 'Team slide', 'Thank You slide'] },
      { key: 'brand_colors', label: 'Brand colors', type: 'color', required: false },
      { key: 'style', label: 'Deck style', type: 'style-select', required: false, options: ['Corporate & Professional', 'Creative & Bold', 'Minimal & Clean', 'Dark & Dramatic', 'Colorful & Modern'] },
    ],
    systemPrompt: `You are an elite presentation designer creating a polished 16:9 slide.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1280×720px — set <html> and <body> to exactly width:1280px; height:720px; overflow:hidden
• The entire slide must be filled — no white canvas gaps
• Slide structure: brand watermark (small, bottom-right), title area, content area
• Stats slides: large numbers with labels in columns
• Quote slides: large stylized quote with attribution
• Title slides: full-bleed background, centered brand + tagline
• Min 18px body, 36px+ titles — must read well on a projector`,
  },
];

export const DESIGN_CATEGORIES: Record<string, { label: string; color: string }> = {
  social: { label: 'Social Media', color: 'text-pink-600 bg-pink-50 border-pink-200' },
  web:    { label: 'Web & Digital', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  email:  { label: 'Email', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  print:  { label: 'Print', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  brand:  { label: 'Brand', color: 'text-teal-600 bg-teal-50 border-teal-200' },
};

export const STYLE_ICONS: Record<string, string> = {
  'Bold & Modern': '⚡',
  'Minimal & Clean': '◻',
  'Luxury & Elegant': '◆',
  'Playful & Colorful': '🎨',
  'Dark & Moody': '🌑',
  'Gradient & Vibrant': '🌈',
  'Retro / Vintage': '📻',
  'SaaS / Tech': '💻',
  'Agency / Creative': '✏️',
  'E-commerce': '🛍️',
  'Bold & Colorful': '🎯',
  'Dark Mode': '🌙',
  'Corporate & Professional': '🏢',
  'Creative & Bold': '🔥',
  'Dark & Dramatic': '🎭',
  'Colorful & Modern': '🎪',
  'Professional & Trustworthy': '🤝',
  'Luxury & Premium': '💎',
  'Friendly & Approachable': '😊',
  'Tech & Innovative': '🚀',
  'Natural & Organic': '🌿',
};

export function getDesignType(id: string): DesignType | undefined {
  return DESIGN_TYPES.find((t) => t.id === id);
}
