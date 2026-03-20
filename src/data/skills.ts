import { SKILL_SYSTEM_PROMPTS } from './skillPrompts';

export type SkillCategory =
  | 'foundation'
  | 'conversion'
  | 'content'
  | 'seo'
  | 'paid'
  | 'measurement'
  | 'retention'
  | 'growth'
  | 'strategy'
  | 'sales';

export interface ContextField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  isFoundation?: boolean;
  systemPrompt: string;
  contextFields: ContextField[];
  icon: string; // emoji
}

export const SKILL_CATEGORIES: Record<SkillCategory, { label: string; color: string }> = {
  foundation: { label: 'Foundation', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  conversion: { label: 'Conversion', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  content: { label: 'Content & Copy', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  seo: { label: 'SEO & Discovery', color: 'text-green-600 bg-green-50 border-green-200' },
  paid: { label: 'Paid & Distribution', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  measurement: { label: 'Measurement', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  retention: { label: 'Retention', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  growth: { label: 'Growth', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  strategy: { label: 'Strategy', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  sales: { label: 'Sales & RevOps', color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

export const CATEGORY_BORDER_COLORS: Record<SkillCategory, string> = {
  foundation: 'border-t-amber-400',
  conversion: 'border-t-blue-400',
  content: 'border-t-purple-400',
  seo: 'border-t-green-400',
  paid: 'border-t-orange-400',
  measurement: 'border-t-cyan-400',
  retention: 'border-t-rose-400',
  growth: 'border-t-indigo-400',
  strategy: 'border-t-teal-400',
  sales: 'border-t-slate-400',
};

const SKILLS_DEF: Omit<Skill, 'systemPrompt'>[] = [
  // ── Foundation ──────────────────────────────────────────────────────────────
  {
    id: 'product-marketing-context',
    name: 'Product Marketing Context',
    description: 'Build the foundational context document that powers all other marketing skills.',
    category: 'foundation',
    isFoundation: true,
    icon: '🏗️',
    contextFields: [
      { key: 'product_name', label: 'Product / Company Name', type: 'text', required: true },
      { key: 'website', label: 'Website URL', type: 'url', required: false, placeholder: 'https://...' },
      { key: 'product_description', label: 'What does it do? (2–3 sentences)', type: 'textarea', required: true },
      { key: 'target_audience', label: 'Who is the target audience?', type: 'textarea', required: true },
    ],
  },

  // ── Conversion Optimization ─────────────────────────────────────────────────
  {
    id: 'page-cro',
    name: 'Page CRO',
    description: 'Optimize any marketing page for higher conversions with a structured audit and recommendations.',
    category: 'conversion',
    icon: '📈',
    contextFields: [
      { key: 'page_url', label: 'Page URL', type: 'url', required: false, placeholder: 'https://...' },
      { key: 'page_content', label: 'Page copy or description', type: 'textarea', required: true, placeholder: 'Paste the page content or describe it...' },
      { key: 'conversion_goal', label: 'Primary conversion goal', type: 'text', required: true, placeholder: 'e.g. sign up, book demo, purchase' },
      { key: 'traffic_source', label: 'Main traffic source', type: 'text', required: false, placeholder: 'e.g. organic, paid, email' },
    ],
  },
  {
    id: 'signup-flow-cro',
    name: 'Signup Flow CRO',
    description: 'Reduce friction and drop-off in your signup or registration flow.',
    category: 'conversion',
    icon: '✍️',
    contextFields: [
      { key: 'flow_description', label: 'Describe your current signup flow', type: 'textarea', required: true },
      { key: 'current_dropoff', label: 'Where do users drop off?', type: 'text', required: false },
      { key: 'product_type', label: 'Product type', type: 'select', required: true, options: ['SaaS', 'E-commerce', 'Marketplace', 'Mobile App', 'Other'] },
    ],
  },
  {
    id: 'onboarding-cro',
    name: 'Onboarding CRO',
    description: 'Improve activation rates and time-to-value in your user onboarding experience.',
    category: 'conversion',
    icon: '🚀',
    contextFields: [
      { key: 'onboarding_steps', label: 'Describe your current onboarding steps', type: 'textarea', required: true },
      { key: 'activation_event', label: 'What is your activation event?', type: 'text', required: true, placeholder: 'e.g. first project created, first import' },
      { key: 'current_activation_rate', label: 'Current activation rate (if known)', type: 'text', required: false },
    ],
  },
  {
    id: 'form-cro',
    name: 'Form CRO',
    description: 'Optimize lead capture, checkout, and contact forms for maximum completion.',
    category: 'conversion',
    icon: '📋',
    contextFields: [
      { key: 'form_purpose', label: 'What is this form for?', type: 'text', required: true, placeholder: 'e.g. lead capture, checkout, contact' },
      { key: 'form_fields', label: 'List current form fields', type: 'textarea', required: true },
      { key: 'completion_rate', label: 'Current completion rate (if known)', type: 'text', required: false },
    ],
  },
  {
    id: 'popup-cro',
    name: 'Popup CRO',
    description: 'Design high-converting popups and overlays that capture leads without destroying UX.',
    category: 'conversion',
    icon: '💬',
    contextFields: [
      { key: 'popup_goal', label: 'What should the popup achieve?', type: 'text', required: true, placeholder: 'e.g. email capture, discount offer, exit intent' },
      { key: 'trigger', label: 'When does it trigger?', type: 'text', required: false, placeholder: 'e.g. exit intent, 30s timer, scroll 50%' },
      { key: 'current_offer', label: 'Current offer or incentive', type: 'text', required: false },
    ],
  },
  {
    id: 'paywall-upgrade-cro',
    name: 'Paywall & Upgrade CRO',
    description: 'Increase free-to-paid conversion with better paywall and upgrade prompts.',
    category: 'conversion',
    icon: '💳',
    contextFields: [
      { key: 'current_paywall', label: 'Describe your current paywall or upgrade prompt', type: 'textarea', required: true },
      { key: 'free_tier_limits', label: 'What are the free tier limits?', type: 'textarea', required: false },
      { key: 'conversion_rate', label: 'Current free-to-paid rate (if known)', type: 'text', required: false },
    ],
  },

  // ── Content & Copy ──────────────────────────────────────────────────────────
  {
    id: 'copywriting',
    name: 'Copywriting',
    description: 'Write or rewrite high-converting marketing copy for any page, ad, or email.',
    category: 'content',
    icon: '✏️',
    contextFields: [
      { key: 'page_type', label: 'Type of copy needed', type: 'select', required: true, options: ['Homepage', 'Landing Page', 'Pricing Page', 'Feature Page', 'About Page', 'Email', 'Ad', 'Other'] },
      { key: 'existing_copy', label: 'Existing copy to rewrite (or leave blank for fresh copy)', type: 'textarea', required: false },
      { key: 'goal', label: 'Primary goal', type: 'text', required: true, placeholder: 'e.g. get sign-ups, drive demo bookings' },
      { key: 'audience', label: 'Specific audience for this copy', type: 'text', required: false },
    ],
  },
  {
    id: 'copy-editing',
    name: 'Copy Editing',
    description: 'Polish and improve existing marketing copy for clarity, tone, and persuasiveness.',
    category: 'content',
    icon: '🔍',
    contextFields: [
      { key: 'copy_to_edit', label: 'Copy to edit', type: 'textarea', required: true },
      { key: 'issues', label: 'What issues have been noted?', type: 'text', required: false, placeholder: 'e.g. too long, jargon-heavy, off-brand' },
      { key: 'target_tone', label: 'Desired tone', type: 'text', required: false, placeholder: 'e.g. conversational, professional, bold' },
    ],
  },
  {
    id: 'cold-email',
    name: 'Cold Email',
    description: 'Write personalized cold outreach emails that get replies.',
    category: 'content',
    icon: '📧',
    contextFields: [
      { key: 'prospect_role', label: 'Prospect job title / role', type: 'text', required: true },
      { key: 'prospect_company', label: 'Prospect company type or name', type: 'text', required: false },
      { key: 'offer', label: 'What are you offering?', type: 'textarea', required: true },
      { key: 'desired_cta', label: 'Desired call to action', type: 'text', required: true, placeholder: 'e.g. 15-min call, demo, free trial' },
    ],
  },
  {
    id: 'email-sequence',
    name: 'Email Sequence',
    description: 'Build automated email sequences for onboarding, nurture, or re-engagement.',
    category: 'content',
    icon: '📨',
    contextFields: [
      { key: 'sequence_type', label: 'Sequence type', type: 'select', required: true, options: ['Onboarding', 'Welcome', 'Nurture', 'Re-engagement', 'Post-purchase', 'Trial Expiry', 'Other'] },
      { key: 'audience_segment', label: 'Who receives this sequence?', type: 'text', required: true },
      { key: 'sequence_goal', label: 'Desired outcome', type: 'text', required: true, placeholder: 'e.g. activate users, convert trial, retain customers' },
      { key: 'num_emails', label: 'Number of emails', type: 'text', required: false, placeholder: 'e.g. 5' },
    ],
  },
  {
    id: 'social-content',
    name: 'Social Content',
    description: 'Create scroll-stopping social media posts, captions, and content calendars.',
    category: 'content',
    icon: '📱',
    contextFields: [
      { key: 'platform', label: 'Platform', type: 'select', required: true, options: ['LinkedIn', 'Instagram', 'Twitter/X', 'TikTok', 'Facebook', 'Multiple'] },
      { key: 'content_goal', label: 'Content goal', type: 'text', required: true, placeholder: 'e.g. brand awareness, lead gen, engagement' },
      { key: 'topic_or_theme', label: 'Topic, theme, or campaign', type: 'textarea', required: true },
      { key: 'num_posts', label: 'Number of posts', type: 'text', required: false, placeholder: 'e.g. 10' },
    ],
  },

  // ── SEO & Discovery ─────────────────────────────────────────────────────────
  {
    id: 'seo-audit',
    name: 'SEO Audit',
    description: 'Diagnose technical and on-page SEO issues with prioritized fix recommendations.',
    category: 'seo',
    icon: '🔎',
    contextFields: [
      { key: 'website_url', label: 'Website URL', type: 'url', required: true, placeholder: 'https://...' },
      { key: 'target_keywords', label: 'Target keywords (if known)', type: 'text', required: false },
      { key: 'main_issues', label: 'Known SEO issues or concerns', type: 'textarea', required: false },
    ],
  },
  {
    id: 'ai-seo',
    name: 'AI SEO',
    description: 'Optimize content to rank in AI-powered search results (ChatGPT, Perplexity, Google SGE).',
    category: 'seo',
    icon: '🤖',
    contextFields: [
      { key: 'target_topic', label: 'Topic to optimize for', type: 'text', required: true },
      { key: 'existing_content', label: 'Existing content or URL', type: 'textarea', required: false },
      { key: 'competitor_urls', label: 'Competitor URLs ranking for this topic', type: 'textarea', required: false },
    ],
  },
  {
    id: 'programmatic-seo',
    name: 'Programmatic SEO',
    description: 'Design and build programmatic SEO pages at scale using data-driven templates.',
    category: 'seo',
    icon: '⚙️',
    contextFields: [
      { key: 'website_type', label: 'Website type', type: 'select', required: true, options: ['SaaS', 'Marketplace', 'E-commerce', 'Directory', 'Content Site', 'Other'] },
      { key: 'target_keywords_pattern', label: 'Keyword pattern to target', type: 'text', required: true, placeholder: 'e.g. "best [tool] for [industry]"' },
      { key: 'data_source', label: 'Available data source', type: 'text', required: false, placeholder: 'e.g. CSV, database, API' },
    ],
  },
  {
    id: 'site-architecture',
    name: 'Site Architecture',
    description: 'Structure your site for maximum SEO crawlability and user navigation clarity.',
    category: 'seo',
    icon: '🗺️',
    contextFields: [
      { key: 'site_type', label: 'Site type', type: 'select', required: true, options: ['SaaS', 'E-commerce', 'Content Site', 'Agency', 'Startup', 'Other'] },
      { key: 'current_pages', label: 'List current main pages', type: 'textarea', required: false },
      { key: 'business_goals', label: 'Main business goals', type: 'text', required: true },
    ],
  },
  {
    id: 'competitor-alternatives',
    name: 'Competitor Alternatives',
    description: 'Create "alternative to [competitor]" landing pages to capture high-intent traffic.',
    category: 'seo',
    icon: '⚔️',
    contextFields: [
      { key: 'competitor_name', label: 'Competitor name', type: 'text', required: true },
      { key: 'competitor_url', label: 'Competitor URL', type: 'url', required: false },
      { key: 'your_differentiators', label: 'Your key differentiators vs this competitor', type: 'textarea', required: true },
    ],
  },
  {
    id: 'schema-markup',
    name: 'Schema Markup',
    description: 'Add structured data markup to improve rich results and search visibility.',
    category: 'seo',
    icon: '🏷️',
    contextFields: [
      { key: 'page_type', label: 'Page type', type: 'select', required: true, options: ['Homepage', 'Product/Service', 'Blog Post', 'FAQ', 'Pricing', 'About', 'Review', 'Other'] },
      { key: 'page_content', label: 'Page content or description', type: 'textarea', required: true },
      { key: 'schema_goals', label: 'Desired rich results', type: 'text', required: false, placeholder: 'e.g. FAQ snippet, review stars, product info' },
    ],
  },

  // ── Paid & Distribution ─────────────────────────────────────────────────────
  {
    id: 'paid-ads',
    name: 'Paid Ads',
    description: 'Build and optimize paid advertising campaigns across Google, Meta, and LinkedIn.',
    category: 'paid',
    icon: '💰',
    contextFields: [
      { key: 'platform', label: 'Ad platform', type: 'select', required: true, options: ['Google Ads', 'Meta Ads', 'LinkedIn Ads', 'TikTok Ads', 'Multiple'] },
      { key: 'campaign_goal', label: 'Campaign goal', type: 'select', required: true, options: ['Lead Generation', 'Brand Awareness', 'Conversions', 'App Installs', 'Retargeting'] },
      { key: 'budget', label: 'Monthly budget (approx)', type: 'text', required: false, placeholder: 'e.g. $2,000/mo' },
      { key: 'target_audience', label: 'Target audience', type: 'textarea', required: true },
    ],
  },
  {
    id: 'ad-creative',
    name: 'Ad Creative',
    description: 'Write high-converting ad copy and creative briefs for any platform.',
    category: 'paid',
    icon: '🎨',
    contextFields: [
      { key: 'ad_platform', label: 'Ad platform', type: 'select', required: true, options: ['Google Search', 'Google Display', 'Meta/Instagram', 'LinkedIn', 'TikTok', 'Other'] },
      { key: 'ad_format', label: 'Ad format', type: 'text', required: false, placeholder: 'e.g. single image, carousel, video' },
      { key: 'offer', label: 'Offer or message', type: 'textarea', required: true },
      { key: 'audience', label: 'Target audience', type: 'text', required: true },
    ],
  },

  // ── Measurement & Testing ───────────────────────────────────────────────────
  {
    id: 'analytics-tracking',
    name: 'Analytics Tracking',
    description: 'Set up proper analytics tracking to measure what matters for your business.',
    category: 'measurement',
    icon: '📊',
    contextFields: [
      { key: 'analytics_tool', label: 'Analytics tool', type: 'select', required: true, options: ['Google Analytics 4', 'Mixpanel', 'Amplitude', 'Heap', 'PostHog', 'Other'] },
      { key: 'business_goals', label: 'Key business goals to track', type: 'textarea', required: true },
      { key: 'current_tracking', label: 'What is currently tracked?', type: 'text', required: false },
    ],
  },
  {
    id: 'ab-test-setup',
    name: 'A/B Test Setup',
    description: 'Design statistically sound A/B tests with clear hypotheses and success metrics.',
    category: 'measurement',
    icon: '🧪',
    contextFields: [
      { key: 'element_to_test', label: 'What element are you testing?', type: 'text', required: true, placeholder: 'e.g. headline, CTA button, pricing' },
      { key: 'hypothesis', label: 'Your hypothesis', type: 'textarea', required: true, placeholder: 'If we change X, we expect Y because...' },
      { key: 'monthly_traffic', label: 'Monthly page visitors', type: 'text', required: false },
      { key: 'current_conversion_rate', label: 'Current conversion rate', type: 'text', required: false },
    ],
  },

  // ── Retention ───────────────────────────────────────────────────────────────
  {
    id: 'churn-prevention',
    name: 'Churn Prevention',
    description: 'Identify at-risk users and build interventions to reduce churn.',
    category: 'retention',
    icon: '🔒',
    contextFields: [
      { key: 'churn_rate', label: 'Current churn rate', type: 'text', required: false, placeholder: 'e.g. 5% monthly' },
      { key: 'churn_signals', label: 'Known churn signals or patterns', type: 'textarea', required: false },
      { key: 'business_model', label: 'Business model', type: 'select', required: true, options: ['SaaS', 'Subscription', 'Marketplace', 'E-commerce', 'Other'] },
      { key: 'customer_segment', label: 'Customer segment to focus on', type: 'text', required: false },
    ],
  },

  // ── Growth Engineering ──────────────────────────────────────────────────────
  {
    id: 'free-tool-strategy',
    name: 'Free Tool Strategy',
    description: 'Design free tools that generate SEO traffic and top-of-funnel leads.',
    category: 'growth',
    icon: '🛠️',
    contextFields: [
      { key: 'business_category', label: 'Business / industry', type: 'text', required: true },
      { key: 'target_audience', label: 'Target audience', type: 'textarea', required: true },
      { key: 'existing_tools', label: 'Existing free tools (if any)', type: 'text', required: false },
    ],
  },
  {
    id: 'referral-program',
    name: 'Referral Program',
    description: 'Design a referral program that turns customers into your best growth channel.',
    category: 'growth',
    icon: '🤝',
    contextFields: [
      { key: 'product_type', label: 'Product type', type: 'select', required: true, options: ['SaaS', 'E-commerce', 'Consumer App', 'Marketplace', 'Service', 'Other'] },
      { key: 'current_nps', label: 'Current NPS or satisfaction score', type: 'text', required: false },
      { key: 'reward_budget', label: 'Reward budget range', type: 'text', required: false, placeholder: 'e.g. $10–$25 per referral' },
    ],
  },

  // ── Strategy & Monetization ─────────────────────────────────────────────────
  {
    id: 'marketing-ideas',
    name: 'Marketing Ideas',
    description: 'Generate 10–20 actionable marketing ideas tailored to your product and stage.',
    category: 'strategy',
    icon: '💡',
    contextFields: [
      { key: 'growth_stage', label: 'Growth stage', type: 'select', required: true, options: ['Pre-launch', 'Early (0–100 customers)', 'Growth (100–1k)', 'Scale (1k+)', 'Enterprise'] },
      { key: 'biggest_challenge', label: 'Biggest marketing challenge right now', type: 'textarea', required: true },
      { key: 'channels_tried', label: 'Channels already tried', type: 'text', required: false },
    ],
  },
  {
    id: 'marketing-psychology',
    name: 'Marketing Psychology',
    description: 'Apply proven psychological principles to increase conversions and persuasion.',
    category: 'strategy',
    icon: '🧠',
    contextFields: [
      { key: 'use_case', label: 'Where to apply psychology', type: 'text', required: true, placeholder: 'e.g. homepage, pricing, checkout, email' },
      { key: 'target_behavior', label: 'Desired user behavior', type: 'text', required: true, placeholder: 'e.g. sign up, upgrade, share' },
      { key: 'current_obstacles', label: 'Current obstacles to that behavior', type: 'textarea', required: false },
    ],
  },
  {
    id: 'launch-strategy',
    name: 'Launch Strategy',
    description: 'Plan and execute a successful product or feature launch.',
    category: 'strategy',
    icon: '🚀',
    contextFields: [
      { key: 'launch_type', label: 'What are you launching?', type: 'text', required: true, placeholder: 'e.g. new product, feature, rebrand, market' },
      { key: 'launch_date', label: 'Target launch date', type: 'text', required: false },
      { key: 'launch_goal', label: 'Primary launch goal', type: 'text', required: true, placeholder: 'e.g. 500 signups, $10k MRR, 1k waitlist' },
      { key: 'audience', label: 'Target audience', type: 'text', required: true },
    ],
  },
  {
    id: 'pricing-strategy',
    name: 'Pricing Strategy',
    description: 'Design a pricing model that maximizes revenue and reduces friction.',
    category: 'strategy',
    icon: '💵',
    contextFields: [
      { key: 'current_pricing', label: 'Current pricing model (if any)', type: 'textarea', required: false },
      { key: 'business_model', label: 'Business model', type: 'select', required: true, options: ['SaaS', 'Usage-based', 'Freemium', 'One-time', 'Subscription', 'Marketplace', 'Other'] },
      { key: 'customer_segments', label: 'Customer segments', type: 'textarea', required: true },
      { key: 'competitors_pricing', label: 'Competitor pricing (if known)', type: 'text', required: false },
    ],
  },
  {
    id: 'content-strategy',
    name: 'Content Strategy',
    description: 'Build a content strategy that drives organic traffic, trust, and pipeline.',
    category: 'strategy',
    icon: '📰',
    contextFields: [
      { key: 'content_goal', label: 'Primary content goal', type: 'select', required: true, options: ['SEO / Organic Traffic', 'Thought Leadership', 'Lead Generation', 'Community Building', 'All of the above'] },
      { key: 'current_content', label: 'Current content efforts', type: 'text', required: false, placeholder: 'e.g. blog 2x/week, no newsletter' },
      { key: 'resources', label: 'Available resources', type: 'text', required: false, placeholder: 'e.g. 1 writer, founder-led, agency' },
    ],
  },
  {
    id: 'lead-magnets',
    name: 'Lead Magnets',
    description: 'Design high-value lead magnets that attract and convert your ideal customers.',
    category: 'strategy',
    icon: '🧲',
    contextFields: [
      { key: 'target_persona', label: 'Target persona', type: 'text', required: true },
      { key: 'main_pain_point', label: 'Main pain point to address', type: 'textarea', required: true },
      { key: 'preferred_format', label: 'Preferred format', type: 'select', required: false, options: ['Any', 'Template', 'Checklist', 'Guide/eBook', 'Calculator', 'Email Course', 'Webinar', 'Tool'] },
    ],
  },

  // ── Sales & RevOps ──────────────────────────────────────────────────────────
  {
    id: 'revops',
    name: 'RevOps',
    description: 'Align marketing, sales, and customer success around unified revenue operations.',
    category: 'sales',
    icon: '⚙️',
    contextFields: [
      { key: 'current_stack', label: 'Current tech stack', type: 'textarea', required: false, placeholder: 'e.g. HubSpot CRM, Outreach, Stripe' },
      { key: 'team_size', label: 'Sales/CS team size', type: 'text', required: false },
      { key: 'main_bottleneck', label: 'Main revenue bottleneck', type: 'textarea', required: true },
    ],
  },
  {
    id: 'sales-enablement',
    name: 'Sales Enablement',
    description: 'Build sales materials, battle cards, and playbooks that close more deals.',
    category: 'sales',
    icon: '🎯',
    contextFields: [
      { key: 'deliverable_type', label: 'What to create', type: 'select', required: true, options: ['Battle Card', 'Case Study', 'One-Pager', 'Demo Script', 'Objection Handling', 'Sales Playbook', 'Email Templates'] },
      { key: 'target_buyer', label: 'Target buyer / persona', type: 'text', required: true },
      { key: 'deal_stage', label: 'Deal stage context', type: 'text', required: false, placeholder: 'e.g. discovery, demo, closing' },
    ],
  },
];

// Patch in system prompts
export const SKILLS: Skill[] = SKILLS_DEF.map((skill) => ({
  ...skill,
  systemPrompt: SKILL_SYSTEM_PROMPTS[skill.id] ?? '',
}));

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return SKILLS.filter((s) => s.category === category);
}

export const FEATURED_SKILL_IDS = ['copywriting', 'page-cro', 'social-content'];
