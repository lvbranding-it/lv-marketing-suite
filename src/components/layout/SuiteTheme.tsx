import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import "@/styles/suite-glass.css";

const STORAGE_KEY = "lv-marketing-suite-dark-mode";
const SuiteThemeContext = createContext<{ dark: boolean; setDark: (dark: boolean) => void } | null>(null);

export function useSuiteTheme() {
  const theme = useContext(SuiteThemeContext);
  if (!theme) throw new Error("useSuiteTheme must be used inside SuiteTheme");
  return theme;
}

/** Scope the workspace theme to protected routes, including portaled controls. */
export default function SuiteTheme({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");

  useLayoutEffect(() => {
    document.body.setAttribute("data-suite-theme", "glass");
    document.body.classList.toggle("dark", dark);
    document.body.style.colorScheme = dark ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, String(dark));
    return () => {
      document.body.removeAttribute("data-suite-theme");
      document.body.classList.remove("dark");
      document.body.style.removeProperty("color-scheme");
    };
  }, [dark]);

  return <SuiteThemeContext.Provider value={{ dark, setDark }}>{children}</SuiteThemeContext.Provider>;
}
