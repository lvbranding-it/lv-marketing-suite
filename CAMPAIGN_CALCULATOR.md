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
  persist.ts                            localStorage save/load (key lv-campaign-calculator:v1)
  engine.test.ts                        36 vitest tests over the engine
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
   - awareness: `media = goal ÷ 1000 × cost-per-1,000`
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

Ten yes/no items produce a 0–100 score (bands: <40 Foundation required,
40–64 Partially prepared, 65–84 Campaign ready, ≥85 Scale ready). Each missing item
adds points to its category **before** normalisation, so missing photography grows
creative, a missing landing page grows digital experience, and a complete
foundation shifts weight to media. The results page explains exactly which items
moved which allocation ("Shaped by your answers"), so there is no unexplained penalty.

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
- Default unit economics are deliberately generic, not per-industry.
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
