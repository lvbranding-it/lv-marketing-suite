import { useLayoutEffect, type ReactNode } from "react";
import "@/styles/suite-glass.css";

/** Scope the workspace theme to protected routes, including portaled controls. */
export default function SuiteTheme({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.body.setAttribute("data-suite-theme", "glass");
    return () => document.body.removeAttribute("data-suite-theme");
  }, []);

  return <>{children}</>;
}
