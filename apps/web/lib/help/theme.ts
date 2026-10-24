/**
 * The light and dark theme (Task C9; v1 2610-2620). The choice is a fact about this device, so it lives in localStorage under v1's own key
 * `appu_theme` and on the root element as `data-theme`, which globals.css reads. Light is the default whatever the device's own setting says:
 * a student whose computer happens to be in dark mode still opens the bright, readable page and chooses dark on purpose (v1 2610).
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "appu_theme";

/**
 * The inline script in <head> (layout.tsx gives it the request's CSP nonce): it sets `data-theme` before the first paint, so a student who chose
 * dark never sees a white flash. Plain ES5 text, it reads nothing but localStorage and never the device's colour-scheme setting.
 */
export const THEME_SCRIPT =
  '(function(){var t="light";try{if(window.localStorage.getItem("' + THEME_KEY + '")==="dark")t="dark"}catch(e){}document.documentElement.setAttribute("data-theme",t)})()';

/** The theme chosen on this device: "dark" only when `appu_theme` says so; light with nothing stored, anything else, or storage that cannot be read. */
export function getTheme(): Theme {
  try { return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

/** Chooses a theme: sets the attribute at once, then remembers it on this device (a refused write still leaves the theme changed for this visit). */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked or full: the choice lasts until the page closes */ }
}
