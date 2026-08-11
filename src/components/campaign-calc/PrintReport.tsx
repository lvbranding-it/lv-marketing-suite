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
import { copyFor } from "@/lib/campaign/copy/resolve";
import { formatLongDate, narrativesFor, type Lang } from "@/lib/campaign/copy";
import { useCalcCopy, useCalcLang } from "./lang";
import {
  categories as localCategories, destinationLabelOf, feasibilityBandOf,
  leanScopeAssumptions, objective as localObjective, preparationPhase,
  readinessBand as localReadinessBand, readinessGroups as localGroups,
  readinessItem, readinessStates as localStates, relevanceLabel,
  scenario as localScenario, scenarios as localScenarios, separateScopeAdditions,
  audienceBand as localAudienceBand, channelLabelOf, stages as localStages,
  reaches as localReaches,
} from "@/lib/campaign/localized";

export const REPORT_TITLE = "Campaign Investment Calculator";
export const REPORT_SUBTITLE = "A free planning tool by LV Branding";
export const REPORT_SLOGAN = "Strategy first. Always.";
export const REPORT_SITE = "www.lvbranding.com";

/** Long form for the page: "August 11, 2026" / "11 de agosto de 2026". */
export const reportDate = (d = new Date(), lang: Lang = "en") => formatLongDate(d, lang);

/**
 * The document title becomes the suggested PDF filename in every major browser,
 * so it is set around the print call. Colons and slashes are dropped because
 * they are not portable in filenames.
 */
export function reportFilename(lang: Lang = "en", d = new Date()): string {
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { productName, tagline } = copyFor(lang).meta;
  return `${productName} - ${tagline} - ${stamp}`;
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
  const t = useCalcCopy();
  const lang = useCalcLang();
  const n = narrativesFor(lang);
  const { profile, scope, financial } = answers;
  const fit = result.feasibility;
  const band = feasibilityBandOf(fit.status, lang);
  const narrative = n.feasibility(answers, fit);
  const paths = n.paths(answers, fit);
  const notes = balanceNotes(answers, plan, currentShares, lang);
  // The reserve is held outside the categories, so shares divide what is left
  // after it. This must match ResultsDashboard exactly or the printed plan and
  // the screen disagree.
  const amounts = allocationAmounts(plan.total - plan.reserveAmount, currentShares);
  const pcts = displayPercents(currentShares);
  const readinessBand = localReadinessBand(result.readiness.band, lang);
  const assessments = result.readiness.assessments;
  const objective = answers.objective ? localObjective(answers.objective, lang) : null;
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
          <h1 className="cc-report__title">{t.meta.productName}</h1>
          <p className="cc-report__subtitle">{t.meta.tagline}</p>
        </div>
        <div className="cc-report__stamp">
          <strong>{reportDate(new Date(), lang)}</strong>
          {t.report.planningEstimate}
          <br />
          {t.report.notAQuote}
        </div>
      </header>
      <p className="cc-report__slogan">{t.meta.slogan}</p>

      {/* ── 1. The plan ── */}
      <section className="cc-report__section">
        <h2>{t.report.figures.planAtAGlance}</h2>
        <p className="cc-report__lead">
          {narrative.headline}{" "}
          <span className="cc-report__pill">{band.label}</span>
        </p>
        <p className="cc-report__muted">{narrative.detail}</p>

        <dl className="cc-report__figures">
          <Figure label="Plan shown" value={`${localScenario(plan.key, lang).label} · ${formatMoney(plan.total)}`} />
          <Figure label="Objective" value={objective?.label ?? null} />
          <Figure label="Campaign length" value={`${scope.durationDays} days`} />
          <Figure label="Channels selected" value={String(scope.channels.length)} />
          <Figure label="Campaign destination" value={destinationLabelOf(answers.destination, lang)} />
          <Figure label="Audience size" value={localAudienceBand(scope.audience, lang).label} />
          <Figure label="Industry" value={profile.industry || null} />
          <Figure label="Market reach" value={localReaches(lang).find((r) => r.key === profile.reach)?.label ?? null} />
          <Figure label="Business stage" value={localStages(lang).find((b) => b.key === profile.stage)?.label ?? null} />
          <Figure label="Timing" value={scope.timeSensitive ? "Fixed date or launch window" : "Always-on"} />
        </dl>

        {scope.channels.length > 0 && (
          <p className="cc-report__muted">
            {t.report.channelsLine(scope.channels.map((c) => channelLabelOf(c, lang)).join(", "))}
          </p>
        )}

        {result.contradictions.length > 0 && (
          <div className="cc-report__note">
            <b>{t.report.contradictionsTitle}</b>
            <ul style={{ margin: "4px 0 0" }}>
              {result.contradictions.map((c) => <li key={c.id}>{c.text}</li>)}
            </ul>
          </div>
        )}

        <p className="cc-report__muted" style={{ marginTop: 8 }}>
          {n.recommendationSummary(answers, result)}
        </p>
      </section>

      {/* ── 2. Feasibility ── */}
      <section className="cc-report__section">
        <h2>{t.cards.budgetCanDo}</h2>
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
          {t.prose.startingPointFooter}
        </p>

        {paths.length > 0 && (
          <>
            <p className="cc-report__eyebrow">{t.prose.waysForward}</p>
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
          <h2>{t.cards.phaseScope}</h2>
          {plan.isPreparationPhase ? (
            <>
              <p>
                <b>{preparationPhase(lang).title}.</b> This phase gives you a plan you can act on, not a
                running campaign.
              </p>
              <ul>
                {preparationPhase(lang).inclusions.map((i) => <li key={i}>{i}</li>)}
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
                {leanScopeAssumptions(lang).map((a) => <li key={a}>{a}</li>)}
              </ul>
            </>
          )}

          {plan.requirements.deferred.length > 0 && (
            <>
              <p className="cc-report__eyebrow">{t.prose.deferredFromPhase}</p>
              <ul>
                {plan.requirements.deferred.map((d) => (
                  <li key={d.key}>{readinessItem(d.key).label}</li>
                ))}
              </ul>
            </>
          )}

          <p className="cc-report__eyebrow">{t.prose.quotedSeparately}</p>
          <ul>
            {separateScopeAdditions(lang).map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>
      )}

      {/* ── 4. Allocation ── */}
      <section className="cc-report__section">
        <h2>{t.report.figures.allocationHeading}</h2>
        <table>
          <thead>
            <tr>
              <th>{t.results.category}</th>
              <th className="num">{t.results.amount}</th>
              <th className="num">{t.results.share}</th>
            </tr>
          </thead>
          <tbody>
            {localCategories(lang).map((cat) => (
              <tr key={cat.key}>
                <td>{cat.label}</td>
                <td className="num">{formatMoney(amounts[cat.key])}</td>
                <td className="num">{pcts[cat.key]}%</td>
              </tr>
            ))}
            {plan.reserveAmount > 0 && (
              <tr>
                <td>{t.results.campaignReserve}</td>
                <td className="num">{formatMoney(plan.reserveAmount)}</td>
                <td className="num">{t.phrases.heldSeparately}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>{t.results.totalInvestment}</td>
              <td className="num">{formatMoney(plan.total)}</td>
              <td className="num">100%</td>
            </tr>
          </tfoot>
        </table>
        <p className="cc-report__muted">{n.scenarioRationale(answers, plan)}</p>
        <p className="cc-report__muted">{n.planLevers(answers, result)}</p>
      </section>

      {/* ── 5. Category detail ── */}
      <section className="cc-report__section">
        <h2>{t.cards.allocationDetail}</h2>
        <div className="cc-report__cards">
          {localCategories(lang).map((cat) => {
            const influences = result.insights.find((i) => i.key === cat.key)?.influences ?? [];
            return (
              <article key={cat.key} className="cc-report__card">
                <h3>{cat.label}</h3>
                <p className="cc-report__card-amount">
                  {formatMoney(amounts[cat.key])} · {pcts[cat.key]}%
                </p>
                <p>{cat.why}</p>
                <p><b>{t.report.figures.couldCover}</b> {cat.covers}</p>
                {influences.length > 0 && (
                  <p><b>{t.report.figures.shapedBy}</b> {influences.join("; ")}.</p>
                )}
              </article>
            );
          })}
        </div>
        <p className="cc-report__muted" style={{ marginTop: 8 }}>
          {t.prose.allocationFooter}
        </p>
      </section>

      {/* ── 6. Starting point ── */}
      <section className="cc-report__section">
        <h2>{t.cards.startingPoint}</h2>
        <p className="cc-report__lead">
          {result.readiness.score}/100
          {readinessBand ? ` · ${readinessBand.label}` : ""}
        </p>
        <p className="cc-report__muted">{n.readiness(result.readiness)}</p>
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

        {localGroups(lang).map((group) => {
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
                    <th>{t.report.tableHeaders.component}</th>
                    <th>{t.report.tableHeaders.mattersHere}</th>
                    <th>{t.report.tableHeaders.whereYouAre}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.key}>
                      <td>{readinessItem(a.key).label}</td>
                      <td>{relevanceLabel(a.relevance, lang)}</td>
                      <td>
                        {a.relevance === "not-required"
                          ? "Not needed for this campaign"
                          : a.state
                            ? localStates(lang).find((x) => x.key === a.state)!.label
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
          <h2>{t.cards.breakEven}</h2>
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
        <h2>{t.cards.worthChecking}</h2>
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
        <h2>{t.cards.otherScenarios}</h2>
        <table>
          <thead>
            <tr>
              <th>{t.report.tableHeaders.scenario}</th>
              <th className="num">{t.report.tableHeaders.estimatedRange}</th>
              <th>{t.report.tableHeaders.whatItChanges}</th>
            </tr>
          </thead>
          <tbody>
            {localScenarios(lang).map((meta) => {
              const s = result.scenarios[meta.key];
              return (
                <tr key={meta.key}>
                  <td>
                    <b>{meta.label}</b>
                    {meta.key === plan.key ? ` ${t.phrases.scenarioShownHere}` : ""}
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
          {t.prose.scenariosFooter}
        </p>
      </section>

      {/* ── 10. Assumptions ── */}
      <section className="cc-report__section">
        <h2>{t.cards.assumptions}</h2>
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
            {t.prose.assumptionsFooter}
          </p>
        )}
      </section>

      {/* ── 11. Disclaimer ── */}
      <section className="cc-report__section">
        <h2>{t.cards.disclaimerHeading}</h2>
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
        <span>{t.meta.productName} · {t.meta.tagline}</span>
        <strong>{t.meta.site}</strong>
      </footer>
    </div>
  );
}
