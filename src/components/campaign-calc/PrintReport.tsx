// ── Campaign Investment Calculator: printable report ────────────────────────────
// The full plan, not a summary of it. Everything the results screen shows has a
// place here, because a printed plan is what gets forwarded to the person who
// was not in the room, and a gap in it reads as a gap in the thinking.
//
// Styling lives in index.css under `.cc-report` (its own namespace; the older
// `.printable-output` classes belong to the skills print output). Those rules
// sit outside `@media print` so this can be rendered on screen for review.

import {
  AUDIENCE_BANDS, BUSINESS_STAGES, CATEGORIES, CHANNELS, DESTINATIONS,
  LEAN_SCOPE_ASSUMPTIONS, MARKET_REACHES, PREPARATION_PHASE, READINESS_BANDS,
  READINESS_GROUPS, READINESS_ITEMS, RELEVANCE_LABELS, SCENARIOS,
  SEPARATE_SCOPE_ADDITIONS, feasibilityBand, formatMoney, formatRange,
  objectiveMeta, readinessItemMeta, readinessStateMeta, scenarioMeta,
} from "@/lib/campaign/config";
import {
  allocationAmounts, balanceNotes, displayPercents, feasibilityNarrative,
  feasibilityPaths, planLevers, readinessNarrative, recommendationSummary,
  scenarioRationale,
} from "@/lib/campaign/engine";
import type {
  CalculationResult, CalculatorAnswers, ScenarioPlan, Shares,
} from "@/lib/campaign/types";

export const REPORT_TITLE = "Campaign Investment Calculator";
export const REPORT_SUBTITLE = "A free planning tool by LV Branding";
export const REPORT_SLOGAN = "Strategy first. Always.";
export const REPORT_SITE = "www.lvbranding.com";

/** Long form for the page, e.g. "August 11, 2026". */
export const reportDate = (d = new Date()) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/**
 * The document title becomes the suggested PDF filename in every major browser,
 * so it is set around the print call. Colons and slashes are dropped because
 * they are not portable in filenames.
 */
export function reportFilename(d = new Date()): string {
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${REPORT_TITLE} - ${REPORT_SUBTITLE} - ${stamp}`;
}

const labelOf = <T extends string>(key: T | null, list: { key: T; label: string }[]) =>
  key ? list.find((i) => i.key === key)?.label ?? null : null;

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 1000) / 10}%`);

interface FigureProps {
  label: string;
  value: string | null;
  /** Draws the value in the brand colour; used for gaps and assumed inputs. */
  flag?: boolean;
  /** Spans both grid columns, for labels or values too long for half a row. */
  wide?: boolean;
}

function Figure({ label, value, flag, wide }: FigureProps) {
  if (!value) return null;
  return (
    <div
      className={
        "cc-report__figure" +
        (flag ? " cc-report__figure--flag" : "") +
        (wide ? " cc-report__figure--wide" : "")
      }
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface PrintReportProps {
  answers:       CalculatorAnswers;
  result:        CalculationResult;
  plan:          ScenarioPlan;
  currentShares: Shares;
  /** Renders the report on screen for review instead of only on paper. */
  preview?:      boolean;
}

export default function PrintReport({
  answers, result, plan, currentShares, preview = false,
}: PrintReportProps) {
  const { profile, scope, financial } = answers;
  const fit = result.feasibility;
  const band = feasibilityBand(fit.status);
  const narrative = feasibilityNarrative(answers, fit);
  const paths = feasibilityPaths(answers, fit);
  const notes = balanceNotes(answers, plan, currentShares);
  // The reserve is held outside the categories, so shares divide what is left
  // after it. This must match ResultsDashboard exactly or the printed plan and
  // the screen disagree.
  const amounts = allocationAmounts(plan.total - plan.reserveAmount, currentShares);
  const pcts = displayPercents(currentShares);
  const readinessBand = READINESS_BANDS.find((b) => b.band === result.readiness.band);
  const assessments = result.readiness.assessments;
  const objective = answers.objective ? objectiveMeta(answers.objective) : null;
  const be = plan.breakEven;

  return (
    <div
      className={`print-only cc-report${preview ? " cc-report-preview" : ""}`}
      aria-hidden={preview ? undefined : "true"}
    >
      {/* ── Masthead ── */}
      <header className="cc-report__masthead">
        <img src="/lv-logo.svg" alt="LV Branding" className="cc-report__logo" />
        <div className="cc-report__masthead-text">
          <h1 className="cc-report__title">{REPORT_TITLE}</h1>
          <p className="cc-report__subtitle">{REPORT_SUBTITLE}</p>
        </div>
        <div className="cc-report__stamp">
          <strong>{reportDate()}</strong>
          Planning estimate
          <br />
          Not a quote
        </div>
      </header>
      <p className="cc-report__slogan">{REPORT_SLOGAN}</p>

      {/* ── 1. The plan ── */}
      <section className="cc-report__section">
        <h2>Your plan at a glance</h2>
        <p className="cc-report__lead">
          {narrative.headline}{" "}
          <span className="cc-report__pill">{band.label}</span>
        </p>
        <p className="cc-report__muted">{narrative.detail}</p>

        <dl className="cc-report__figures">
          <Figure label="Plan shown" value={`${scenarioMeta(plan.key).label} · ${formatMoney(plan.total)}`} />
          <Figure label="Objective" value={objective?.label ?? null} />
          <Figure label="Campaign length" value={`${scope.durationDays} days`} />
          <Figure label="Channels selected" value={String(scope.channels.length)} />
          <Figure label="Campaign destination" value={labelOf(answers.destination, DESTINATIONS)} />
          <Figure label="Audience size" value={labelOf(scope.audience, AUDIENCE_BANDS)} />
          <Figure label="Industry" value={profile.industry || null} />
          <Figure label="Market reach" value={labelOf(profile.reach, MARKET_REACHES)} />
          <Figure label="Business stage" value={labelOf(profile.stage, BUSINESS_STAGES)} />
          <Figure label="Timing" value={scope.timeSensitive ? "Fixed date or launch window" : "Always-on"} />
        </dl>

        {scope.channels.length > 0 && (
          <p className="cc-report__muted">
            <b>Channels:</b>{" "}
            {scope.channels.map((c) => CHANNELS.find((x) => x.key === c)?.label ?? c).join(", ")}
          </p>
        )}

        {result.contradictions.length > 0 && (
          <div className="cc-report__note">
            <b>Worth resolving before this plan is relied on.</b>
            <ul style={{ margin: "4px 0 0" }}>
              {result.contradictions.map((c) => <li key={c.id}>{c.text}</li>)}
            </ul>
          </div>
        )}

        <p className="cc-report__muted" style={{ marginTop: 8 }}>
          {recommendationSummary(answers, result)}
        </p>
      </section>

      {/* ── 2. Feasibility ── */}
      <section className="cc-report__section">
        <h2>What your budget can do</h2>
        <dl className="cc-report__figures">
          <Figure label="Feasibility score" value={`${fit.score}/100 · ${fit.scoreLabel}`} wide />
          {fit.applies && <Figure label="Available investment" value={formatMoney(fit.available)} />}
          <Figure label="Lean professional minimum" value={formatRange(fit.minimumViable.total)} />
          <Figure label="Complete selected scope" value={formatRange(fit.completeScope.total)} />
          {fit.applies && fit.minimumFundingGap.max > 0 && (
            <Figure label="Minimum funding gap" value={formatRange(fit.minimumFundingGap)} flag />
          )}
          {fit.applies && fit.completeScopeFundingGap.max > 0 && (
            <Figure label="Complete-scope funding gap" value={formatRange(fit.completeScopeFundingGap)} />
          )}
          {fit.applies && (
            <Figure
              label="Media available after protected requirements"
              value={formatMoney(fit.mediaAvailable)}
              wide
            />
          )}
          {fit.applies && (
            <Figure
              label="Channels supported at that media level"
              value={`${fit.supportedChannels} of ${fit.selectedChannels} selected`}
              wide
            />
          )}
        </dl>
        <p className="cc-report__muted">
          Your starting point is about what you already have. This is about what your money can
          realistically reach. All figures are planning estimates based on market references, not
          LV Branding quotes.
        </p>

        {paths.length > 0 && (
          <>
            <p className="cc-report__eyebrow">Ways forward</p>
            {paths.map((p) => (
              <div key={p.id}>
                <h3>{p.title}</h3>
                <p className="cc-report__muted">{p.text}</p>
              </div>
            ))}
          </>
        )}
      </section>

      {/* ── 3. Phase scope ── */}
      {fit.applies && fit.status !== "scope-supported" && (
        <section className="cc-report__section">
          <h2>What we would do in this phase</h2>
          {plan.isPreparationPhase ? (
            <>
              <p>
                <b>{PREPARATION_PHASE.title}.</b> This phase gives you a plan you can act on, not a
                running campaign.
              </p>
              <ul>
                {PREPARATION_PHASE.inclusions.map((i) => <li key={i}>{i}</li>)}
              </ul>
              <div className="cc-report__note">
                To be clear: running ads and delivering a complete campaign are not part of this
                phase.
              </div>
            </>
          ) : (
            <>
              <p>
                A lean, properly run campaign on {plan.recommendedChannels || 1} channel, reusing
                what already works for you. This scope assumes:
              </p>
              <ul>
                {LEAN_SCOPE_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </>
          )}

          {plan.requirements.deferred.length > 0 && (
            <>
              <p className="cc-report__eyebrow">Deferred from this phase</p>
              <ul>
                {plan.requirements.deferred.map((d) => (
                  <li key={d.key}>{readinessItemMeta(d.key).label}</li>
                ))}
              </ul>
            </>
          )}

          <p className="cc-report__eyebrow">Quoted separately</p>
          <ul>
            {SEPARATE_SCOPE_ADDITIONS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>
      )}

      {/* ── 4. Allocation ── */}
      <section className="cc-report__section">
        <h2>How the investment is allocated</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Amount</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td>{cat.label}</td>
                <td className="num">{formatMoney(amounts[cat.key])}</td>
                <td className="num">{pcts[cat.key]}%</td>
              </tr>
            ))}
            {plan.reserveAmount > 0 && (
              <tr>
                <td>Campaign reserve</td>
                <td className="num">{formatMoney(plan.reserveAmount)}</td>
                <td className="num">held separately</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total investment</td>
              <td className="num">{formatMoney(plan.total)}</td>
              <td className="num">100%</td>
            </tr>
          </tfoot>
        </table>
        <p className="cc-report__muted">{scenarioRationale(answers, plan)}</p>
        <p className="cc-report__muted">{planLevers(answers, result)}</p>
      </section>

      {/* ── 5. Category detail ── */}
      <section className="cc-report__section">
        <h2>What each allocation is for</h2>
        <div className="cc-report__cards">
          {CATEGORIES.map((cat) => {
            const influences = result.insights.find((i) => i.key === cat.key)?.influences ?? [];
            return (
              <article key={cat.key} className="cc-report__card">
                <h3>{cat.label}</h3>
                <p className="cc-report__card-amount">
                  {formatMoney(amounts[cat.key])} · {pcts[cat.key]}%
                </p>
                <p>{cat.why}</p>
                <p><b>Could cover:</b> {cat.covers}</p>
                {influences.length > 0 && (
                  <p><b>Shaped by your answers:</b> {influences.join("; ")}.</p>
                )}
              </article>
            );
          })}
        </div>
        <p className="cc-report__muted" style={{ marginTop: 8 }}>
          Amounts describe planning capacity, not a quote; what specific deliverables cost depends
          on scope and market. Nothing here commits you (or LV Branding) to a price.
        </p>
      </section>

      {/* ── 6. Starting point ── */}
      <section className="cc-report__section">
        <h2>Your starting point</h2>
        <p className="cc-report__lead">
          {result.readiness.score}/100
          {readinessBand ? ` · ${readinessBand.label}` : ""}
        </p>
        <p className="cc-report__muted">{readinessNarrative(result.readiness)}</p>
        <dl className="cc-report__figures">
          <Figure
            label="Essential components ready"
            value={`${result.readiness.essentialReady} of ${result.readiness.essentialTotal}`}
          />
          <Figure
            label="Applicable components to review"
            value={String(result.readiness.needsReview)}
          />
        </dl>

        {READINESS_GROUPS.map((group) => {
          const items = READINESS_ITEMS
            .filter((item) => item.group === group.key)
            .map((item) => assessments.find((a) => a.key === item.key))
            .filter((a): a is NonNullable<typeof a> => Boolean(a));
          if (items.length === 0) return null;
          return (
            <div key={group.key}>
              <p className="cc-report__eyebrow">{group.label}</p>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Matters here</th>
                    <th>Where you are</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.key}>
                      <td>{readinessItemMeta(a.key).label}</td>
                      <td>{RELEVANCE_LABELS[a.relevance]}</td>
                      <td>
                        {a.relevance === "not-required"
                          ? "Not needed for this campaign"
                          : a.state
                            ? readinessStateMeta(a.state).label
                            : "Not answered"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* ── 7. Break-even ── */}
      {be && (
        <section className="cc-report__section">
          <h2>Break-even view</h2>
          <p>
            At roughly {formatMoney(be.grossProfitPerUnit)} gross profit per{" "}
            {be.unitNoun.replace(/s$/, "")}, this plan breaks even at about{" "}
            <b>{be.breakEvenUnits.toLocaleString()} {be.unitNoun}</b>.
          </p>
          <dl className="cc-report__figures">
            <Figure
              label={`This plan's estimated ${be.unitNoun}`}
              value={be.goalUnits !== null ? be.goalUnits.toLocaleString() : null}
            />
            <Figure
              label="Projected revenue"
              value={be.projectedRevenue !== null ? formatMoney(Math.round(be.projectedRevenue)) : null}
            />
            <Figure
              label="Projected gross profit"
              value={be.projectedGrossProfit !== null ? formatMoney(Math.round(be.projectedGrossProfit)) : null}
            />
            <Figure label="Plan investment" value={formatMoney(plan.total)} />
          </dl>
          <p className="cc-report__muted">
            Revenue is not profit: projected gross profit already subtracts direct costs at your
            stated margin, but not the campaign investment itself. These figures follow from your
            own assumptions; they are planning arithmetic, not a forecast.
          </p>
        </section>
      )}

      {/* ── 8. Things worth checking ── */}
      <section className="cc-report__section">
        <h2>A few things worth checking</h2>
        {notes.length === 0 ? (
          <p className="cc-report__muted">
            Nothing stands out as a problem here. The balance of groundwork, reach, and testing
            looks proportionate to what you told us.
          </p>
        ) : (
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                {n.tone === "attention" ? <b>Worth attention: </b> : null}
                {n.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 9. The other scenarios ── */}
      <section className="cc-report__section">
        <h2>The other ways this could go</h2>
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th className="num">Estimated range</th>
              <th>What it changes</th>
            </tr>
          </thead>
          <tbody>
            {SCENARIOS.map((meta) => {
              const s = result.scenarios[meta.key];
              return (
                <tr key={meta.key}>
                  <td>
                    <b>{meta.label}</b>
                    {meta.key === plan.key ? " (shown above)" : ""}
                    <br />
                    <span className="cc-report__muted">{meta.tagline}</span>
                  </td>
                  <td className="num">{formatRange(s.totalRange)}</td>
                  <td className="cc-report__muted">{meta.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="cc-report__muted">
          Scenarios change scope: reach, channel count, creative coverage, and testing depth. They
          are not the same plan at three price points.
        </p>
      </section>

      {/* ── 10. Assumptions ── */}
      <section className="cc-report__section">
        <h2>The assumptions behind these numbers</h2>
        <dl className="cc-report__figures">
          <Figure
            label="Planning mode"
            value={financial.mode === "budget" ? "Budget-first" : "Goal-first"}
          />
          <Figure
            label="Stated budget"
            value={financial.budgetTotal !== null ? formatMoney(financial.budgetTotal) : null}
          />
          <Figure
            label="Goal"
            value={financial.goalCount !== null ? `${financial.goalCount.toLocaleString()} results` : null}
          />
          <Figure
            label="Average value per customer"
            value={financial.avgValue !== null ? formatMoney(financial.avgValue) : null}
          />
          <Figure
            label={`Conversion rate${financial.assumedConversion ? " (planning assumption)" : ""}`}
            value={pct(financial.conversionRate)}
            flag={financial.assumedConversion}
          />
          <Figure
            label={`Cost per result${financial.assumedCostPerResult ? " (planning assumption)" : ""}`}
            value={financial.costPerResult !== null ? formatMoney(financial.costPerResult, "USD", { cents: true }) : null}
            flag={financial.assumedCostPerResult}
          />
          <Figure
            label={`Target frequency${financial.assumedFrequency ? " (planning assumption)" : ""}`}
            value={financial.targetFrequency !== null ? `${financial.targetFrequency}x per person` : null}
            flag={financial.assumedFrequency}
          />
          <Figure label="Gross margin" value={pct(financial.marginPct)} />
          <Figure
            label="Expected revenue"
            value={financial.expectedRevenue !== null ? formatMoney(financial.expectedRevenue) : null}
          />
        </dl>
        {(financial.assumedConversion || financial.assumedCostPerResult || financial.assumedFrequency) && (
          <p className="cc-report__muted">
            Values marked as a planning assumption were not supplied; a starting point was used
            instead. They are the first numbers worth replacing with your own.
          </p>
        )}
      </section>

      {/* ── 11. Disclaimer ── */}
      <section className="cc-report__section">
        <h2>Please read this alongside the numbers</h2>
        <p className="cc-report__muted">
          This report contains planning estimates based on the information and assumptions entered.
          Actual advertising costs and campaign performance vary by industry, market, audience,
          platform, competition, creative quality, and execution. Results are not guaranteed.
          Market figures are planning references, not quotes or guaranteed prices, and nothing here
          commits you or LV Branding to a price. This tool is for planning purposes only and is not
          financial advice.
        </p>
        <p className="cc-report__muted">
          Prepared with the LV Branding Campaign Investment Calculator. We are happy to work through
          any of it with you.
        </p>
      </section>

      {/* Fixed, so the browser repeats it on every printed page. */}
      <footer className="cc-report__footer">
        <span>{REPORT_TITLE} · {REPORT_SUBTITLE}</span>
        <strong>{REPORT_SITE}</strong>
      </footer>
    </div>
  );
}
