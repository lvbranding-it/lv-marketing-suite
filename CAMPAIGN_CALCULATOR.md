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
                                        detail cards, disclaimer
  ReviewCta.tsx                         Status-aware inline consultation form
  PrintReport.tsx                       The printable / PDF report
src/lib/campaign/
  types.ts                              All shared types (percentages are decimals)
  config.ts                             EVERY business assumption lives here
  requirements.ts                       The bottom-up cost model (S/B/D/M/G/T/R)
  engine.ts                             Scenarios, feasibility, readiness, copy
  validate.ts                           Step validation (pure; shared with persist)
  persist.ts                            localStorage + schema migration (key :v2)
  lead.ts                               Lead payload + CTA copy (pure)
  engine.test.ts                        Engine tests
  persist.test.ts                       Migration and restore-validation tests
```

The route is registered in `src/App.tsx` beside the other public tools
(`/qr-generator`, `/image-studio`, `/email-signature-generator`), and a sidebar
link exists in `AppShell.tsx` under the standalone-tools group.

## How calculations work

The calculator prices the campaign **bottom up** and only then allocates, and it
prices **two scopes independently**:

```
I_full = P_full + M_full + R_full     every applicable component (J_full)
I_min  = P_min  + M_min  + R_min      the lean one-channel campaign (J_min)
P      = S_min + B_min + D_min + G_min + T_min
```

`J_min` is **not** `J_full` at a discount. It is a genuinely smaller deliverable
set: one channel, one objective, one audience, one concept, limited copy and
graphics, existing brand identity, existing website or store, basic tracking, no
custom photo or video. Deriving one scope from the other by multiplying would
misrepresent what is actually being delivered, so the code never does it.

**Component cost is effort, not a flat price.**

```
C_j     = hours_j x blended rate x readinessFactor_j
P_full  = B_base + beta x Σ C_j  + pass-through
```

`beta` (0.65 to 0.85) is the **bundling factor**: positioning informs messaging,
messaging informs copy, channel strategy sits inside campaign planning, analytics
and conversion tracking share implementation. Summing every component at full
standalone cost over-counts the work. Bundling is **never** applied to paid media,
third-party pass-through (photo and video production), or major custom development
(landing page, checkout flow).

Readiness factors: ready 0, needs-review a **per-component** rate (0.25 to 0.50,
because reviewing an asset is not a fixed fraction of building one), not-sure 0.25
plus a 0.15 discovery reserve, to-create 1. Unanswered is priced as to-create.

**Everything is a range**, because the market inputs are ranges. Publishing a
single number would be false precision. Ranges are shown wherever the underlying
inputs are ranges; only the plan a known budget actually funds is a single figure.

Category minimums use an absolute floor: `P_k_min = max(F_k, bundled effort)`, so
a lean campaign never prices below what the work costs to run.

## Feasibility: can this investment do the job?

`feasibility()` reports the available investment `A` against **both** scopes.
Conflating them is what let an insufficient budget look sufficient.

```
gap_min  = max(0, I_min  - A)
gap_full = max(0, I_full - A)
F_budget = min(100, A / I_full x 100)
```

| Status | Condition |
|---|---|
| Preparation phase only | `A < P_min` |
| Campaign preparation | `P_min <= A < P_min + M_min` |
| Focused pilot | `P_min + M_min <= A < I_full` |
| Selected scope supported | `A >= I_full` |

Thresholds use the optimistic bound of each range, so an investment is only called
short when it is short even at the lean end of the market, and the copy hedges
with "may" accordingly.

**No media activation below `P_min + M_min`.** A few hundred dollars cannot run a
channel, so the media line is zero and the plan says so rather than implying an
activation that will not happen.

**A preparation-only result is a different deliverable, not a shrunken campaign.**
Below the lean minimum the plan funds a strategy and setup sprint, states plainly
that media activation and complete campaign delivery are excluded, and lists what
is deferred. Categories are never scaled down proportionally to imply the whole
scope is still deliverable.

**Nothing is called "protected" unless the displayed plan funds that minimum.**
When it does not, the figure is labelled *Current phase allocation* with the lean
protected minimum stated beside it, and each category minimum above its allocation
is qualified as *deferred* or *partially funded this phase*.

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
- `BLENDED_RATE`, `BUNDLING`, `BASE_SETUP_COST`: the rate range, the bundling
  factor (beta), and the once-only campaign setup cost
- `COMPONENT_EFFORT`: full-scope hours, **lean-scope hours** (0 means the
  component is outside J_min), per-component review rate, third-party
  pass-through, and bundling exemptions
- `LEAN_CATEGORY_FLOORS`: the absolute operational floors F_k
- `LEAN_SCOPE_ASSUMPTIONS` / `SEPARATE_SCOPE_ADDITIONS` / `PREPARATION_PHASE`:
  what the lean scope assumes, what is quoted separately, and what a preparation
  sprint delivers
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
- CTA headings, buttons, and the intent options: `lead.ts → CTA_COPY / LEAD_INTENTS`
- Report title, subtitle, slogan, and footer: `PrintReport.tsx` (the exported constants)

## The printed report (PDF)

"Print" on the results screen produces the full plan, not a summary of it: the
plan at a glance, feasibility with both funding gaps, the phase scope, the
allocation table, per-category detail, every readiness component grouped and
rated, break-even, the balance notes, all three scenarios, the assumptions used
(flagging any that were planning defaults rather than the visitor's own), and
the disclaimer. A printed plan is what gets forwarded to whoever was not in the
room, so a gap in it reads as a gap in the thinking.

**Branding.** Logo, title, `A free planning tool by LV Branding`, the date, and
`Strategy first. Always.` head page one. `www.lvbranding.com` sits in a footer
that repeats on every page.

**Filename.** Browsers take the suggested PDF name from `document.title`, so
`printReport()` swaps it for `reportFilename()`
(`Campaign Investment Calculator - A free planning tool by LV Branding -
YYYY-MM-DD`) and restores it on `afterprint`, with a timeout backstop. The
stamp avoids characters that are not portable in filenames.

**Pagination.** The shared `.print-only` rule pins content with
`position: absolute; inset: 0`, which is fine for a one-page output but clips
anything longer. Since this report runs to several pages, `printReport()` walks
from the report up to `<body>` adding `.cc-print-hidden` to every sibling, and
`body.cc-printing .cc-report` returns to normal flow so the browser paginates
it. `visibility: hidden` alone does not work here: hidden elements still occupy
layout and would push the report past page one.

**Styling.** `.cc-report*` in `index.css`, deliberately its own namespace
because `.printable-output*` belongs to the skills print output and is used by
History and OutputDetail. The layout rules sit OUTSIDE `@media print` so the
report can be rendered on screen for review by passing `preview` to the
component (or adding `.cc-report-preview` in devtools), which is how it should
be checked rather than by printing repeatedly.

**One invariant.** The campaign reserve is held outside the six categories, so
every view that renders category amounts must divide
`plan.total - plan.reserveAmount`. Dividing `plan.total` spreads the reserve
across all six and makes the same figure disagree with itself on one page. A
test in `lead.test.ts` enforces this.

## The consultation CTA and the CRM

The CTA sits below a finished plan and submits in place, so the prospect never
leaves the page and never re-answers a question the calculator already asked.

**Status-aware.** The ask is keyed on `feasibility.status`, because the honest
next step differs. Someone told their budget cannot run a campaign is asked about
a first phase; someone whose scope is funded is asked to start. All four statuses
must have an entry in `CTA_COPY` (a test enforces this).

**Fields.** Name, email, optional phone, and one intent question. Everything else
comes from the plan. The `<details>` block shows the visitor exactly which lines
are transmitted, in their own numbers, before they submit.

**Endpoint.** It reuses the existing public `submit-av-lead` edge function rather
than adding a new one, under the form key `campaign-calculator`. That function
already inserts to `av_leads`, upserts the CRM contact by email (appending to an
existing record instead of duplicating it), notifies the team, and sends the
prospect a branded auto-reply. CRM sync and email are best-effort there, so a
failure in either never loses the lead.

**Column mapping.** `av_leads` columns are generic (they were built for event
forms), so campaign context is mapped onto them and `FORM_CONFIGS` relabels them
per form:

| Column | Carries | Shown as |
|---|---|---|
| `event_type` | the chosen intent | Looking for |
| `services` | selected channels | Channels |
| `event_timeframe` | campaign length | Campaign length |
| `venue` | destination | Campaign destination |
| `attendees` | audience band | Audience size |
| `budget` | available budget, or the goal in goal-first mode | Budget |
| `message` | objective, market, and timing | Message |

**The brief.** `plan_summary` is an ordered `{label, value}[]` built by
`planSummaryLines()`: status and feasibility score, the money, both funding gaps,
what the plan shown actually funds, the starting-point score, and which components
are not ready. It renders in the team email, in the prospect's auto-reply, and as
a `THE PLAN THEY BUILT` block in `crm_notes`, so a rep can call without opening
the calculator. The edge function clamps it to 20 lines and truncates each value,
since it arrives from a public client.

Two honesty rules hold here. Values are formatted human labels, never internal
keys, and the brief must never imply media activation on a preparation-phase
plan. Both are covered by tests in `lead.test.ts`.

Leads are tagged `Campaign Calculator Lead` so this source can be segmented and
measured separately from the service landing forms.

## Analytics

The repository has no analytics abstraction, so no events are emitted (the spec
called for events only "if analytics already exists"). If one is added later, the
natural hook points are: intro CTA click, `goNext` per step, phase change to
`results`, `onSelect`, `handleShareChange`, `window.print`, and CTA submit.
Never send the entered financial values.

## Persistence & privacy

Answers, current step, and phase persist to `localStorage`
(`lv-campaign-calculator:v2`) so a refresh doesn't lose progress. Chart
customisations (adjusted shares, locks, selected scenario) are deliberately
session-only. "Start over" clears storage behind a confirmation dialog.

**The result is never gated.** The complete plan renders, prints, and copies
without asking for anything. The only path that collects personal information is
the CTA form at the bottom of the results, and only when the visitor submits it.
Nothing entered in the CTA is written to `localStorage`, so a name or email never
survives the session. The intro and the disclaimer both state this; if the
submission path changes, that copy has to change with it.

## Running tests

```
npm test               # vitest run (engine, persistence, and lead payload)
npx tsc --noEmit       # strict type check (also runs inside npm run build)
npm run build          # tsc && vite build
```

There is no repo-wide linter configured, so no lint step exists.

## Known limitations

- UI flow is verified manually/by browser automation; there is no DOM test
  infrastructure in the repo, so interface tests are not automated.
- Single currency (USD). `config.ts → CURRENCIES` is structured for more.
- Market figures are calibrated from published references (Clutch, 4A's,
  AgencyAnalytics, Unbounce) and are **planning assumptions, not quotes**.
  **Before launch, replace `COMPONENT_EFFORT` hours, `BLENDED_RATE`, `BUNDLING`,
  and `LEAN_CATEGORY_FLOORS` with LV Branding's own historical project hours,
  vendor costs, utilization, overhead, and minimum target margin.** The awareness
  defaults ($15 CPM, frequency 3) and the essential/recommended relevance tiering
  also need review.
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
