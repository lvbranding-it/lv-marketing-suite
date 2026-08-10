# Campaign Investment Calculator

A public, no-auth planning tool at **`/campaign-investment-calculator`** that helps
businesses estimate how a campaign investment could be distributed across strategy,
branding & creative, digital experience, paid media, campaign management, and
testing & contingency. It produces planning estimates and ranges, never promised
advertising performance.

## Route & component structure

```
src/pages/CampaignCalculator.tsx        Page: intro → 6 steps → results; state,
                                        persistence, metadata, start-over dialog
src/components/campaign-calc/
  shared.tsx                            Field/OptionCards/ToggleChips/NumberField/
                                        StepProgress/StatusBadge primitives
  steps.tsx                             The six wizard steps + validateStep()
  AllocationDonut.tsx                   Hand-rolled SVG donut (no chart library)
  ResultsDashboard.tsx                  Scenario selector, donut + allocation
                                        controls, table alternative, actions
  ResultsInsights.tsx                   Readiness, budget balance, break-even,
                                        detail cards, disclaimer, CTA, print report
src/lib/campaign/
  types.ts                              All shared types (percentages are decimals)
  config.ts                             EVERY business assumption lives here
  engine.ts                             Pure calculation functions (no React/DOM)
  validate.ts                           Step validation (pure; shared with persist)
  persist.ts                            localStorage + schema migration (key :v2)
  engine.test.ts                        Engine tests
  persist.test.ts                       Migration and restore-validation tests
```

The route is registered in `src/App.tsx` beside the other public tools
(`/qr-generator`, `/image-studio`, `/email-signature-generator`), and a sidebar
link exists in `AppShell.tsx` under the standalone-tools group.

## How calculations work

Base formula: `Total = Strategy + Creative + Digital + Media + Management + Testing`.

1. **Recommended shares** (`recommendedShares`) start from the midpoints of the
   planning ranges in `config.ts → ALLOCATION_RANGES`, then adjust in percentage
   points for: missing readiness items (each item's `points` goes to its `affects`
   category), channel count, duration, time sensitivity, business stage, and overall
   readiness. Values clamp to `hard` bounds and normalise to 100%.
2. **Budget-first**: scenario total = stated budget × the scenario's `budgetFactor`
   (0.8 / 1.0 / 1.25), rounded for planning.
3. **Goal-first**: media spend is derived from the goal (`estimateMediaSpend`):
   - lead-step objectives: `leads = goal ÷ conversion`, `media = leads × CPL`
   - awareness: `impressions = reach × frequency`, `media = impressions ÷ 1,000 × CPM`
     (a CPM prices impressions, not unique people; frequency defaults to 3 and is
     an editable planning assumption)
   - otherwise: `media = goal × cost-per-result`
   Then `total = media ÷ media share` for that scenario, so distribution never
   silently eats the foundation.
4. **Dollar amounts** (`allocationAmounts`) use largest-remainder rounding at a
   $10/$50 step and always sum exactly to the total. Displayed percentages use
   `displayPercents` (largest remainder) so they always total exactly 100.
5. **Break-even**: `gross profit per unit = avg value × margin`,
   `break-even units = total ÷ gross profit per unit`. Projected revenue and
   projected gross profit are computed and labelled separately; nothing labels
   revenue as profit. Shown only when the needed inputs exist.
6. **Manual rebalancing** (`rebalanceShares`) redistributes changes proportionally
   across unlocked categories; locked categories never move; every result sums to 1.
7. **Realism checks** (`balanceNotes`) flag contradictory answers: a reach goal
   larger than the stated audience size, a local market paired with an audience
   over 1 million, and very large scale compressed into 30 days, alongside the
   structural checks (media-heavy allocations, missing tracking or landing page,
   more channels than the media budget supports, thin testing reserves). The first
   two are marked `critical` and suppress the recommendation (see below).
8. **Explanations**: `scenarioRationale` explains each scenario's total in one
   sentence ("Why this amount?"), `recommendationSummary` ties the recommendation
   back to the user's answers, `planLevers` names what would change the number
   (reach, frequency, channel mix, existing assets) so a large total reads as a
   planning decision rather than a price, and `readinessNarrative` separates
   confirmed requirements from possible needs.

The business profile asks who the campaign speaks to (businesses, consumers, both,
or donors/members/communities) rather than mixing business models with industries;
the industry list carries the categories (professional services, ecommerce and
retail, events, home services, hospitality, healthcare, nonprofit, other).

## Where assumptions are configured

Everything tunable is in `src/lib/campaign/config.ts` and is commented as a
planning assumption, notably:

- `ALLOCATION_RANGES`: base planning ranges (strategy 8–15%, creative 15–30%,
  digital 5–20%, media 30–55%, management 10–20%, testing 5–10%) and hard bounds
- `READINESS_ITEMS`: weights (sum 100), which category each missing item grows,
  and the explanation clause shown to users
- `OBJECTIVES`: default cost-per-result and conversion values per objective.
  **These are the numbers LV Branding should most validate before public launch**;
  they are surfaced to users as editable "planning assumptions", never benchmarks.
- `SCENARIOS`: budget/goal factors, channel caps, allocation biases, and copy
- `ASSUMPTIONS`: the $600/month minimum channel spend, input guardrails, the
  Essential-vs-Growth recommendation cutoff, and the "balanced" band width

## How readiness affects recommendations

Readiness is **not** a checklist of assets to own. Sixteen components are grouped by
function (campaign foundation, creative assets, campaign destination, measurement),
and for each one the engine computes a *relevance* for this specific campaign from
the objective, the selected channels, and the campaign destination:

| Relevance | Score weight | Gap multiplier |
|---|---|---|
| Essential | 3 | 1.0 |
| Recommended | 2 | 0.6 |
| Optional | 1 | 0.25 |
| Not required | excluded | 0 |

Each component then carries a four-state answer: **Ready to use** (100% of its
weight), **Exists but needs review** (50%), **Not sure** (25%), **Needs to be
created** (0%). Unanswered counts as 0 and the UI says so.

`score = Σ(weight × state) / Σ(weight) × 100`, so a Google Search campaign is never
marked down for having no video (video is excluded when no selected channel can run
it), and a Meta lead campaign can skip the landing page when every selected channel
hosts forms natively. Relevance rules live in `engine.ts → componentAssessments`;
the channel capability sets and destination rules they consult are in `config.ts`.

Allocation impact scales with both the gap and the relevance:
`points = item.points × (1 − stateScore) × relevanceGapMultiplier`. A missing video
therefore moves the plan only in proportion to how much this campaign needs video.

The campaign **destination** ("Where should people go…") is asked at the top of the
readiness step because it decides which destination components apply at all.

## Contradictions and the recommendation

`balanceNotes` marks some notes `critical` (a reach goal larger than the stated
audience; a local market with an audience over 1 million). `calculate` collects
these into `result.contradictions`. While that array is non-empty the results screen
replaces the **Recommended** badge with **Review assumptions** and shows a notice
above the scenarios. Scenarios stay visible for comparison; only the endorsement is
withheld. Resolving the contradiction restores the badge automatically.

## Schema migration

The stored shape is versioned (`lv-campaign-calculator:v2`). On load, a v1 record is
migrated where meaning carries over (`businessType: "b2b"` → `audienceFocus:
"businesses"`, old industries → the shorter list, `true` → `"ready"`, v1's single
capture-flow answer → both lead form and checkout) and dropped where it doesn't
(v1's "Event or experience" described a campaign type, not an audience, so it
becomes null rather than a guess). The v1 record is then deleted so migration runs
once.

`loadState` also takes the step validator and re-checks every step the restored
position claims to have passed, pulling the user back to the first one that fails.
This is why a session saved before a question existed can never resume on a results
screen built from answers that were never given. It is generic, so it protects
against future schema changes too.

## How scenarios are generated

Essential / Growth / Expansion differ in scope, not one multiplier: reach factor,
channel cap, and allocation biases (Essential trims testing/creative/management;
Expansion grows them). Channel counts are also capped by what the media budget can
support at the minimum per-channel monthly spend. Growth is recommended by default;
Essential is recommended for budget-first plans under the configured cutoff.

## Modifying copy

- Step headings and intro/results copy: `CampaignCalculator.tsx`
- Category "why / could cover" text: `config.ts → CATEGORIES`
- Readiness clauses and band summaries: `config.ts → READINESS_ITEMS / READINESS_BANDS`
- Balance notes: `engine.ts → balanceNotes` (text lives with the trigger logic)
- Disclaimer: `ResultsInsights.tsx → Disclaimer`

## Analytics

The repository has no analytics abstraction, so no events are emitted (the spec
called for events only "if analytics already exists"). If one is added later, the
natural hook points are: intro CTA click, `goNext` per step, phase change to
`results`, `onSelect`, `handleShareChange`, `window.print`, and the review CTA.
Never send the entered financial values.

## Persistence & privacy

Answers, current step, and phase persist to `localStorage`
(`lv-campaign-calculator:v1`) so a refresh doesn't lose progress. Chart
customisations (adjusted shares, locks, selected scenario) are deliberately
session-only. The calculator collects no names, emails, or any personally
identifiable information; the free result is never gated. "Start over" clears
storage behind a confirmation dialog. A future "save to Supabase" feature can
serialise the same `CalculatorAnswers` shape.

## Running tests

```
npm test               # vitest run, 36 engine tests
npx tsc --noEmit       # strict type check (also runs inside npm run build)
npm run build          # tsc && vite build
```

There is no repo-wide linter configured, so no lint step exists.

## Known limitations

- UI flow is verified manually/by browser automation; there is no DOM test
  infrastructure in the repo, so interface tests are not automated.
- Single currency (USD). `config.ts → CURRENCIES` is structured for more.
- Default unit economics are deliberately generic, not per-industry. **The awareness
  defaults ($15 CPM, frequency 3) and the essential/recommended relevance tiering are
  the assumptions most worth LV Branding's review before launch.**
- The donut's hover and keyboard focus both drive the centre label; when a mouse
  rests on the chart while focus moves, hover wins (info is always available in
  the controls and table regardless).
- Dark-mode chart colours are defined and validated, but the app currently has no
  user-facing dark-mode toggle on public pages.

## Recommended future phases

1. LV Branding validates/refines `OBJECTIVES` defaults and `ALLOCATION_RANGES`.
2. Per-industry assumption presets (extend `ObjectiveMeta` or key by industry).
3. Save/share plans via Supabase (schema mirrors `CalculatorAnswers` + shares).
4. Analytics events once an abstraction exists.
5. Optional Spanish version following the `/es/*` lead-wizard pattern.
