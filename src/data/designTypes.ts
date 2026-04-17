export interface DesignContextField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'color';
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
  previewAspect: string; // CSS aspect-ratio value e.g. "1/1", "16/9"
  contextFields: DesignContextField[];
  systemPrompt: string;
}

const BASE_HTML_RULES = `
OUTPUT RULES — CRITICAL:
• Output ONLY a raw, complete HTML document starting with <!DOCTYPE html>
• No markdown, no triple backticks, no explanation text — pure HTML only
• Embed ALL styles inside a <style> block — no external CSS files (Google Fonts <link> tags are allowed)
• No external image URLs — use CSS gradients, geometric shapes, emoji, or inline SVG for visuals
• Use modern CSS: custom properties, flexbox, grid, gradients, box-shadow, border-radius, animations
• Typography: load 1–2 Google Fonts that match the requested style (e.g. Inter, Playfair Display, DM Sans)
• The result must be visually polished, professional, and ready to present to a client
• Match the brand colors and style instructions exactly; if none given, choose a cohesive palette
`.trim();

export const DESIGN_TYPES: DesignType[] = [
  // ── Social ────────────────────────────────────────────────────────────────
  {
    id: 'social-post',
    name: 'Social Post',
    description: 'Square Instagram or Facebook post — bold, scroll-stopping visuals.',
    icon: '📱',
    category: 'social',
    previewAspect: '1/1',
    contextFields: [
      { key: 'brand_name', label: 'Brand / Account name', type: 'text', required: true, placeholder: 'e.g. LV Branding' },
      { key: 'message', label: 'Main message or headline', type: 'textarea', required: true, placeholder: 'What should the post say?' },
      { key: 'subtext', label: 'Supporting text or CTA', type: 'text', required: false, placeholder: 'e.g. Link in bio · Shop now' },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false, placeholder: 'e.g. #1a1a2e, #e94560' },
      { key: 'style', label: 'Visual style', type: 'select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Gradient & Vibrant'] },
    ],
    systemPrompt: `You are an elite social media designer creating a stunning Instagram/Facebook post graphic.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1080×1080px — set <html> and <body> to exactly width:1080px; height:1080px; overflow:hidden
• The entire canvas must be filled — no white gaps
• Use large, impactful typography as the hero element
• Include decorative shapes, geometric accents, or subtle textures
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
    contextFields: [
      { key: 'brand_name', label: 'Brand / Account name', type: 'text', required: true },
      { key: 'headline', label: 'Headline or topic', type: 'text', required: true, placeholder: 'e.g. 5 Tips for Better Branding' },
      { key: 'subtext', label: 'Subtext or swipe-up CTA', type: 'text', required: false },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false, placeholder: 'e.g. #6c63ff, #f5f5f5' },
      { key: 'style', label: 'Visual style', type: 'select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Gradient & Vibrant'] },
    ],
    systemPrompt: `You are an elite social media designer creating a vertical Instagram/TikTok story or reel cover.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1080×1920px — set <html> and <body> to exactly width:1080px; height:1920px; overflow:hidden
• Full-bleed background — the canvas must be completely filled
• Large bold headline near the center-upper area
• Brand name at the top or bottom as a subtle watermark
• Use safe zones: keep critical content between 250px–1670px vertically
• Swipe-up CTA or subtext near the bottom (around y:1650px)`,
  },

  // ── Web ───────────────────────────────────────────────────────────────────
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Hero section or full single-page landing page mockup.',
    icon: '🌐',
    category: 'web',
    previewAspect: '16/9',
    contextFields: [
      { key: 'brand_name', label: 'Brand / Product name', type: 'text', required: true },
      { key: 'headline', label: 'Hero headline', type: 'text', required: true, placeholder: 'e.g. The smartest way to manage your team' },
      { key: 'subheadline', label: 'Sub-headline or value prop', type: 'textarea', required: false },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Start for free' },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false, placeholder: 'e.g. #4f46e5, #ffffff' },
      { key: 'style', label: 'Visual style', type: 'select', required: false, options: ['SaaS / Tech', 'Agency / Creative', 'E-commerce', 'Minimal & Clean', 'Bold & Colorful', 'Dark Mode'] },
      { key: 'sections', label: 'Sections to include', type: 'select', required: false, options: ['Hero only', 'Hero + Features', 'Hero + Features + Testimonial', 'Hero + Pricing', 'Full page (all sections)'] },
    ],
    systemPrompt: `You are an elite UI/UX designer creating a beautiful landing page mockup.

${BASE_HTML_RULES}

DESIGN SPECS:
• Responsive width (max-width: 1280px, centered) — height scrolls naturally
• Include a navbar with logo + navigation links + CTA button
• Hero section: large headline, sub-headline, CTA button(s), optional visual element (abstract shape, device mockup using CSS, or illustration using SVG)
• If additional sections requested: features grid (3-column cards), social proof/testimonials, pricing table, or footer
• Use a consistent design system: one primary color, one accent, neutral grays
• Cards should have subtle shadows; buttons should have hover states (CSS :hover)
• The page must look like a real, shippable product`,
  },
  {
    id: 'ad-banner',
    name: 'Ad Banner',
    description: 'Display ad in standard IAB sizes — leaderboard, medium rectangle, or skyscraper.',
    icon: '📣',
    category: 'web',
    previewAspect: '728/90',
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'headline', label: 'Ad headline', type: 'text', required: true, placeholder: 'e.g. Save 40% this week only' },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Shop Now' },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false },
      { key: 'size', label: 'Ad size', type: 'select', required: true, options: ['Leaderboard (728×90)', 'Medium Rectangle (300×250)', 'Half Page (300×600)', 'Wide Skyscraper (160×600)', 'Billboard (970×250)'] },
      { key: 'style', label: 'Visual style', type: 'select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful'] },
    ],
    systemPrompt: `You are an elite display advertising designer creating a high-converting ad banner.

${BASE_HTML_RULES}

DESIGN SPECS — pick dimensions based on the size field:
• Leaderboard: 728×90px
• Medium Rectangle: 300×250px
• Half Page: 300×600px
• Wide Skyscraper: 160×600px
• Billboard: 970×250px

Set <html> and <body> to the exact pixel dimensions above; overflow:hidden.
• Include brand logo/name, headline, optional subtext, and a CTA button
• The CTA button must be prominent and high-contrast
• Design for immediate visual impact — the eye should land on headline → CTA within 1 second
• Keep the design simple and focused — no clutter`,
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  {
    id: 'email-template',
    name: 'Email Template',
    description: 'Polished HTML email template — newsletter, promo, or onboarding.',
    icon: '✉️',
    category: 'email',
    previewAspect: '3/4',
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'subject_context', label: 'Email purpose / subject', type: 'text', required: true, placeholder: 'e.g. Welcome email, Monthly newsletter, Promo offer' },
      { key: 'headline', label: 'Main headline', type: 'text', required: true },
      { key: 'body_content', label: 'Email body content', type: 'textarea', required: true, placeholder: 'Key message, sections, or bullet points...' },
      { key: 'cta_text', label: 'CTA button text', type: 'text', required: false, placeholder: 'e.g. Claim your offer' },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false },
    ],
    systemPrompt: `You are an expert email designer creating a beautiful, email-client-safe HTML email template.

${BASE_HTML_RULES}

DESIGN SPECS:
• Use table-based layout for email client compatibility (max-width: 600px, centered)
• Include: header with logo/brand name (colored bar), hero section with headline, body content, CTA button, footer with unsubscribe placeholder
• All styles must be inline on each element (not just in <style> — email clients strip <style>)
• CTA button must use a table with background-color (not CSS background-image) for Outlook compatibility
• Use web-safe fonts as fallback: Arial, Georgia — Google Fonts as primary
• The design must look beautiful in a browser preview and be structurally sound for real email sending`,
  },

  // ── Print ─────────────────────────────────────────────────────────────────
  {
    id: 'poster-flyer',
    name: 'Poster / Flyer',
    description: 'Print-ready poster or promotional flyer — events, announcements, promotions.',
    icon: '🎨',
    category: 'print',
    previewAspect: '8.5/11',
    contextFields: [
      { key: 'brand_name', label: 'Brand / Organizer name', type: 'text', required: true },
      { key: 'event_title', label: 'Event or promo title', type: 'text', required: true, placeholder: 'e.g. Summer Sale · Grand Opening · Workshop' },
      { key: 'details', label: 'Key details (date, time, location, etc.)', type: 'textarea', required: false },
      { key: 'tagline', label: 'Tagline or supporting copy', type: 'text', required: false },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false },
      { key: 'style', label: 'Visual style', type: 'select', required: false, options: ['Bold & Modern', 'Minimal & Clean', 'Luxury & Elegant', 'Playful & Colorful', 'Dark & Moody', 'Retro / Vintage', 'Hand-drawn Feel'] },
    ],
    systemPrompt: `You are an elite graphic designer creating a stunning print poster or flyer.

${BASE_HTML_RULES}

DESIGN SPECS:
• Canvas: 816×1056px (US Letter at 96dpi) — set <html> and <body> to exactly width:816px; height:1056px; overflow:hidden
• Design for print: high contrast, bold typography, clear visual hierarchy
• Structure: dominant headline (large, impactful), supporting details (date/time/location as styled text), brand name, optional decorative elements
• Use geometric shapes, bold color blocks, or abstract patterns as background elements
• Typography hierarchy: Title > Details > Brand Name
• The design must look ready to print and hand out — professional quality`,
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  {
    id: 'logo-concept',
    name: 'Logo Concept',
    description: 'SVG-based logo exploration — wordmark, lettermark, or icon + text combos.',
    icon: '✨',
    category: 'brand',
    previewAspect: '4/3',
    contextFields: [
      { key: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { key: 'brand_description', label: 'What does the brand do?', type: 'textarea', required: true, placeholder: 'Brief description of the brand...' },
      { key: 'style', label: 'Logo style', type: 'select', required: true, options: ['Wordmark only', 'Lettermark / Monogram', 'Icon + Wordmark', 'Abstract mark + Text', 'Emblem / Badge'] },
      { key: 'brand_colors', label: 'Preferred colors', type: 'text', required: false },
      { key: 'mood', label: 'Brand mood / personality', type: 'select', required: false, options: ['Professional & Trustworthy', 'Creative & Bold', 'Luxury & Premium', 'Friendly & Approachable', 'Tech & Innovative', 'Natural & Organic'] },
      { key: 'variations', label: 'Show variations?', type: 'select', required: false, options: ['Single concept', '3 variations', 'Light + Dark versions'] },
    ],
    systemPrompt: `You are a world-class brand identity designer creating logo concepts using SVG.

${BASE_HTML_RULES}

DESIGN SPECS:
• Canvas: 1200×900px — set <html> and <body> to width:1200px; height:900px; overflow:hidden
• Background: neutral (white, off-white, or very light gray) to showcase the logo
• If single: center the logo large (min 400px wide)
• If 3 variations: arrange them in a 3-column grid with labels beneath each
• If Light + Dark: show logo on white background (left half) and on dark background (right half)
• Logos must be built entirely with SVG elements: <path>, <rect>, <circle>, <text>, <polygon>
• No raster images — pure vector geometry
• Include the brand name as text in the logo using a carefully chosen Google Font
• The result must look like a real logo deliverable, not a placeholder`,
  },

  {
    id: 'presentation-slide',
    name: 'Presentation Slide',
    description: '16:9 presentation slide — pitch decks, reports, or keynotes.',
    icon: '📊',
    category: 'brand',
    previewAspect: '16/9',
    contextFields: [
      { key: 'brand_name', label: 'Brand / Company name', type: 'text', required: true },
      { key: 'slide_title', label: 'Slide title', type: 'text', required: true },
      { key: 'content', label: 'Slide content / key points', type: 'textarea', required: true, placeholder: 'Bullet points, stats, or paragraph...' },
      { key: 'slide_type', label: 'Slide type', type: 'select', required: false, options: ['Title / Cover slide', 'Content / Text slide', 'Stats / Numbers slide', 'Quote slide', 'Team slide', 'Thank You slide'] },
      { key: 'brand_colors', label: 'Brand colors', type: 'text', required: false },
      { key: 'style', label: 'Deck style', type: 'select', required: false, options: ['Corporate & Professional', 'Creative & Bold', 'Minimal & Clean', 'Dark & Dramatic', 'Colorful & Modern'] },
    ],
    systemPrompt: `You are an elite presentation designer creating a polished 16:9 slide.

${BASE_HTML_RULES}

DESIGN SPECS:
• Viewport: 1280×720px — set <html> and <body> to exactly width:1280px; height:720px; overflow:hidden
• The entire slide must be filled — no white canvas gaps
• Clean slide structure with: slide number or brand watermark (small, bottom-right), title area, content area
• For stats slides: use large numbers with labels, arranged in columns
• For quote slides: large stylized quote with attribution
• For title slides: full-bleed background with centered brand name + tagline
• Typography must scale well on a projector — min 18px for body, 36px+ for titles
• Use brand colors consistently throughout`,
  },
];

export const DESIGN_CATEGORIES: Record<string, { label: string; color: string }> = {
  social: { label: 'Social Media', color: 'text-pink-600 bg-pink-50 border-pink-200' },
  web:    { label: 'Web & Digital', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  email:  { label: 'Email', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  print:  { label: 'Print', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  brand:  { label: 'Brand', color: 'text-teal-600 bg-teal-50 border-teal-200' },
};

export function getDesignType(id: string): DesignType | undefined {
  return DESIGN_TYPES.find((t) => t.id === id);
}

export function extractHtml(text: string): string {
  const trimmed = text.trim();
  // Already raw HTML
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return trimmed;
  // Wrapped in markdown code block
  const match = trimmed.match(/```(?:html)?\s*\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return trimmed;
}
