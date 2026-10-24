"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { getTheme, setTheme, type Theme } from "@/lib/help/theme";

/**
 * The header's light/dark button (Task C9; v1's themeBtn, a moon in light and a sun in dark). The inline script in <head> has already set the
 * attribute, so this only reads what the device chose once it has mounted: the server's render and the first paint show the light button.
 */
export function ThemeButton() {
  const t = useT();
  const [theme, set] = useState<Theme>("light");
  useEffect(() => { set(getTheme()); }, []);
  const dark = theme === "dark";
  const label = t(dark ? "wc_theme_to_light" : "wc_theme_to_dark");
  return (
    <button type="button" className="app-hbtn" aria-label={label} title={label} data-testid="theme-toggle" onClick={() => { const next: Theme = dark ? "light" : "dark"; setTheme(next); set(next); }}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
