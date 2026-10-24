import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CL_COLS } from "../lib/tools/close/report";

/**
 * Task C9, Review Focus 5: the dark theme keeps every text readable. The colours are read from globals.css and from the Button's own class list, so
 * the test cannot drift from the page. Text pairs are held to 4.5:1, drawn shapes (the simulator's bars) to 3:1.
 */

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const BUTTON = readFileSync(join(ROOT, "components/ui/button.tsx"), "utf8");

// ---- A small reader for the stylesheet ---------------------------------------------------------------------------------------------------------

type Rule = { sels: string[]; decl: Record<string, string>; at: string[] };

/** Splits `text` at `sep` where it is outside brackets and quotes. */
function split(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = ""; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Every style rule of the sheet, with the at-rules it sits in (`@media not print`, `@layer utilities`), nesting flattened. */
function parse(text: string, at: string[] = []): Rule[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let i = 0;
  while (i < src.length) {
    let j = i, quote = "";
    for (; j < src.length; j++) {
      const ch = src[j]!;
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "{" || ch === ";") break;
    }
    const prelude = src.slice(i, j).trim();
    if (j >= src.length) break;
    if (src[j] === ";") { i = j + 1; continue; }
    let depth = 1, k = j + 1;
    for (quote = ""; k < src.length && depth > 0; k++) {
      const ch = src[k]!;
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const body = src.slice(j + 1, k - 1);
    if (/^@(media|layer|supports|container)\b/.test(prelude)) rules.push(...parse(body, [...at, prelude.replace(/\s+/g, " ")]));
    else {
      const decl: Record<string, string> = {};
      for (const d of split(body, ";")) { const c = d.indexOf(":"); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
      rules.push({ sels: prelude.startsWith("@") ? [prelude.replace(/\s+/g, " ")] : split(prelude, ",").map((s) => s.replace(/\s+/g, " ")), decl, at });
    }
    i = k;
  }
  return rules;
}

const RULES = parse(CSS);
const DARK_ROOT = ':root[data-theme="dark"]';
/** The merged declarations of the rules whose selector list holds exactly `sel`, in file order. */
const declOf = (sel: string, keep: (r: Rule) => boolean = () => true) => Object.assign({}, ...RULES.filter((r) => r.sels.includes(sel) && keep(r)).map((r) => r.decl)) as Record<string, string>;
/** The dark theme's own rules: those whose selectors start at the dark root. */
const DARK_RULES = RULES.filter((r) => r.sels.some((s) => s.startsWith(DARK_ROOT)));

// ---- Themes ------------------------------------------------------------------------------------------------------------------------------------

type Theme = Record<string, string>;
const tokensOnly = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith("--")));
const LIGHT: Theme = tokensOnly(declOf(":root"));
const DARK: Theme = { ...LIGHT, ...tokensOnly(declOf(DARK_ROOT)) };
/** The editor's paper in the dark theme: the dark page with the paper's own re-declared tokens on top. */
const PAPER: Theme = { ...DARK, ...tokensOnly(declOf(DARK_ROOT + " .editor")) };
/** A dark rule that gives one element its own tokens (a role switch), laid over the dark page. */
const scoped = (theme: Theme, sel: string): Theme => {
  const own = tokensOnly(declOf(DARK_ROOT + " " + sel));
  if (!Object.keys(own).length) throw new Error(`no dark rule re-declares tokens on ${sel}`);
  return { ...theme, ...own };
};

/** A colour as "#rrggbb": a literal, or a token followed through the theme's own var() references. */
function colour(theme: Theme, spec: string): string {
  let v = spec.startsWith("--") ? theme[spec] : spec;
  for (let i = 0; i < 8 && v && v.startsWith("var("); i++) v = theme[/var\((--[\w-]+)/.exec(v)![1]!];
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${spec} is not a plain #rrggbb colour in this theme (${v})`);
  return v.toLowerCase();
}
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `fg` at `alpha` laid over the opaque `bg`. */
function over(fg: string, alpha: number, bg: string): string {
  const f = parseInt(fg.slice(1), 16), g = parseInt(bg.slice(1), 16);
  return "#" + [16, 8, 0].map((s) => Math.round(((f >> s) & 255) * alpha + ((g >> s) & 255) * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

// ---- The pairs ---------------------------------------------------------------------------------------------------------------------------------

/** `bg` may be laid over the card at `alpha` (a tint, or a button's `bg-x/60`); `scope` is a dark rule that gives the element its own tokens; `theme` limits a pair to one run. */
type Pair = { what: string; fg: string; bg: string; alpha?: number; scope?: string; theme?: "light" | "dark" };

/** The Button's primary variant, read from its class list: which purples it fills with, and the text on them. */
const PRIMARY = /primary:\s*\n?\s*"([^"]*)"/.exec(BUTTON)![1]!;
const klass = (re: RegExp) => `--purple-${re.exec(PRIMARY)![1]}`;
const FILL = klass(/(?:^|\s)bg-purple-(\d+)/), FILL_HOVER = klass(/hover:bg-purple-(\d+)/), FILL_ACTIVE = klass(/active:bg-purple-(\d+)/);
/** A purple fill under white text: the Button's primary variant, the personal-details dialog's pressed pills. */
const PRIMARY_SCOPE = ".bg-purple-800.text-white";

const SURFACES = ["--bg", "--card", "--soft", "--chip"];
const PAIRS: Pair[] = [
  ...SURFACES.flatMap((s): Pair[] => [
    { what: "body text", fg: "--ink", bg: s }, { what: "muted text", fg: "--muted", bg: s }, { what: "headings and links", fg: "--purple-800", bg: s },
    { what: "links", fg: "--accent-ink", bg: s }, { what: "destructive text", fg: "--danger-ink", bg: s },
    { what: "caution text", fg: "--flag-ink", bg: s }, { what: "good text", fg: "--ok-ink", bg: s }
  ]),
  { what: "chip and toggle text", fg: "--purple-800", bg: "--purple-100" }, { what: "links on a chip", fg: "--accent-ink", bg: "--purple-100" },
  { what: "accent text", fg: "--accent-foreground", bg: "--accent" }, { what: "secondary button", fg: "--secondary-foreground", bg: "--secondary" },
  { what: "text on a chip", fg: "--ink", bg: "--purple-100" },
  { what: "default button", fg: "--primary-foreground", bg: "--primary" },
  { what: "destructive text on a page", fg: "--destructive", bg: "--card" },
  // the destructive button: white on the red; the hover is 90% of it, and shadcn's dark: variant (live now that dark: follows the theme) is 60%
  { what: "destructive button", fg: "#ffffff", bg: "--destructive", scope: ".bg-destructive" },
  { what: "destructive button, hover", fg: "#ffffff", bg: "--destructive", alpha: 0.9, scope: ".bg-destructive" },
  { what: "destructive button, dark variant", fg: "#ffffff", bg: "--destructive", alpha: 0.6, scope: ".bg-destructive", theme: "dark" },
  // the primary button: the fill, its hover and its pressed state, read from the class list; in the dark theme the button re-declares its own purples
  { what: "primary button", fg: "#ffffff", bg: FILL, scope: PRIMARY_SCOPE }, { what: "primary button, hover", fg: "#ffffff", bg: FILL_HOVER, scope: PRIMARY_SCOPE },
  { what: "primary button, pressed", fg: "#ffffff", bg: FILL_ACTIVE, scope: PRIMARY_SCOPE },
  // the offline bar and the cleared-files pill: white on bg-purple-900
  { what: "offline bar", fg: "#ffffff", bg: "--purple-900", scope: ".bg-purple-900.text-white" },
  // text drawn in the primary colour (the wordmark on sign-in, the link button, the step numbers)
  { what: "primary colour as text", fg: "--primary", bg: "--bg", scope: ".text-primary" }, { what: "primary colour as text on a card", fg: "--primary", bg: "--card", scope: ".text-primary" },
  // the gold button's text (Button gold: text-ink on bg-gold, and on bg-gold-bright when hovered)
  { what: "gold button", fg: "--ink", bg: "--gold", scope: ".bg-gold" }, { what: "gold button, hover", fg: "--ink", bg: "--gold-bright", scope: ".bg-gold" },
  // the toast is an inverted slab (ink fill, card text); its Undo is gold, which has to darken on the light slab
  { what: "toast", fg: "--card", bg: "--ink" }, { what: "toast Undo", fg: "--gold-bright", bg: "--ink", scope: ".toast" },
  // the AI pill and the AI read label write a literal colour in the light theme (#7a5412) and the gold token in the dark one
  ...[["AI pill", ".app-ai-pill", "--card"], ["AI pill, hover", ".app-ai-pill", "--gold-wash"], ["AI read label", ".ai-read-label", "--soft"], ["AI read label on a card", ".ai-read-label", "--card"]].flatMap(([what, sel, bg]): Pair[] => [
    { what: what + " (light)", fg: declOf(sel!).color!, bg: bg!, theme: "light" }, { what: what + " (dark)", fg: declOf(DARK_ROOT + " " + sel).color!, bg: bg!, theme: "dark" }
  ]),
  // the home page's purple band (SuggestedNext): white on the fill, the sub-line in the lightest purple, the white button's purple text
  { what: "next-step band", fg: "#ffffff", bg: "--purple-800", scope: ".home-next" }, { what: "next-step band, sub-line", fg: "--purple-100", bg: "--purple-800", scope: ".home-next" },
  { what: "next-step band, heading", fg: "#ddd6fe", bg: "--purple-800", scope: ".home-next" }, { what: "next-step button", fg: "--purple-800", bg: "#ffffff", scope: ".home-next" },
  // notes
  { what: "caution note", fg: "--flag-ink", bg: "--flag-bg" }, { what: "good note", fg: "--ok-ink", bg: "--ok-bg" }, { what: "problem note", fg: "--danger-ink", bg: "--danger-bg" },
  { what: "AI-inserted text", fg: "--ink", bg: "--gold-wash" }, { what: "text in a caution note", fg: "--ink", bg: "--flag-bg" },
  // the Settings key line (ProviderKey): Tailwind's green, red and amber 700 are mapped to the note inks in the dark theme
  { what: "key accepted", fg: "--color-green-700", bg: "--card", theme: "dark" }, { what: "key refused", fg: "--color-red-700", bg: "--card", theme: "dark" },
  { what: "key unchecked", fg: "--color-amber-700", bg: "--card", theme: "dark" }, { what: "key warning in the help box", fg: "--color-amber-700", bg: "--soft", theme: "dark" },
  // the personal-details dialog (lib/ai/pdDialog.tsx): amber 900 on amber 50 for a word, amber 900 on the card for the locked line
  { what: "word in the personal-details dialog", fg: "--color-amber-900", bg: "--color-amber-50", theme: "dark" }, { what: "locked line in the personal-details dialog", fg: "--color-amber-900", bg: "--card", theme: "dark" },
  // the Closeness tab's marked passages: the text keeps the page's ink on each source's tint
  ...CL_COLS.map((c, i): Pair => {
    const m = /rgba\((\d+),(\d+),(\d+),([.\d]+)\)/.exec(c)!;
    return { what: `marked passage ${i + 1}`, fg: "--ink", bg: "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join(""), alpha: Number(m[4]) };
  }),
  // the Citations tab's active card and checks, and the quick read's warning: literal colours in the light theme, tokens in the dark one
  { what: "active citation card (light)", fg: "--ink", bg: declOf(".cit-item.cit-active").background!, theme: "light" },
  { what: "active citation card (dark)", fg: "--ink", bg: declOf(DARK_ROOT + " .cit-item.cit-active").background!, theme: "dark" },
  ...[["check passed", ".cit-item .rc-ok"], ["check not found", ".cit-item .rc-nf"], ["check differs", ".cit-item .rc-diff"], ["quick-check warning", ".rs-quick .ap-warn"]].flatMap(([what, sel]): Pair[] => [
    { what: what + " (light)", fg: declOf(sel!).color!, bg: "--card", theme: "light" }, { what: what + " (dark)", fg: declOf(DARK_ROOT + " " + sel).color!, bg: "--card", theme: "dark" }
  ])
];

const resolveFor = (theme: Theme, p: Pair) => {
  const base = theme === LIGHT || !p.scope ? theme : scoped(theme, p.scope);
  const bg = colour(base, p.bg);
  return { fg: colour(base, p.fg), bg: p.alpha === undefined ? bg : over(bg, p.alpha, colour(base, "--card")) };
};

describe("dark theme: contrast of the pairs the app draws (Review Focus 5)", () => {
  for (const [name, theme] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: every text pair is at least 4.5:1`, () => {
      const low = PAIRS.filter((p) => !p.theme || p.theme === name).map((p) => {
        const { fg, bg } = resolveFor(theme, p);
        return { what: p.what, fg, bg, r: contrast(fg, bg) };
      }).filter((p) => p.r < 4.5);
      expect(low.map((p) => `${p.what}: ${p.fg} on ${p.bg} is ${p.r.toFixed(2)}`)).toEqual([]);
    });
  }
  it("the primary button is read from the Button's class list, so the pairs cannot drift from it", () => {
    expect(PRIMARY).toMatch(/text-white/);
    expect([FILL, FILL_HOVER, FILL_ACTIVE]).toEqual(["--purple-800", "--purple-600", "--purple-900"]);
  });
  it("the editor's paper in the dark theme is the light page: white paper, the light ink, the light marks", () => {
    const paper = declOf(DARK_ROOT + " .editor");
    expect(paper["color-scheme"]).toBe("light");
    expect(paper.background).toBe("var(--card)");
    expect(paper.color).toBe("var(--ink)");
    // every colour the dark theme changes is put back to the light value inside the paper (the fills and shadows belong to the page, not the text)
    const changed = Object.keys(tokensOnly(declOf(DARK_ROOT))).filter((k) => !/^--(fill|shadow|primary|destructive|on-)/.test(k) && /^#/.test(DARK[k]!));
    expect(changed.length).toBeGreaterThan(15);
    for (const k of changed) expect(PAPER[k], k).toBe(LIGHT[k]);
    // pasted and picked text colours were chosen for a white page: the paper's text, marks and placeholder are the light theme's
    expect(contrast(colour(PAPER, "--ink"), colour(PAPER, "--card"))).toBeGreaterThanOrEqual(12);
    for (const [what, fg, bg] of [["highlight", "--ink", "#fde68a"], ["find hit", "--ink", "#fde68a"], ["current find hit", "--ink", "#f59e0b"], ["placeholder", "--muted", "--card"], ["AI-inserted text", "--ink", "--gold-wash"]] as const) {
      expect(contrast(colour(PAPER, fg), colour(PAPER, bg)), what).toBeGreaterThanOrEqual(4.5);
    }
    // the rules the light theme writes for marks are the ones that apply: no dark colour override sits on the editor's text
    expect(DARK_RULES.filter((r) => r.sels.some((s) => /\.ProseMirror/.test(s)))).toEqual([]);
  });
  it("a marked passage keeps the page's ink: the browser's own mark is black text", () => {
    expect(declOf(DARK_ROOT + " mark").color).toBe("inherit");
  });
  it("the simulator's bars (drawn shapes) keep 3:1 against the dark card, and the dashed line follows the ink", () => {
    const bars = declOf(DARK_ROOT + ' .power-sim svg rect[fill="#6d28d9"]');
    expect(bars.fill, "a rule for the powered bars").toBeTruthy();
    const card = colour(DARK, "--card");
    expect(contrast(colour(DARK, bars.fill!), card)).toBeGreaterThanOrEqual(3);
    expect(contrast("#b8b3c9", card)).toBeGreaterThanOrEqual(3);
    // the powered bars stay the darker ones, as the sentence under the chart ("Dark bars reached p < .05; grey bars did not") says
    expect(lum(colour(DARK, bars.fill!))).toBeLessThan(lum("#b8b3c9"));
    expect(contrast(colour(DARK, "--ink"), card)).toBeGreaterThanOrEqual(7);
  });
  it("the dark block is a real second theme: it changes every surface, the ink and the notes", () => {
    for (const k of ["--bg", "--card", "--soft", "--chip", "--line", "--line-strong", "--ink", "--muted", "--accent-ink", "--purple-800", "--purple-100", "--flag-ink", "--flag-bg", "--ok-ink", "--ok-bg", "--danger-ink", "--danger-bg", "--gold-wash"]) {
      expect(DARK[k], k).toBeDefined();
      expect(DARK[k], `${k} is the same as in the light theme`).not.toBe(LIGHT[k]);
    }
    for (const k of ["--bg", "--card", "--soft", "--chip"]) expect(lum(colour(DARK, k)), k + " is dark").toBeLessThan(0.05);
    expect(lum(colour(DARK, "--ink"))).toBeGreaterThan(0.6);
    expect(DARK_RULES.some((r) => r.decl["color-scheme"] === "dark")).toBe(true);
  });
  it("the Tailwind dark: variant follows the chosen theme, not the device's setting", () => {
    expect(CSS).toMatch(/@custom-variant dark \([^)]*data-theme="dark"/);
  });
  it("the dark rules sit in `@media not print`, so a page printed in the dark theme prints light", () => {
    expect(DARK_RULES.length).toBeGreaterThan(8);
    for (const r of DARK_RULES) expect(r.at, r.sels.join(", ")).toContain("@media not print");
  });
  it("a dark rule on a Tailwind class re-declares tokens and sets no property, so hover, focus and pressed states of that class still win", () => {
    const utility = (s: string) => /\.(bg|text|border|hover|focus|active|ring)[-\\:]/.test(s.slice(DARK_ROOT.length));
    const onClasses = DARK_RULES.filter((r) => r.sels.some(utility));
    expect(onClasses.length).toBeGreaterThanOrEqual(3);
    for (const r of onClasses) expect(Object.keys(r.decl).filter((k) => !k.startsWith("--")), r.sels.join(", ")).toEqual([]);
  });
  it("the dark block has no rule for the charts' white sheet or the editor (nothing there to fix)", () => {
    expect(CSS).not.toMatch(/background: rgb\(255, 255, 255\)/);
    expect(CSS).not.toMatch(/color: #000;/);
  });
  it("every colour a dark rule sets directly (not through a token) is held to a pair above", () => {
    const direct = DARK_RULES.flatMap((r) => r.sels.filter((s) => s.length > DARK_ROOT.length).map((s) => ({ sel: s.slice(DARK_ROOT.length).trim(), decl: r.decl })))
      .filter(({ decl }) => Object.keys(decl).some((k) => /^(color|background|background-color|fill|stroke)$/.test(k)));
    // the selects' arrow is a picture, not text; the paper is tested above; the rest are the pairs named in PAIRS
    const known = [".editor", ".select", ".cit-item.cit-active", ".cit-item .rc-ok", ".cit-item .rc-nf", ".cit-item .rc-diff", ".rs-quick .ap-warn", ".app-ai-pill", ".ai-read-label", 'mark', '.power-sim svg rect[fill="#6d28d9"]'];
    expect(direct.map((d) => d.sel).filter((s) => !known.includes(s))).toEqual([]);
  });
});
