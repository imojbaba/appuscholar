// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_SCRIPT, getTheme, setTheme } from "../lib/help/theme";
import { ThemeButton } from "../components/help/theme/ThemeButton";
import { DICTS } from "../lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- Contrast: the colours are read from globals.css itself, so the test cannot drift from the page -----------------------------------------------

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** The declarations of every rule whose selector is exactly `selector`, merged in file order. */
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp("(?:^|[}/;])\\s*" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g");
  for (const m of CSS.matchAll(re)) for (const d of m[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  return out;
}
/** The light primary button is `bg-purple-800` (hover `bg-purple-600`, pressed `bg-purple-900`, components/ui/button.tsx); the dark theme names its own fills. */
const LIGHT = { ...tokens(":root"), "--fill": "var(--purple-800)", "--fill-hover": "var(--purple-600)", "--fill-active": "var(--purple-900)" };
const DARK = { ...LIGHT, ...tokens(':root[data-theme="dark"]') };

/** A token's colour as "#rrggbb", following var(--x) references through the theme's own tokens. */
function colour(theme: Record<string, string>, name: string): string {
  let v = name.startsWith("--") ? theme[name] : name;
  for (let i = 0; i < 8 && v && v.startsWith("var("); i++) v = theme[/var\((--[\w-]+)/.exec(v)![1]!];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a plain #rrggbb colour in this theme (${v})`);
  return v.toLowerCase();
}
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Foreground on background, for the text the app draws: body, muted, headings and links, the primary button, notes, the destructive text. */
const SURFACES = ["--bg", "--card", "--soft", "--chip"];
const PAIRS: Array<[string, string, string]> = [
  ...SURFACES.flatMap((s): Array<[string, string, string]> => [
    ["--ink", s, "body text"], ["--muted", s, "muted text"], ["--purple-800", s, "headings and links"], ["--accent-ink", s, "links"], ["--danger-ink", s, "destructive text"]
  ]),
  ["--purple-800", "--purple-100", "chip and toggle text"], ["--accent-ink", "--purple-100", "links on a chip"], ["--accent-foreground", "--accent", "accent text"],
  ["--secondary-foreground", "--secondary", "secondary button"], ["--ink", "--purple-100", "text on a chip"],
  ["--primary-foreground", "--primary", "default button"],
  ["--primary-foreground", "--fill", "primary button"], ["--primary-foreground", "--fill-hover", "primary button, hover"], ["--primary-foreground", "--fill-active", "primary button, pressed"],
  ["--flag-ink", "--flag-bg", "caution note"], ["--ok-ink", "--ok-bg", "good note"], ["--danger-ink", "--danger-bg", "problem note"],
  ["--ink", "--gold-wash", "AI-inserted text"], ["--ink", "--flag-bg", "text in a caution note"]
];

describe("dark theme: contrast of the token pairs (Review Focus 5)", () => {
  for (const [name, theme] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: every foreground and background pair used for text is at least 4.5:1`, () => {
      const low = PAIRS.map(([fg, bg, what]) => ({ what, fg, bg, r: contrast(colour(theme, fg), colour(theme, bg)) })).filter((p) => p.r < 4.5);
      expect(low.map((p) => `${p.what}: ${p.fg} on ${p.bg} is ${p.r.toFixed(2)}`)).toEqual([]);
    });
  }
  it("the dark block redefines the surfaces and the text, so it is a real second theme", () => {
    const dark = tokens(':root[data-theme="dark"]');
    for (const k of ["--bg", "--card", "--soft", "--chip", "--line", "--ink", "--muted", "--purple-800", "--purple-100", "--flag-ink", "--ok-ink", "--danger-ink"]) expect(dark[k], k).toBeDefined();
    expect(contrast(colour(DARK, "--ink"), colour(DARK, "--bg"))).toBeGreaterThan(contrast(colour(LIGHT, "--bg"), colour(LIGHT, "--card")));
    expect(CSS).toMatch(/color-scheme:\s*dark/);
  });
  it("the Tailwind dark: variant follows the chosen theme, not the device's setting", () => {
    expect(CSS).toMatch(/@custom-variant dark \([^)]*data-theme="dark"/);
  });
});

// ---- The helper -----------------------------------------------------------------------------------------------------------------------------------

function darkDevice() {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
}
beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("getTheme and setTheme (v1 2610)", () => {
  it("is light with nothing stored, and ignores a device that prefers dark", () => {
    darkDevice();
    expect(getTheme()).toBe("light");
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
  });
  it("is light when storage holds anything else, or cannot be read", () => {
    localStorage.setItem(THEME_KEY, "purple");
    expect(getTheme()).toBe("light");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getTheme()).toBe("light");
    vi.restoreAllMocks();
  });
  it("setTheme writes appu_theme and sets the attribute, and getTheme reads it back", () => {
    setTheme("dark");
    expect(localStorage.getItem("appu_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getTheme()).toBe("dark");
    setTheme("light");
    expect(localStorage.getItem("appu_theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("setTheme still sets the attribute when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    vi.restoreAllMocks();
  });
});

describe("the inline script that runs before paint", () => {
  const run = () => new Function(THEME_SCRIPT)();
  it("sets the stored theme on <html> as soon as it runs", () => {
    localStorage.setItem(THEME_KEY, "dark");
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("sets light with nothing stored, even on a device that prefers dark", () => {
    darkDevice();
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("sets light when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    vi.restoreAllMocks();
  });
  it("is plain text with no </script> and does not read prefers-color-scheme", () => {
    expect(THEME_SCRIPT).not.toMatch(/<\/script/i);
    expect(THEME_SCRIPT).not.toMatch(/prefers-color-scheme|matchMedia/);
  });
  it("the layout puts it in <head> with the request's CSP nonce", () => {
    const src = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(src).toMatch(/<script[^>]*nonce=\{nonce\}[^>]*THEME_SCRIPT|<script[^>]*THEME_SCRIPT[^>]*nonce=\{nonce\}/);
    expect(src).toMatch(/<html[^>]*suppressHydrationWarning/);
  });
});

describe("the header's theme button", () => {
  function draw() {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => { createRoot(host).render(<ThemeButton />); });
    return host;
  }
  it("offers dark first, switches on a click, persists, and offers light after", () => {
    const host = draw();
    const btn = () => host.querySelector<HTMLButtonElement>("[data-testid=theme-toggle]")!;
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_dark);
    act(() => { btn().click(); });
    expect(localStorage.getItem("appu_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_light);
    act(() => { btn().click(); });
    expect(localStorage.getItem("appu_theme")).toBe("light");
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_dark);
  });
  it("starts in dark when the chosen theme is already dark on this device", () => {
    setTheme("dark");
    const host = draw();
    expect(host.querySelector("[data-testid=theme-toggle]")!.getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_light);
  });
  it("its words are in both languages and have no em-dash", () => {
    for (const k of ["wc_theme_to_dark", "wc_theme_to_light"]) { expect(DICTS.en[k]).toBeTruthy(); expect(DICTS.hi[k]).toBeTruthy(); expect(DICTS.en[k]).not.toMatch(/—/); }
  });
});
