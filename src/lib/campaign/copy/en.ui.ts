// ── English: interface chrome and static prose ──────────────────────────────────
// The exact strings the components render today, lifted out so both languages
// resolve the same way. Wording is unchanged; if a string here differs from what
// shipped, that is a bug, not an improvement.

import type { CalcCopy } from "./types";

export const enMeta: CalcCopy["meta"] = {
  pageTitle:       "Campaign Investment Calculator | LV Branding",
  pageDescription: "Estimate how to distribute your campaign investment across strategy, branding, creative production, digital experience, paid media, management, and testing.",
  productName:     "Campaign Investment Calculator",
  tagline:         "A free planning tool by LV Branding",
  slogan:          "STRATEGY FIRST. ALWAYS.",
  site:            "www.lvbranding.com",
};

export const enIntro: CalcCopy["intro"] = {
  heading:  "Know what your campaign really requires.",
  body:     "Build a practical investment plan across strategy, branding, creative production, paid media, and campaign management based on your goals, market, and business readiness.",
  emphasis: "Media amplifies what already exists. A strong campaign must fund both the message and its distribution.",
  cta:      "Calculate My Investment",
  reassurance: "Six short steps · about 3 minutes · no account, and the full result is yours to keep",
  resumeLead: "You have a plan in progress.",
  resumeLink: "pick up where you left off",
};

export const enNav: CalcCopy["nav"] = {
  back:       "Back",
  next:       "Next",
  seeResults: "See my plan",
  startOver:  "Start over",
  startOverConfirmTitle: "Start over?",
  startOverConfirmBody:  "This clears your answers and the plan you built. It cannot be undone.",
  startOverConfirm: "Start over",
  cancel: "Keep my plan",
  stepOf: (current, total) => `Step ${current} of ${total}`,
};

export const enSteps: CalcCopy["steps"] = {
  labels: ["Profile", "Objective", "Scope", "Destination", "What you have", "Investment", "Review"],

  profile: {
    heading: "Tell us about your business",
    blurb:   "This tunes the recommendations to your market and the stage you are at.",
    audienceFocus: "Who do you primarily sell or communicate to?",
    stage:   "What stage is the business in?",
    reach:   "How far does your market reach?",
    industry: "Industry",
    industryPlaceholder: "Choose an industry",
    currency: "Currency",
  },

  objective: {
    heading: "What is the one outcome this campaign exists to produce?",
    blurb:   "Pick the primary outcome. Everything else is sized from this.",
  },

  scope: {
    heading: "How big is the campaign?",
    blurb:   "Duration, channels, and audience size decide how much work and how much media it needs.",
    duration: "How long will it run?",
    customDuration: "Custom duration",
    days: "days",
    channels: "Which advertising channels are you considering?",
    channelsHint: "Pick only the ones you will actually run. Fewer channels done properly beat many done thinly.",
    audience: "Estimated audience size",
    timing: "Timing",
    durationDays: "Duration in days",
    audienceHint: "If you know roughly how many people you're trying to reach.",
    timeSensitive: "Does it have a fixed date?",
    timeSensitiveHint: "An event or launch concentrates the investment; an always-on campaign spreads it.",
  },

  destination: {
    heading: "Where should people go, or what should they do, after seeing the campaign?",
    blurb:   "This decides which destination components actually matter for your campaign.",
  },

  readiness: {
    heading: "What do you have ready today?",
    blurb:   "Be honest here; nobody has everything ready. What is missing becomes budget, not a telling-off.",
    relevanceNote: "We only ask about what this campaign actually needs, based on your objective, channels, and destination.",
    notApplicable: "Not required for this campaign",
  },

  financial: {
    heading: "How would you like to plan?",
    blurb:   "You can start from a budget or from a goal. Anything you don't know, we fill with an assumption you can edit.",
    modeBudget: "I have a budget and want to allocate it",
    modeGoal:   "I have a goal and want to estimate the investment",
    budgetTotal: "Total available campaign budget",
    goalCount:   "Desired results",
    avgValue:    "Average customer or transaction value",
    conversionRate: "Lead-to-customer conversion rate",
    costPerResult:  "Estimated cost per result",
    targetFrequency: "Target frequency",
    marginPct:  "Gross profit margin",
    expectedRevenue: "Expected revenue from the campaign",
    assumptionBadge: "Planning assumption",
    optional: "optional",
  },

  review: {
    heading: "Review your answers",
    blurb:   "If anything looks wrong, edit it before continuing.",
    edit:    "Edit",
  },
};

export const enErrors: CalcCopy["errors"] = {
  "profile.audienceFocus": "Choose who the campaign speaks to.",
  "profile.stage":         "Choose the business stage.",
  "profile.reach":         "Choose your market reach.",
  "profile.industry":      "Choose or enter your industry.",
  objective:               "Choose a campaign objective.",
  "scope.durationDays":    "Duration must be at least 7 days.",
  "scope.channels":        "Choose at least one channel.",
  destination:             "Choose what people should do.",
  "financial.budgetTotal": "Enter an available investment.",
  "financial.goalCount":   "Enter how many results you want.",
  "financial.avgValue":    "Enter the average customer value.",
  "financial.marginPct":   "Margin must be between 1% and 95%.",
  "financial.conversionRate": "Conversion must be between 0.1% and 100%.",
  "financial.costPerResult":  "Enter a valid cost per result.",
  "financial.targetFrequency": "Frequency must be between 1 and 20.",
};

export const enResults: CalcCopy["results"] = {
  heading: "Your Campaign Investment Plan",
  blurb:   "Based on your goals and where you are starting from, here are three ways this could go. They are planning estimates to help you decide, not a guarantee of what a campaign will do.",
  recommended: "Recommended",
  whyThisAmount: "Why this amount?",
  whySuggest: "Why we suggest this:",
  protectedInvestment: "Protected campaign investment",
  mediaDistribution: "Media distribution",
  campaignReserve: "Campaign reserve",
  allocationTitle: "Campaign allocation",
  adjustAllocation: "Adjust the allocation",
  resetAllocation: "Reset to recommendation",
  lockCategory: "Lock this category",
  unlockCategory: "Unlock this category",
  categoryMinimum: "Lean category minimum:",
  tableView: "View as table",
  print: "Print",
  copySummary: "Copy summary",
  copied: "Copied",
  adjustAnswers: "Adjust answers",
  totalInvestment: "Total investment",
  campaignAllocation: "Campaign allocation",
  amount: "Amount",
  share: "Share",
  category: "Category",
  currentPhaseAllocation: "Current phase allocation",
  protectedBlurb:    "This is the work that makes a campaign worth running: strategy, creative, the place people land, running it, and improving it.",
  belowMinimumBlurb: (leanRange) => `This is what the current phase funds. It sits below the lean minimum of ${leanRange}, so we are not going to call it a protected campaign investment.`,
  mediaBlurb:        "What you pay the platforms to put your campaign in front of people.",
  reserveBlurb:      "Set aside for changes you approve, things that come up in production, or an opportunity worth chasing while the campaign is live.",
  identity: ({ protectedAmount, media, reserve, total, funded }) =>
    `${protectedAmount} ${funded ? "protected" : "this phase"} + ${media} media + ${reserve} reserve = ${total} total. The media budget buys distribution; the protected campaign investment funds the strategy, creative production, digital infrastructure, management, and optimization required to make that distribution purposeful and accountable.`,
  preparationPhase:  "Preparation phase",
  focusedPilot:      "Focused pilot",
  prepSprintTagline: "Strategy and setup sprint · no media activation",
  noMediaActivation: "No media activation at this investment",
  reducedScope:      (n) => `Reduced scope · ${n} channel${n === 1 ? "" : "s"}`,
  scopeChannels:     (tagline, n) => `${tagline} · ${n} channel${n === 1 ? "" : "s"}`,
  prepOnlyNote:      "This funds preparation only. It is not a complete campaign and does not include media activation.",
  reducedScopeNote:  (selected) => `This is a reduced-scope plan, not the complete ${selected}-channel campaign originally selected.`,
  extraNeeded:       (amount) => `about ${amount} more`,
  mediaAdjustable:   "Adjustable. Reducing media reduces reach, channels, or duration.",
  floorDeferred:     (a) => `Lean category minimum: ${a} (deferred from this phase)`,
  floorPartial:      (a) => `Lean category minimum: ${a} (partially funded this phase)`,
  floorPlain:        (a) => `Lean category minimum: ${a}`,
  floorProtected:    "This one covers work the campaign depends on. To bring it down, we would change the scope rather than remove the work itself.",
};

export const enCards: CalcCopy["cards"] = {
  startingPoint:     "Your starting point",
  budgetCanDo:       "What your budget can do",
  phaseScope:        "What we would do in this phase",
  worthChecking:     "A few things worth checking",
  breakEven:         "Break-even view",
  allocationDetail:  "What each allocation is for",
  otherScenarios:    "The other ways this could go",
  assumptions:       "The assumptions behind these numbers",
  disclaimerHeading: "Please read this alongside the numbers",
};

export const enMeters: CalcCopy["meters"] = {
  readiness:   ["Starting", "Partly", "Ready", "Scale"],
  feasibility: ["Preparation", "Foundation", "Pilot", "Full scope"],
};

export const enProse: CalcCopy["prose"] = {
  readinessMeterNote:
    "We only count the pieces this particular campaign actually needs. This is not a score on your business, it is simply where you are starting from, and it keeps ad spend from outrunning the message.",
  startingPointFooter:
    "Your starting point is about what you already have. This is about what your money can realistically reach. All figures are planning estimates based on market references, not LV Branding quotes.",
  feasibilityFooter:
    "All figures are planning estimates based on market references, not LV Branding quotes, and we are happy to work through them with you.",
  allocationFooter:
    "Amounts describe planning capacity, not a quote; what specific deliverables cost depends on scope and market. Nothing here commits you (or LV Branding) to a price.",
  breakEvenFooter:
    "Revenue is not profit: projected gross profit already subtracts direct costs at your stated margin, but not the campaign investment itself. These figures follow from your own assumptions; they are planning arithmetic, not a forecast.",
  scenariosFooter:
    "Scenarios change scope: reach, channel count, creative coverage, and testing depth. They are not the same plan at three price points.",
  assumptionsFooter:
    "Values marked as a planning assumption were not supplied; a starting point was used instead. They are the first numbers worth replacing with your own.",
  nothingWorthChecking:
    "Nothing stands out as a problem here. The balance of groundwork, reach, and testing looks proportionate to what you told us.",
  preparationCaveat:
    "To be clear: running ads and delivering a complete campaign are not part of this phase.",
  quotedSeparately: "Quoted separately",
  deferredFromPhase: "Deferred from this phase",
  waysForward: "Ways forward",
  disclaimer:
    "This report contains planning estimates based on the information and assumptions entered. Actual advertising costs and campaign performance vary by industry, market, audience, platform, competition, creative quality, and execution. Results are not guaranteed. Market figures are planning references, not quotes or guaranteed prices, and nothing here commits you or LV Branding to a price. This tool is for planning purposes only and is not financial advice.",
  disclaimerPrepared:
    "Prepared with the LV Branding Campaign Investment Calculator. We are happy to work through any of it with you.",
  privacy:
    "Your answers are saved in this browser so you can come back to them, and they stay there. Nothing reaches us unless you choose to send your plan using the form above.",
  howEstimatesWork: "How these estimates work",
  howEstimatesBody: [
    "Allocations start from configurable planning ranges (for example, paid media typically lands between 30% and 55% of a campaign budget) and adapt to your answers: missing foundations shift budget toward strategy, creative, and digital experience; a complete foundation releases more toward media. The three scenarios change scope (reach, channel count, creative coverage, and testing depth) rather than multiplying one number.",
    "Goal-first estimates convert your goal into a media budget using the cost and conversion values you entered (or accepted as planning assumptions), then size the surrounding investment so distribution isn't funded at the expense of the message. Where a default appears, it is a starting point to edit, not a benchmark, and not a promise of what your market will actually charge.",
    "This tool is for planning purposes only and is not financial advice.",
  ],
};

export const enReport: CalcCopy["report"] = {
  planningEstimate: "Planning estimate",
  notAQuote:        "Not a quote",
  pageOf:           (page, total) => `Page ${page} of ${total}`,
  channelsLine:     (channels) => `Channels: ${channels}`,
  contradictionsTitle: "Worth resolving before this plan is relied on.",
  figures: {
    planAtAGlance:        "Your plan at a glance",
    allocationHeading:    "How the investment is allocated",
    couldCover:           "Could cover:",
    shapedBy:             "Shaped by your answers:",
    planShown:            "Plan shown",
    objective:            "Objective",
    campaignLength:       "Campaign length",
    channelsSelected:     "Channels selected",
    destination:          "Campaign destination",
    audienceSize:         "Audience size",
    industry:             "Industry",
    marketReach:          "Market reach",
    businessStage:        "Business stage",
    timing:               "Timing",
    feasibilityScore:     "Feasibility score",
    available:            "Available investment",
    leanMinimum:          "Lean professional minimum",
    completeScope:        "Complete selected scope",
    gapMinimum:           "Minimum funding gap",
    gapComplete:          "Complete-scope funding gap",
    mediaAvailable:       "Media available after protected requirements",
    channelsSupported:    "Channels supported at that media level",
    essentialsReady:      "Essential components ready",
    componentsToReview:   "Applicable components to review",
    estimatedUnits:       "This plan's estimated results",
    projectedRevenue:     "Projected revenue",
    projectedGrossProfit: "Projected gross profit",
    planInvestment:       "Plan investment",
    planningMode:         "Planning mode",
    budgetFirst:          "Budget-first",
    goalFirst:            "Goal-first",
    statedBudget:         "Stated budget",
    goal:                 "Goal",
    avgValue:             "Average value per customer",
    conversionRate:       "Conversion rate",
    costPerResult:        "Cost per result",
    targetFrequency:      "Target frequency",
    marginPct:            "Gross margin",
    expectedRevenue:      "Expected revenue",
    totalInvestment:      "Total investment",
    campaignReserve:      "Campaign reserve",
  },
  tableHeaders: {
    component:      "Component",
    mattersHere:    "Matters here",
    whereYouAre:    "Where you are",
    scenario:       "Scenario",
    estimatedRange: "Estimated range",
    whatItChanges:  "What it changes",
  },
};

export const enFormatRange: CalcCopy["formatRange"] = (r, formatMoney) =>
  `${formatMoney(r.min)} to ${formatMoney(r.max)}`;
