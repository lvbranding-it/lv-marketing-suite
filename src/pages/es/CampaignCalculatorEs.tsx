// ── Calculadora de Inversión en Campañas ────────────────────────────────────────
// The Spanish route. Same component, same engine, same persisted state; only the
// language differs. Following the pattern of the other /es/ pages, there is no
// in-page toggle: a visitor arrives here from es.lvbranding.com or a direct link.

import CampaignCalculator from "@/pages/CampaignCalculator";

export default function CampaignCalculatorEs() {
  return <CampaignCalculator lang="es" />;
}
