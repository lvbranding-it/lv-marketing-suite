import LVLogo from "@/components/LVLogo";
import { PROJECT_PHASE_LABEL, feeLabel, money } from "@/components/ccs/ccsMeta";

// A print-friendly rendering of a completed acknowledgment. Fed normalized data
// from either the immutable snapshot (client/admin document routes) or live detail.
export interface AckDocData {
  confirmationNumber?: string;
  signedAt?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any; project?: any; templateContent?: any;
  responses: Record<string, Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intended?: any; priorUse?: any; signature?: any;
  templateVersion?: string | null; projectTermsVersion?: string | null;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch { return iso; }
}

export default function CcsAcknowledgmentDoc({ data }: { data: AckDocData }) {
  const { client, project, templateContent, responses, intended, priorUse, signature } = data;
  const steps = [...(templateContent?.steps ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  // Accepted acknowledgments grouped by step
  const acceptedGroups = steps
    .map((s) => ({
      title: s.title,
      items: (s.acknowledgments ?? []).filter((a: { key: string }) => responses[s.key]?.[a.key] === true).map((a: { text: string }) => a.text),
    }))
    .filter((g) => g.items.length > 0);
  const finalItems = (templateContent?.finalReview?.checkboxes ?? [])
    .filter((c: { key: string }) => responses["review_sign"]?.[c.key] === true).map((c: { text: string }) => c.text);

  const uses = intended?.ai_or_external_use_expected ?? [];
  const hasPrior = priorUse && priorUse.prior_use_status && priorUse.prior_use_status !== "no";

  return (
    <div className="ccs-doc mx-auto max-w-[760px] bg-white p-8 text-[#231F20] md:p-12" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-[#231F20] pb-5">
        <div className="flex items-center gap-3">
          <LVLogo size={44} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#CB2039]">LV Branding</p>
            <h1 className="text-xl font-bold leading-tight">Creative Collaboration Standard</h1>
            <p className="text-xs text-gray-500">Acknowledgment record</p>
          </div>
        </div>
        <div className="text-right text-[11px] text-gray-600">
          {data.confirmationNumber && <p><span className="font-semibold">Confirmation</span><br />{data.confirmationNumber}</p>}
          <p className="mt-1">{fmtDate(data.signedAt)}</p>
        </div>
      </div>

      {/* Parties */}
      <Section title="Project">
        <Grid rows={[
          ["Client", client?.company_name ?? "—"],
          ["Project", project?.project_name ?? "—"],
          ["Project number", project?.project_number ?? "—"],
          ["Current phase", project?.current_phase ? PROJECT_PHASE_LABEL[project.current_phase as keyof typeof PROJECT_PHASE_LABEL] : "—"],
        ]} />
      </Section>

      {/* Revision terms */}
      <Section title="Revision & fee terms">
        <Grid rows={[
          ["Included revision rounds", String(project?.included_revision_rounds ?? "—")],
          ["Additional revision minimum", money(project?.additional_revision_minimum)],
          ["Hourly production rate", money(project?.hourly_production_rate)],
          ["Reopened phase fee", feeLabel(project?.reopened_phase_fee_type, project?.reopened_phase_fee_value)],
          ["Concept restart fee", feeLabel(project?.concept_restart_fee_type, project?.concept_restart_fee_value)],
          ["Rush fee", project?.rush_fee_percentage != null ? `${project.rush_fee_percentage}%` : "—"],
        ]} />
        {project?.revision_definition && <p className="mt-2 text-[11px] italic text-gray-600">{project.revision_definition}</p>}
      </Section>

      {/* Accepted acknowledgments */}
      <Section title="Accepted acknowledgments">
        {acceptedGroups.map((g) => (
          <div key={g.title} className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.title}</p>
            <ul className="mt-1 space-y-1">
              {g.items.map((t: string, i: number) => <li key={i} className="flex gap-2 text-xs"><span className="text-[#CB2039]">✓</span><span>{t}</span></li>)}
            </ul>
          </div>
        ))}
      </Section>

      {/* AI / external input */}
      <Section title="Intended AI & external input">
        {uses.length ? (
          <div className="text-xs">
            <p><span className="font-semibold">Expected use:</span> {uses.join(", ")}</p>
            {intended?.expected_platforms && <p><span className="font-semibold">Platforms / advisors:</span> {intended.expected_platforms}</p>}
            {intended?.implementation_may_be_requested && <p className="text-[#CB2039]">Implementation of external output may be requested.</p>}
          </div>
        ) : <p className="text-xs text-gray-500">No AI or external input reported.</p>}
      </Section>

      {/* Prior use */}
      {hasPrior && (
        <Section title="Optional prior-use disclosure">
          <div className="text-xs">
            <p><span className="font-semibold">Status:</span> {priorUse.prior_use_status}</p>
            {priorUse.platforms_or_advisors && <p><span className="font-semibold">Platform / advisor:</span> {priorUse.platforms_or_advisors}</p>}
            {priorUse.materials_shared?.length ? <p><span className="font-semibold">Materials:</span> {priorUse.materials_shared.join(", ")}</p> : null}
          </div>
        </Section>
      )}
      {finalItems.length > 0 && (
        <Section title="Final confirmations">
          <ul className="space-y-1">{finalItems.map((t: string, i: number) => <li key={i} className="flex gap-2 text-xs"><span className="text-[#CB2039]">✓</span><span>{t}</span></li>)}</ul>
        </Section>
      )}

      {/* Signature */}
      <Section title="Signature">
        {signature ? (
          <div className="text-xs">
            {signature.signature_type === "drawn" && signature.signature_data
              ? <img src={signature.signature_data} alt="Signature" className="mb-2 h-16 border-b border-gray-300" />
              : <p className="mb-2 border-b border-gray-300 pb-1 text-lg" style={{ fontFamily: "'Fira Sans', cursive" }}>{signature.signature_data ?? signature.signer_name}</p>}
            <Grid rows={[
              ["Name", signature.signer_name ?? "—"],
              ["Title", signature.signer_title ?? "—"],
              ["Company", signature.signer_company ?? "—"],
              ["Email", signature.signer_email ?? "—"],
              ["Signed", fmtDate(signature.signed_at ?? data.signedAt)],
            ]} />
            {signature.consent_text && <p className="mt-2 text-[10px] leading-relaxed text-gray-500">{signature.consent_text}</p>}
          </div>
        ) : <p className="text-xs text-gray-500">Not yet signed.</p>}
      </Section>

      {/* Footer */}
      <div className="mt-6 border-t border-gray-300 pt-3 text-[10px] leading-relaxed text-gray-500">
        <p>Template version {data.templateVersion ?? "—"} · Project terms version {data.projectTermsVersion ?? "—"}</p>
        <p className="mt-1">{templateContent?.footerDisclaimer}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-gray-200 pb-1 text-sm font-bold text-[#231F20]">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-xs">
          <span className="text-gray-500">{k}</span><span className="text-right font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
