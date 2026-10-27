// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_SCRIPT, getTheme, setTheme } from "../lib/help/theme";
import { ThemeButton } from "../components/help/theme/ThemeButton";
import { DICTS } from "../lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  const label = (host: HTMLElement) => host.querySelector("[data-testid=theme-toggle]")!.getAttribute("aria-label");
  it("offers dark first, switches on a click, persists, and offers light after", async () => {
    const host = draw();
    const btn = () => host.querySelector<HTMLButtonElement>("[data-testid=theme-toggle]")!;
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_dark);
    await act(async () => { btn().click(); });
    expect(localStorage.getItem("appu_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_light);
    await act(async () => { btn().click(); });
    expect(localStorage.getItem("appu_theme")).toBe("light");
    expect(btn().getAttribute("aria-label")).toBe(DICTS.en.wc_theme_to_dark);
  });
  it("starts in dark when the page already says dark (the inline script ran before the button did)", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(label(draw())).toBe(DICTS.en.wc_theme_to_light);
  });
  it("follows the attribute, not storage: a theme set by something else changes the label with no click", async () => {
    const host = draw();
    expect(label(host)).toBe(DICTS.en.wc_theme_to_dark);
    await act(async () => { document.documentElement.setAttribute("data-theme", "dark"); });
    expect(label(host)).toBe(DICTS.en.wc_theme_to_light);
    await act(async () => { document.documentElement.setAttribute("data-theme", "light"); });
    expect(label(host)).toBe(DICTS.en.wc_theme_to_dark);
  });
  it("never reads storage to draw itself, and the server's render is the light button", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    localStorage.setItem(THEME_KEY, "dark");
    get.mockClear();
    const host = draw();
    expect(get).not.toHaveBeenCalled();
    expect(label(host)).toBe(DICTS.en.wc_theme_to_dark);
    vi.restoreAllMocks();
    expect(renderToString(<ThemeButton />)).toContain(DICTS.en.wc_theme_to_dark);
  });
  it("its words are in both languages and have no em-dash", () => {
    for (const k of ["wc_theme_to_dark", "wc_theme_to_light"]) { expect(DICTS.en[k]).toBeTruthy(); expect(DICTS.hi[k]).toBeTruthy(); expect(DICTS.en[k]).not.toMatch(/—/); }
  });
  it("the source does not set state in an effect (the lint rule this task tripped)", () => {
    const src = readFileSync(join(process.cwd(), "components/help/theme/ThemeButton.tsx"), "utf8");
    expect(src).toMatch(/useSyncExternalStore/);
    expect(src).not.toMatch(/useEffect/);
  });
});
