// Vite ?raw imports — all 33 SKILL.md files bundled as static strings at build time
import abTestSetup from './skills/ab-test-setup.md?raw';
import adCreative from './skills/ad-creative.md?raw';
import aiSeo from './skills/ai-seo.md?raw';
import analyticsTracking from './skills/analytics-tracking.md?raw';
import churnPrevention from './skills/churn-prevention.md?raw';
import coldEmail from './skills/cold-email.md?raw';
import competitorAlternatives from './skills/competitor-alternatives.md?raw';
import contentStrategy from './skills/content-strategy.md?raw';
import copyEditing from './skills/copy-editing.md?raw';
import copywriting from './skills/copywriting.md?raw';
import emailSequence from './skills/email-sequence.md?raw';
import formCro from './skills/form-cro.md?raw';
import freeToolStrategy from './skills/free-tool-strategy.md?raw';
import launchStrategy from './skills/launch-strategy.md?raw';
import leadMagnets from './skills/lead-magnets.md?raw';
import marketingIdeas from './skills/marketing-ideas.md?raw';
import marketingPsychology from './skills/marketing-psychology.md?raw';
import onboardingCro from './skills/onboarding-cro.md?raw';
import pageCro from './skills/page-cro.md?raw';
import paidAds from './skills/paid-ads.md?raw';
import paywallUpgradeCro from './skills/paywall-upgrade-cro.md?raw';
import popupCro from './skills/popup-cro.md?raw';
import pricingStrategy from './skills/pricing-strategy.md?raw';
import productMarketingContext from './skills/product-marketing-context.md?raw';
import programmaticSeo from './skills/programmatic-seo.md?raw';
import referralProgram from './skills/referral-program.md?raw';
import revops from './skills/revops.md?raw';
import salesEnablement from './skills/sales-enablement.md?raw';
import schemaMarkup from './skills/schema-markup.md?raw';
import seoAudit from './skills/seo-audit.md?raw';
import signupFlowCro from './skills/signup-flow-cro.md?raw';
import siteArchitecture from './skills/site-architecture.md?raw';
import socialContent from './skills/social-content.md?raw';

export const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  'ab-test-setup': abTestSetup,
  'ad-creative': adCreative,
  'ai-seo': aiSeo,
  'analytics-tracking': analyticsTracking,
  'churn-prevention': churnPrevention,
  'cold-email': coldEmail,
  'competitor-alternatives': competitorAlternatives,
  'content-strategy': contentStrategy,
  'copy-editing': copyEditing,
  'copywriting': copywriting,
  'email-sequence': emailSequence,
  'form-cro': formCro,
  'free-tool-strategy': freeToolStrategy,
  'launch-strategy': launchStrategy,
  'lead-magnets': leadMagnets,
  'marketing-ideas': marketingIdeas,
  'marketing-psychology': marketingPsychology,
  'onboarding-cro': onboardingCro,
  'page-cro': pageCro,
  'paid-ads': paidAds,
  'paywall-upgrade-cro': paywallUpgradeCro,
  'popup-cro': popupCro,
  'pricing-strategy': pricingStrategy,
  'product-marketing-context': productMarketingContext,
  'programmatic-seo': programmaticSeo,
  'referral-program': referralProgram,
  'revops': revops,
  'sales-enablement': salesEnablement,
  'schema-markup': schemaMarkup,
  'seo-audit': seoAudit,
  'signup-flow-cro': signupFlowCro,
  'site-architecture': siteArchitecture,
  'social-content': socialContent,
};
