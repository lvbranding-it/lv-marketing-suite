// ── Calculator language context ─────────────────────────────────────────────────
// The calculator renders one language for the whole page (there is no in-page
// toggle), so language is read from context rather than threaded through every
// component as a prop. `useCalcCopy()` returns the resolved copy set;
// `useCalcLang()` returns the tag for the engine calls that take one.

import { createContext, useContext, useMemo } from "react";
import { copyFor } from "@/lib/campaign/copy/resolve";
import type { CalcCopy, Lang } from "@/lib/campaign/copy";

const LangContext = createContext<Lang>("en");

export function CalcLangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useCalcLang = (): Lang => useContext(LangContext);

export function useCalcCopy(): CalcCopy {
  const lang = useCalcLang();
  return useMemo(() => copyFor(lang), [lang]);
}
