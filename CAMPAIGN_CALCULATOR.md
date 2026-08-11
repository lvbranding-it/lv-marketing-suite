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
  requirements.ts                       The bottom-up cost model (S/B/D/M/G/T/R)
  engine.ts                             Scenarios, feasibility, readiness, copy
  validate.ts                           Step validation (pure; shared with persist)
  persist.ts                            localStorage + schema migration (key :v2)
  engine.test.ts                        Engine tests
  persist.test.ts                       Migration and restore-validation tests
```

The route is registered in `src/App.tsx` beside the other public tools
(`/qr-generator`, `/image-studio`, `/email-signature-generator`), and a sidebar
link exists in `AppShell.tsx` under the standalone-tools group.

## How calculations work

The calculator prices the campaign **bottom up** and only then allocates. It does
not divide whatever number the user typed.

```
I_required = S_min + B_min + D_min + M_required + G_min + T_min + R
P          = S_min + B_min + D_min + G_min + T_min        (protected)
I_required = P + M_required + R
```

Paid media buys distribution. The protected campaign investment creates, operates,
measures, and improves what is being distributed. `src/lib/campaign/requirements.ts`
implements the model; `engine.ts` consumes it.

**1. Readiness cost.** `C_j = BaseCost_j x ReadinessFactor_j x ScopeFactor_j`.
Factors: ready 0, needs-review a **per-component** rate (0.25 to 0.50, because
reviewing an asset is not a fixed fraction of building one), not-sure 0.25 plus a
0.15 discovery reserve, to-create 1. Unanswered is priced as to-create. Components
that don't apply are excluded.

**2. Strategy.** `S_min = Σ(StrategyCost_j x ReadinessFactor_j) x F_scope`, where
`F_scope = 1 + F_channels + F_market + F_duration + F_audience`.

**3. Creative.** `B_min = C_concept + components + C_formats + C_variations`. The
concept is charged **once**; each channel adds an adaptation cost, not a new
concept. Variations beyond the first are priced per variation.

**4. Digital experience.** `D_min` = destination + conversion + analytics +
platform tracking, limited to the components the chosen destination makes relevant.

**5. Paid media.** `M_required = max(M_goal, Σ_c M_min,c)` with per-channel monthly
minimums (LinkedIn and programmatic cost more than email). Goal-first computes
`M_goal` per objective; awareness uses `reach x frequency / 1,000 x CPM`.

**6. Management.** `G_min = max(G_base, r_G x M_required) + G_complexity`, where
complexity = channels, variations, duration, and reporting.

**7. Testing and optimization.** `T_min = max(T_base, r_T x (B_min + D_min + M_required))`,
protected so it is never silently absorbed into media.

**8. Reserve.** `R = r_R x (S + B + D + M + G)`, displayed separately as Campaign
Reserve. In a plan it is carried as the exact remainder `total - allocatable`, so
**P + M + R equals the total exactly** whatever the rounding does.

Amounts start at the protected minimums; surplus flows to media. When the budget
falls short, **media absorbs the shortfall first** and the protected lines are the
last thing scaled, because they are the work the campaign depends on.

### Protected allocation rule

`X_i >= P_i` for every protected category (strategy, creative, digital,
management, testing). Sliders enforce the floor, show the protected minimum in
dollars, and explain that reducing it responsibly means changing scope. Media is
freely adjustable down to zero, and reducing it recalculates the fundable channels.
`SCOPE_LEVERS` in config lists the offered alternatives.

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
- `COMPONENT_COSTS`: base build cost and per-component review rate for all 18
  components
- `SCOPE_FACTORS`, `CHANNEL_MEDIA_MINIMUM`, `CHANNEL_ADAPTATION_COST`, `CREATIVE`,
  `MANAGEMENT`, `TESTING`, `RESERVE`: every coefficient in the requirements model
- `FEASIBILITY_BANDS` / `FEASIBILITY_SCORE_BANDS` / `SCOPE_LEVERS`: statuses,
  score thresholds, and the scope changes offered instead of cutting protected work.
  **All of these are planning floors, not quotes. They now drive the headline
  numbers, so they are the most important set for LV Branding to replace with real
  ranges before launch.**

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

## Feasibility: can the budget do the job?

Allocation and feasibility are separate questions. `feasibility()` compares the
stated budget `A` against the bottom-up requirement.

```
M_available = max(0, A - P - R)
Funding gap = I_required - A
F_budget    = min(100, A / I_required x 100)
```

Status comes from the detailed budget rules, not from the score:

| Status | Condition |
|---|---|
| Foundation phase only | `A < P` |
| Campaign preparation | `P <= A < P + M_min,1` |
| Focused pilot | `P + M_min,1 <= A < P + Σ M_min,c` |
| Scope supported | `A >= P + Σ M_min,c` |

The score is a separate 0-100 read with its own configurable bands
(`FEASIBILITY_SCORE_BANDS`), shown alongside the status.

**When constrained**, the results screen changes materially: a status panel appears
above the scenarios with three concrete paths (focused pilot, build the foundation
first, increase the investment); Essential is relabelled **Focused Pilot**, badged
*Best fit for current budget*, spends the whole budget, and is costed against only
the channels the budget can actually carry; Growth and Expansion are priced at what
the selected scope really costs, each badged *Requires $X more*. A plan whose media
line cannot fund even one channel reports **no media activation** rather than
claiming a channel.

The **Budget and scope fit** card sits beside Campaign readiness because they answer
different questions: readiness asks whether the materials exist, feasibility asks
whether the money, time, channels, and reach line up.

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
  defaults ($15 CPM, frequency 3), the essential/recommended relevance tiering, and
  the `PRODUCTION_COSTS` floors are the assumptions most worth LV Branding's review
  before launch.**
- Feasibility applies to budget-first mode only; goal-first sizes the investment to
  the goal, so there is no stated budget to test the scope against.
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
