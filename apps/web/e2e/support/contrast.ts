import type { Page } from "@playwright/test";

/** One piece of text that is hard to read: where it is, its colours as the browser drew them, and the WCAG contrast ratio between them. */
export type LowContrast = { where: string; text: string; fg: string; bg: string; ratio: number };

/**
 * Every visible piece of text under `root` (default the whole page) whose colour against what is behind it is under 4.5:1 (3:1 for large text), as
 * Chromium computed it: the real tokens, tints, opacities and inline colours, not a table. Text on a gradient or a picture is left out (there is no
 * single background to measure against), and so are disabled controls (exempt from the rule) and aria-hidden marks (the crumbs' slash is decoration, as in
 * the light theme). Run it with a dialog open to audit the dialog. `skip` is a selector for text to leave out, for a fault that is the same in both themes.
 */
export async function lowContrast(page: Page, root = "body", skip = ""): Promise<LowContrast[]> {
  // Let running transitions finish first: a control that has just stopped being disabled fades its opacity back up (the Button's transition-all), and
  // measured half-way it reads as faint although it is not (CI 0768a3f, the shelf's buttons as the shelf finished loading).
  // A spinner runs for ever, so only finite ones are waited for, and never more than 2 s.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
    new Promise((done) => setTimeout(done, 2000))
  ]));
  return page.evaluate(([rootSel, skipSel]) => {
    type RGBA = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    /** A CSS colour as [r, g, b, a]. rgb() is read as written; any other syntax (color(srgb), oklab, ...) is drawn opaque on a canvas and its alpha read from the text. */
    const parse = (css: string): RGBA => {
      const m = /^rgba?\(([^)]+)\)$/.exec(css);
      if (m) { const p = m[1]!.split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1]; }
      const am = /\/\s*([\d.]+%?)\s*\)$/.exec(css);
      const a = am ? (am[1]!.endsWith("%") ? parseFloat(am[1]!) / 100 : parseFloat(am[1]!)) : 1;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = am ? css.replace(/\/\s*[\d.]+%?\s*\)$/, ")") : css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, a];
    };
    const mix = (top: RGBA, under: RGBA, k = 1): RGBA => {
      const a = top[3] * k;
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), a + under[3] * (1 - a)];
    };
    const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = (c: RGBA) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const name = (el: Element) => el.tagName.toLowerCase() + (el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : "") + (typeof (el as HTMLElement).className === "string" && (el as HTMLElement).className ? "." + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join(".") : "");

    /** What is behind `el`: its ancestors' backgrounds laid over each other, or null when a gradient or picture is in the way. */
    const backdrop = (el: Element): RGBA | null => {
      const layers: RGBA[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") return null;
        const c = parse(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let out: RGBA = [255, 255, 255, 1];
      for (const l of layers.reverse()) out = mix(l, out);
      return out;
    };
    const faded = (el: Element) => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const exempt = (el: Element) => (!!skipSel && !!el.closest(skipSel)) || !!el.closest(":disabled, [aria-disabled='true'], [aria-hidden='true'], [inert], script, style, noscript, [hidden]") || (el as HTMLElement).tagName === "OPTION";

    const out: Array<{ where: string; text: string; fg: string; bg: string; ratio: number }> = [];
    const check = (el: Element, text: string, colour: string) => {
      if (exempt(el) || !(el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const bg = backdrop(el);
      if (!bg) return;
      const k = faded(el);
      const fg = mix(parse(colour), bg, k < 1 ? k : 1);
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const rat = ratio(fg, bg);
      if (rat < min) out.push({ where: name(el), text: text.trim().slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: Math.round(rat * 100) / 100 });
    };

    const rootEl = document.querySelector(rootSel!);
    if (!rootEl) return out;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim()) continue;
      const svg = el.closest("svg");
      check(el, n.textContent, svg ? getComputedStyle(el).fill : getComputedStyle(el).color);
    }
    // text typed or hinted inside a field is not a text node
    rootEl.querySelectorAll("input, textarea").forEach((f) => {
      const field = f as HTMLInputElement;
      if (["checkbox", "radio", "range", "color", "file", "hidden", "button", "submit"].includes(field.type)) return;
      if (field.value) check(field, field.value, getComputedStyle(field).color);
      else if (field.placeholder) check(field, field.placeholder, getComputedStyle(field, "::placeholder").color);
    });
    return out;
  }, [root, skip]);
}
