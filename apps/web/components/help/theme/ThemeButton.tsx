"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { setTheme, type Theme } from "@/lib/help/theme";

/** Live `data-theme` on <html>: the attribute is the truth (the inline script in <head> and setTheme write it), the server's render says light. */
function useTheme(): Theme {
  return useSyncExternalStore(
    (notify) => {
      const watch = new MutationObserver(notify);
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => watch.disconnect();
    },
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light"
  );
}

/**
 * The header's light/dark button (Task C9; v1's themeBtn, a moon in light and a sun in dark). It reads the page's attribute, not storage, so it
 * always agrees with what is drawn: the server's render and hydration show the light button, then the attribute the script set.
 */
export function ThemeButton() {
  const t = useT();
  const dark = useTheme() === "dark";
  const label = t(dark ? "wc_theme_to_light" : "wc_theme_to_dark");
  return (
    <button type="button" className="app-hbtn" aria-label={label} title={label} data-testid="theme-toggle" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
