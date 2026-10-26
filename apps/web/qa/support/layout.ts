import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { dictionary } from "./dict";
import { matchKnown, type KnownEntry } from "./known";
import { liveKeyForms, redactLiveKey } from "./secrets";

/**
 * The layout, accessibility and Hindi rules of spec section 8, measured in the page at a checkpoint (`qa.checkpoint`, qa.ts). `measureLayout` measures; `planChecks` turns what it
 * found into one visual check per rule. Both are written so that a rule which looked at nothing says so (`measured` 0 is NOT CHECKED, never a pass; Review Focus 2).
 *
 * What each rule counts as `measured`, and so as having looked at:
 *  - sideways-scroll: 1 when the page has anything visible (the page's width was read).
 *  - off-edge:        the visible elements.
 *  - cut-off:         the visible elements that hold text.
 *  - overlap:         the visible, enabled controls, but 0 for fewer than two (a lone control has nothing to collide with).
 *  - small-target:    the controls it measured (on a phone only; 0 otherwise). A link inside a sentence is not measured (WCAG 2.5.8 leaves it out).
 *  - english-in-hindi: the pieces of visible text it read (Hindi only; 0 otherwise).
 *  - axe:             the elements axe examined; 0 when the page has nothing visible to scan.
 *
 * Three readings the page itself gives, never a flag the test passes in: the width is `documentElement.clientWidth` (the layout viewport: on a phone `innerWidth` grows to the
 * width of an overflowing page, so a test against it would never fire); the language is `<html lang>` (the app sets it from the student's setting); a phone is a coarse pointer
 * on a narrow window (the `phone` project: touch, mobile, 375 px).
 */

export type LayoutRule = "sideways-scroll" | "off-edge" | "cut-off" | "overlap" | "small-target" | "english-in-hindi" | "axe";
export const LAYOUT_RULES: readonly LayoutRule[] = ["sideways-scroll", "off-edge", "cut-off", "overlap", "small-target", "english-in-hindi", "axe"];

/** What each rule demands, for the check's label (after the checkpoint's name). */
export const LAYOUT_LABEL: Record<LayoutRule, string> = {
  "sideways-scroll": "no sideways page scroll",
  "off-edge": "nothing past the window's edge",
  "cut-off": "no text cut off inside its box",
  overlap: "no two controls on top of each other",
  "small-target": "every control at least 44 px each way",
  "english-in-hindi": "no English on a Hindi screen",
  axe: "no serious or critical accessibility finding (axe)"
};

/** Why a rule that measured nothing says so. */
const NOTHING_MEASURED: Record<LayoutRule, string> = {
  "sideways-scroll": "the page has nothing visible, so its width was not measured",
  "off-edge": "the page has no visible element to place against the window's edge",
  "cut-off": "the page has no visible element with text to look at",
  overlap: "the page has fewer than two visible, enabled controls, so none could lie on another",
  "small-target": "the page has no visible, enabled control to measure (a link inside a sentence is not measured)",
  "english-in-hindi": "no visible text outside the editor, the form fields and the exempt boxes was found to read",
  axe: "the page has nothing visible, so there was nothing for axe to scan"
};

export type LayoutFinding = { rule: LayoutRule; target: string; detail: string };
export type LayoutMeasure = {
  findings: LayoutFinding[];
  /** How many things each rule looked at (see the list above). A rule that was not asked for, or does not apply here (small-target off a phone, english-in-hindi in English), is 0. */
  measured: Record<LayoutRule, number>;
  /** A rule that could not run because the page moved under it (a navigation during the axe scan), and why: it counts as NOT CHECKED with this reason. */
  unable: Partial<Record<LayoutRule, string>>;
  /** A rule that broke (axe throwing for any other reason): the layer that checks the screen is itself failing, so it is an Error finding, not a quiet gap. */
  errors: Partial<Record<LayoutRule, string>>;
};

// ---- What the register keeps in English, and the names that are English everywhere ---------------------------------------------------------------------

/**
 * Names that stay as they are in Hindi: products, services, bodies and file types. The rule ignores them (they are neither English nor a break in a run of English).
 * The brief's 21 names, and LaTeX (a file type, like PDF and CSV; ruling R20).
 */
export const HINDI_NAMES: readonly string[] = [
  "Appuscholar", "OpenAlex", "PubMed", "Crossref", "CTRI", "ICMR", "APA", "DOI", "PDF", "CSV", "PPT", "AI",
  "Groq", "OpenAI", "ChatGPT", "Gemini", "Claude", "DeepSeek", "OpenRouter", "Google Scholar", "Wiktionary", "LaTeX"
];

/**
 * Test ids that hold only what the student typed (the project's name and question), which the Hindi rule never reads, so that no case has to exempt them: the project's name is in
 * the header of every screen. Found on the first real run of the rule (the header's project switcher, its phone form, the "back to the project" link, the question on the home).
 * A case adds its own boxes with `exempt` (a library list, a transcript).
 */
export const STUDENT_TEXT_IDS: readonly string[] = ["project-switcher", "place-home", "home-project-btn", "home-q-text"];

/**
 * The app's own sentences that stand where the student's text would, inside those boxes: the question's "No question yet." (QuestionCard.tsx), the switcher's "All projects" and
 * "Documents not in a project" (AppHeader.tsx), and the titles it cannot show, "Locked title" and "This title cannot be opened" (lib/vault/titles.ts). A box whose whole text is
 * one of these, in either language, is the app speaking, so it is read like any other text (an exempt box is skipped only for what the student wrote).
 */
const APP_FALLBACK_KEYS = ["place_question_none", "switcher_all", "scratch_name", "title_locked", "title_unreadable"] as const;
function appFallbacks(): string[] {
  const out = new Set<string>();
  for (const lang of ["en", "hi"] as const) for (const key of APP_FALLBACK_KEYS) out.add(plainSentence(dictionary(lang)[key] ?? ""));
  out.delete("");
  return [...out];
}

/** The sentences of the dictionaries under a key prefix whose Hindi is the English text (or is missing): what the register keeps in English until Dr. Sharma gives Hindi. */
function keptEnglish(prefix: string): string[] {
  const en = dictionary("en");
  const hi = dictionary("hi");
  return Object.entries(en)
    .filter(([key, sentence]) => key.startsWith(prefix) && (hi[key] === undefined || hi[key] === sentence))
    .map(([, sentence]) => sentence);
}

/**
 * D-S2-18 (docs/superpowers/specs/parity-deviations.md): the English constants that stage 2 builds in code, with no dictionary key and no Hindi (the stage-2 port's ruling R15,
 * quoted in that row; not this QA ledger's R15): the toasts, status lines and button labels of the files the row names. `{n}` stands for a number or a title the code puts in.
 * (The row names lib/analyse/later.ts; there is no such file in the tree, so nothing comes from it.) test/qa/layout.test.ts imports the modules' exported constants and fails
 * when one is not covered here, so this hand copy cannot fall behind the code.
 */
const D_S2_18_CONSTANTS: readonly string[] = [
  // lib/cite/actions.ts
  "Add author and title first",
  "Citation inserted ✓",
  "Saved to library ✓",
  "Form cleared",
  "Insert {intext}", // insertLabel: a library card's button, "Insert (Smith, 2020)" or "Insert ¹ (3)". (REMOVE_TITLE, "Remove", is a tooltip and an aria-label: not read.)
  // lib/cite/share.ts
  "Library is empty — add a source first",
  "Library exported ✓ — share the file with your class",
  "That file is too large to be a citation library",
  "Could not read that file — it must be a library JSON exported from Appuscholar",
  "Starter library already loaded ✓",
  "{n} sources merged into your library ✓",
  "{n} classic psychology sources added ✓",
  // lib/cite/quote.ts
  "Paste the quote text first",
  "🔎 Translating quote…",
  "Quote translated and inserted, flagged ✓ — hover it to see the original",
  "Quote inserted ✓",
  "Something went wrong. Try again.",
  // lib/cite/capture.ts
  "Could not read that captured citation",
  'Captured "{title}" into your citation library ✓',
  // lib/research/oaKey.ts: its three toasts are dictionary sentences with Hindi now (settings_key_*), not constants.
  // lib/shelf/useShelf.ts
  "Columns can be changed only in the writing window.",
  // lib/analyse/ask.ts: "Something went wrong. Try again." (above)
  // lib/ai/actions.ts
  "Select the text you want to improve first",
  "Select the text you want to expand first",
  "Suggestion ready — press Tab in the editor to accept",
  "Ready — press Tab to replace your selection",
  "Describe your working idea first",
  "💜 Thinking this through…",
  "💜 Thinking…",
  "Write or select some text first, then tap the tool",
  "Long document — analyzing the first 12,000 characters. Select a section for a sharper answer."
];

/**
 * The English sentences the register keeps in Hindi (spec section 8: "the register's listed exceptions"). A piece of text that is, whole, one of these sentences is the register's
 * and not English left by mistake; the same words inside a longer text, or beside a word that is not the register's, are not excused. One group per register row:
 *  - D-S2-1:  the `rs2_*` keys (Research panel): the Hindi value is the English text.
 *  - D-S2-2:  the `ap2_*` keys (Analyse a paper panel): the Hindi value is the English text.
 *  - D-S2-3:  the `sh2_*` keys (Reading shelf dialog): the Hindi value is the English text.
 *  - D-S2-18: the English constants that the action modules build (above).
 * The three key groups are read from the dictionaries, not copied: a key that gets a Hindi value stops being an exception by itself, as the register's own text says it will.
 */
export const HINDI_EXCEPTIONS: readonly string[] = [...keptEnglish("rs2_"), ...keptEnglish("ap2_"), ...keptEnglish("sh2_"), ...D_S2_18_CONSTANTS];

/** What the page would show of a dictionary sentence: tags removed, entities decoded, white space collapsed. */
function plainSentence(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/;

/** What `exceptionMatcher` makes of the register: whole texts, and patterns for the texts that have a `{name}` in them. */
export type ExceptionMatcher = { exact: string[]; patterns: string[] };

/**
 * The register's sentences as something to compare a whole piece of the page's text with (ruling R20: a piece whose whole text is an exception is excused, wherever else the same
 * words stand in a longer sentence they are not). A sentence with a tag in it is also taken apart at the tags, because the page shows it as several pieces
 * (`<b>Check yourself.</b> Each ...`). A `{name}` stands for whatever the code put there. A text with no Latin letter outside its placeholders is not English and is left out; a
 * one-word sentence is kept (the shelf's "Papers" and "Search" are two).
 */
export function exceptionMatcher(sentences: readonly string[]): ExceptionMatcher {
  const exact = new Set<string>();
  const patterns = new Set<string>();
  for (const sentence of sentences) {
    const texts = new Set([plainSentence(sentence)]);
    if (/<[^>]*>/.test(sentence)) for (const part of sentence.split(/<[^>]*>/)) texts.add(plainSentence(part));
    for (const text of texts) {
      const literal = text.split(PLACEHOLDER).join(" ");
      if (!/\p{Script=Latin}/u.test(literal)) continue;
      if (!PLACEHOLDER.test(text)) exact.add(text);
      else patterns.add("^" + text.split(PLACEHOLDER).map((p) => escapeRe(p).replace(/\s+/g, "\\s+")).join(".{0,200}?") + "$");
    }
  }
  return { exact: [...exact], patterns: [...patterns] };
}

/** Whether a whole piece of text is one the matcher excuses (what the page does with each piece, in `inPage`). */
export function isExcused(text: string, m: ExceptionMatcher): boolean {
  return m.exact.includes(text) || m.patterns.some((p) => new RegExp(p).test(text));
}

let register: ExceptionMatcher | undefined;
const registerMatcher = () => (register ??= exceptionMatcher(HINDI_EXCEPTIONS));

const namesSource = (): string => {
  const names = [...HINDI_NAMES].sort((a, b) => b.length - a.length).map((n) => escapeRe(n).replace(/\s+/g, "\\s+"));
  return `(?<![A-Za-z])(?:${names.join("|")})(?:'s|’s|s)?(?![A-Za-z])`;
};

// ---- Measuring ----------------------------------------------------------------------------------------------------------------------------------------

type InPageArgs = {
  rules: LayoutRule[];
  phone: boolean;
  lang: "en" | "hi";
  /** A CSS selector for the boxes the Hindi rule does not read: the editor and the exempt test ids. */
  skipSelector: string;
  namesSrc: string;
  /** The register's texts (see `exceptionMatcher`), and the app's own fallback sentences that an exempt box may hold. */
  exact: string[];
  patterns: string[];
  fallbacks: string[];
  /** The forms of the live-AI key (secrets.ts): taken out of any text of the page before it is cut to a name or a sample. */
  secrets: string[];
};
type InPageResult = { findings: LayoutFinding[]; measured: Record<LayoutRule, number>; visible: number };

/**
 * Runs in the page (Playwright serialises it: it uses nothing from this file). Every rule except axe.
 * Visible: it has a box wider and taller than 1 px (so a clipped 1 px "screen reader only" box is not one) and `checkVisibility` says it is shown (not display:none, not
 * visibility:hidden, not opacity:0). A control is also enabled (not disabled, not aria-disabled), not inert or aria-hidden (what a modal dialog does to the page behind it), and not
 * covered at its centre by a layer: something that is not a control and is inside an open modal (aria-modal, dialog[open]) or in a fixed box as wide as the window (a backdrop,
 * a header scrolled under). A plain box over a control's centre (a group's padding) does not take the control out: the collision it makes with another control is still one.
 */
async function inPage(a: InPageArgs): Promise<InPageResult> {
  type Box = { el: Element; r: DOMRect };
  const want = new Set<string>(a.rules);
  const findings: LayoutFinding[] = [];
  const measured = { "sideways-scroll": 0, "off-edge": 0, "cut-off": 0, overlap: 0, "small-target": 0, "english-in-hindi": 0, axe: 0 } as Record<LayoutRule, number>;
  const found = (rule: LayoutRule, target: string, detail: string) => void findings.push({ rule, target, detail });
  const doc = document.documentElement;
  const SHOWN = { checkOpacity: true, checkVisibilityCSS: true };

  // A dialog opening or a menu sliding in is still moving, and a box measured mid-move is not where it stops: wait for the animations that end (not a spinner that never does).
  const moving = document.getAnimations().filter((x) => {
    const end = x.effect?.getComputedTiming().endTime;
    return x.playState === "running" && typeof end === "number" && Number.isFinite(end);
  });
  if (moving.length) await Promise.race([Promise.allSettled(moving.map((x) => x.finished)), new Promise((resolve) => setTimeout(resolve, 1000))]);

  const W = doc.clientWidth || window.innerWidth;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element): CSSStyleDeclaration => {
    let s = styles.get(el);
    if (!s) styles.set(el, (s = getComputedStyle(el)));
    return s;
  };
  /** The text without the secrets (the page can show a key), before it is cut: cut first and a prefix of the key would stay. */
  const scrub = (s: string) => a.secrets.reduce((t, f) => t.split(f).join("[redacted]"), s);
  const shorten = (s: string, n: number) => {
    const t = scrub(s);
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  };
  const round1 = (n: number) => String(Math.round(n * 10) / 10);
  /** The element as a person would name it, and where the test ids can find it: `button "Insert image" [fmt-image]`. */
  const label = (el: Element): string => {
    const own = el.getAttribute("data-testid");
    const holder = own ? el : el.closest("[data-testid]");
    const id = holder ? holder.getAttribute("data-testid") : null;
    const raw = el.getAttribute("aria-label") || scrub(el.textContent ?? "").slice(0, 200) || el.getAttribute("title") || el.getAttribute("placeholder") || "";
    const name = shorten(raw.replace(/\s+/g, " ").trim(), 40);
    return el.localName + (name ? ` "${name}"` : "") + (id ? (own ? ` [${id}]` : ` in [${id}]`) : "");
  };

  // The visible elements, in document order.
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "TITLE", "BR", "WBR", "OPTION", "OPTGROUP", "DATALIST", "SOURCE", "TRACK", "AREA", "MAP", "COL", "COLGROUP"]);
  const SVG = "http://www.w3.org/2000/svg";
  const shown: Box[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (SKIP.has(el.tagName) || (el.namespaceURI === SVG && el.localName !== "svg")) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || !el.checkVisibility(SHOWN)) continue;
    shown.push({ el, r });
  }

  // Sideways scroll: the page is wider than the window.
  if (want.has("sideways-scroll") && shown.length) {
    measured["sideways-scroll"] = 1;
    if (doc.scrollWidth > W + 1) found("sideways-scroll", "page", `the page is ${doc.scrollWidth} px wide in a ${W} px window`);
  }

  // Off the edge: a box that reaches past the window's right edge, or starts before its left edge and ends inside it (a box wholly to the left is hidden off screen on purpose),
  // unless an ancestor clips or scrolls it. Only the outermost such element is named, not each of its children.
  if (want.has("off-edge")) {
    measured["off-edge"] = shown.length;
    const contained = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) if (style(p).overflowX !== "visible") return true;
      return false;
    };
    const past = new Map<Element, DOMRect>();
    for (const { el, r } of shown) if ((r.right > W + 1 || (r.left < -1 && r.right > 0)) && !contained(el)) past.set(el, r);
    for (const [el, r] of past) {
      let inside = false;
      for (let p = el.parentElement; p && !inside; p = p.parentElement) inside = past.has(p);
      if (!inside) found("off-edge", label(el), r.right > W + 1 ? `reaches ${round1(r.right)} px in a ${W} px window` : `starts at ${round1(r.left)} px`);
    }
  }

  // Cut off: a box that hides its overflow (hidden or clip) and holds more than it shows, unless it ends in an ellipsis or is clamped to a number of lines on purpose.
  if (want.has("cut-off")) {
    for (const { el } of shown) {
      if (Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? "").trim())) measured["cut-off"]++;
      const s = style(el);
      const hides = (overflow: string) => overflow === "hidden" || overflow === "clip";
      if (!hides(s.overflowX) && !hides(s.overflowY)) continue;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.clientWidth === 0 || el.clientHeight === 0) continue;
      if (s.textOverflow === "ellipsis" || (s.getPropertyValue("-webkit-line-clamp") || "none") !== "none") continue;
      if (!(el.textContent ?? "").trim()) continue;
      // Only the axis that hides its overflow can cut something off: a box that scrolls down is not cut off at the bottom.
      const over = (hides(s.overflowX) && el.scrollWidth - el.clientWidth > 1) || (hides(s.overflowY) && el.scrollHeight - el.clientHeight > 1);
      if (over) found("cut-off", label(el), `holds ${el.scrollWidth} × ${el.scrollHeight} px in a ${el.clientWidth} × ${el.clientHeight} px box`);
    }
  }

  // Controls: what a person presses or types into.
  const CONTROL =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"], [role="slider"], [role="treeitem"]';
  const controls: Box[] = [];
  if (want.has("overlap") || want.has("small-target")) {
    const layer = (top: Element): boolean => {
      if (top.closest('[aria-modal="true"], dialog[open]')) return true;
      for (let p: Element | null = top; p && p !== document.body; p = p.parentElement) if (style(p).position === "fixed" && p.getBoundingClientRect().width >= W - 1) return true;
      return false;
    };
    for (const box of shown) {
      const { el, r } = box;
      if (!el.matches(CONTROL) || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" || el.closest("[inert], [aria-hidden='true']")) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x >= 0 && y >= 0 && x < W && y < window.innerHeight) {
        const top = document.elementFromPoint(x, y);
        if (top && !el.contains(top) && !top.contains(el) && !top.closest(CONTROL) && layer(top)) continue;
      }
      controls.push(box);
    }
  }

  /**
   * An absolutely placed control inside a text field, in the room the field keeps for it (the eye of a password field, `absolute inset-y-0 right-0 w-11` over `pr-11`): the field's box holds it,
   * but nothing that is typed goes under it. Keyed on the field's computed padding, not on what it asked for: the padding on the control's side (the side of the field its centre is on) must be at
   * least the control's width, and the control must lie in that padding. A field that asks for the room and does not get it (a padding of 10 px under a 44 px control) is still a collision.
   */
  const NO_TEXT_TO_COVER = /^(checkbox|radio|range|file|button|submit|reset|image|color|hidden)$/;
  const heldInPadding = (field: Box, control: Box): boolean => {
    const el = field.el;
    if (!(el.matches("textarea") || (el.matches("input") && !NO_TEXT_TO_COVER.test((el as HTMLInputElement).type)))) return false;
    if (style(control.el).position !== "absolute") return false;
    const f = field.r;
    const c = control.r;
    if (c.left < f.left - 1 || c.right > f.right + 1 || c.top < f.top - 1 || c.bottom > f.bottom + 1) return false;
    const s = style(el);
    const px = (property: string) => parseFloat(s.getPropertyValue(property)) || 0;
    if (c.left + c.width / 2 > f.left + f.width / 2) {
      const room = px("padding-right");
      return room >= c.width - 0.5 && c.left >= f.right - px("border-right-width") - room - 1;
    }
    const room = px("padding-left");
    return room >= c.width - 0.5 && c.right <= f.left + px("border-left-width") + room + 1;
  };

  // Overlap: two controls whose boxes cross by more than 4 px both ways. A control inside another is nesting, not a collision.
  if (want.has("overlap") && controls.length >= 2) {
    measured.overlap = controls.length;
    const byLeft = [...controls].sort((p, q) => p.r.left - q.r.left);
    for (let i = 0; i < byLeft.length; i++) {
      const A = byLeft[i]!;
      for (let j = i + 1; j < byLeft.length; j++) {
        const B = byLeft[j]!;
        if (B.r.left >= A.r.right - 4) break; // sorted by left edge: no later control starts inside A by more than 4 px
        const across = Math.min(A.r.right, B.r.right) - B.r.left;
        const down = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (across > 4 && down > 4 && !A.el.contains(B.el) && !B.el.contains(A.el) && !heldInPadding(A, B) && !heldInPadding(B, A)) {
          found("overlap", `${label(A.el)} over ${label(B.el)}`, `they cross by ${round1(across)} × ${round1(down)} px`);
        }
      }
    }
  }

  // Small target: on a phone, a control under 44 px either way. A checkbox or radio is pressed through its label, so the larger of the two is its target.
  if (want.has("small-target") && a.phone) {
    for (const { el, r } of controls) {
      const sentence = el.localName === "a" && style(el).display === "inline" && Array.from(el.parentElement?.childNodes ?? []).some((n) => n !== el && n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? "").trim());
      if (sentence) continue;
      measured["small-target"]++;
      let box = r;
      const labels = (el as HTMLInputElement).labels;
      if (labels && /^(checkbox|radio|switch)$/.test(el.getAttribute("role") ?? (el as HTMLInputElement).type ?? "")) {
        for (const l of Array.from(labels)) {
          const lr = l.getBoundingClientRect();
          if (lr.width * lr.height > box.width * box.height) box = lr;
        }
      }
      if (box.width + 0.5 < 44 || box.height + 0.5 < 44) found("small-target", label(el), `${round1(box.width)} × ${round1(box.height)} px`);
    }
  }

  // English in Hindi: the visible text, in the order of the page, read as one stream (so a toolbar of buttons that each hold one English word is one run: O9). A run is Latin
  // words next to each other, short ones included; it is English left on the screen when it holds two or more words of three or more letters (ruling R20). A number or a word in
  // another script ends a run; so does a piece that is, whole, a sentence of the register (excused piece by piece), and so does a box that is not read: the editor and the exempt
  // boxes (the student's own text), what was typed into a field, a part of the page in another language (`lang` set and not Hindi). Not read, and no break in the run: scripts
  // and styles and the other tags of SKIP, and drawings (svg: an icon beside a word does not split the buttons around it, and the text inside a chart is the chart's).
  // Read besides the text: an empty field's placeholder, the label a select shows, a button-type input's value (the app's words).
  if (want.has("english-in-hindi") && a.lang === "hi") {
    const hostShown = new Map<Element, boolean>();
    const hostOf = (el: Element): Element | null => {
      let host: Element | null = el;
      while (host && style(host).display === "contents") host = host.parentElement;
      if (!host) return null;
      let ok = hostShown.get(host);
      if (ok === undefined) {
        const r = host.getBoundingClientRect();
        hostShown.set(host, (ok = r.width > 1 && r.height > 1 && host.checkVisibility(SHOWN)));
      }
      return ok ? host : null;
    };
    const NOT_TEXT_FIELD = /^(checkbox|radio|range|color|file|hidden|image)$/;
    const BREAK = "\u0001";
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    const fallbacks = new Set(a.fallbacks);
    const pieces: Array<{ text: string; el: Element }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
        const el = node as Element;
        // A drawing (an icon, a chart) is not read and is no break in the run: <button><svg/>Edit</button><button><svg/>Share</button> are two words side by side (O9).
        const drawing = el.namespaceURI === SVG;
        let skip = SKIP.has(el.tagName) || drawing;
        if (!skip && el.matches(a.skipSelector)) {
          // The editor and the exempt boxes are the student's, unless the app is speaking in one (the sentence it shows where the student's text is missing).
          skip = el.matches(".ProseMirror") || !fallbacks.has(norm(el.textContent ?? ""));
        }
        // Another language is not Hindi's to answer for (the language switch names the other one in itself).
        const lang = el.getAttribute("lang");
        if (!skip && lang && !/^hi(-|$)/i.test(lang)) skip = true;
        // The words either side of a box that is not read (the student's own text, another language) are not one run: a mark in the stream stands for it. The tags in SKIP
        // (scripts, styles and the like) and drawings push none.
        if (skip && !SKIP.has(el.tagName) && !drawing) pieces.push({ text: BREAK, el });
        return skip ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = "";
      let host: Element | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent || parent.tagName === "TEXTAREA") continue;
        text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
        host = text ? hostOf(parent) : null;
      } else {
        const el = node as Element;
        if (el.tagName === "SELECT") text = (el as HTMLSelectElement).selectedOptions[0]?.label ?? "";
        else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          const f = el as HTMLInputElement;
          const type = el.tagName === "INPUT" ? f.type : "text";
          if (/^(button|submit|reset)$/.test(type)) text = f.value;
          else if (NOT_TEXT_FIELD.test(type)) text = "";
          else text = f.value ? BREAK : f.placeholder; // what was typed is the student's: not read, and a break in a run
        }
        text = text.replace(/\s+/g, " ").trim();
        host = text ? hostOf(el) : null;
      }
      if (host) pieces.push({ text, el: host });
    }
    measured["english-in-hindi"] = pieces.filter((p) => /\p{L}/u.test(p.text)).length;

    // A piece that is, whole, a sentence of the register is the register's (a break in the run, whatever stands beside it); the same words inside a longer text are not.
    const exact = new Set(a.exact);
    const patterns = a.patterns.map((src) => new RegExp(src));
    for (const p of pieces) if (p.text !== BREAK && (exact.has(p.text) || patterns.some((re) => re.test(p.text)))) p.text = BREAK;

    const starts: number[] = [];
    let original = "";
    for (const p of pieces) {
      starts.push(original.length);
      original += p.text + " ";
    }
    // The names are removed as if they were not there (same length, so a finding can quote the page's own words).
    const stream = original.replace(new RegExp(a.namesSrc, "g"), (m) => " ".repeat(m.length));

    const NUMBER = /\p{N}/u;
    const LETTER = /\p{L}/u;
    const LATIN = /\p{Script=Latin}/u;
    /** -1: breaks a run (a Hindi word, a number, a register sentence); 0: punctuation, no letters, joins nothing and breaks nothing; otherwise the count of Latin letters. */
    const lettersOf = (chunk: string): number => {
      if (chunk.includes("\u0001")) return -1;
      let n = 0;
      for (const ch of chunk) {
        if (NUMBER.test(ch)) return -1;
        if (LETTER.test(ch)) {
          if (!LATIN.test(ch)) return -1;
          n++;
        }
      }
      return n;
    };
    let run: { from: number; to: number } | undefined;
    let words = 0;
    const end = () => {
      if (run && words >= 2) {
        let i = starts.length - 1;
        while (i > 0 && starts[i]! > run.from) i--;
        found("english-in-hindi", label(pieces[i]!.el), shorten(original.slice(run.from, run.to).replace(/\s+/g, " ").trim(), 100));
      }
      run = undefined;
      words = 0;
    };
    const chunkRe = /\S+/g;
    for (let m = chunkRe.exec(stream); m; m = chunkRe.exec(stream)) {
      const n = lettersOf(m[0]);
      if (n === 0) continue;
      if (n < 0) {
        end();
        continue;
      }
      // A word of one or two letters joins the run without counting ("Add to library" is English: Add, library).
      run = { from: run ? run.from : m.index, to: m.index + m[0].length };
      if (n >= 3) words++;
    }
    end();
  }

  return { findings, measured, visible: shown.length };
}

/** axe's serious and critical findings, and how many elements it examined. */
async function scan(page: Page): Promise<{ findings: LayoutFinding[]; examined: number }> {
  const results = await new AxeBuilder({ page }).analyze();
  const selector = (target: ReadonlyArray<string | string[]>) => redactLiveKey(target.map((t) => (Array.isArray(t) ? t.join(" ") : t)).join(" "));
  const examined = new Set<string>();
  for (const group of [results.passes, results.violations, results.incomplete]) for (const r of group) for (const n of r.nodes) examined.add(selector(n.target));
  const findings: LayoutFinding[] = [];
  for (const v of results.violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    for (const n of v.nodes) findings.push({ rule: "axe", target: selector(n.target), detail: `${v.id} (${v.impact}): ${v.help}` });
  }
  return { findings, examined: examined.size };
}

/**
 * Measures the screen as it stands. `rules`: the rules to run (all by default). `phone` is whether the touch-target rule applies and `lang` whether the Hindi rule does;
 * `exempt` are test ids whose boxes the Hindi rule does not read (the student's own text: a library list, a transcript), besides STUDENT_TEXT_IDS and the editor. The page is not changed.
 */
export async function measureLayout(
  page: Page,
  o: { phone: boolean; lang: "en" | "hi"; exempt?: string[]; rules?: readonly LayoutRule[] }
): Promise<LayoutMeasure> {
  const rules = [...(o.rules ?? LAYOUT_RULES)];
  const skipSelector = [".ProseMirror", ...[...STUDENT_TEXT_IDS, ...(o.exempt ?? [])].map((id) => `[data-testid="${id.replace(/["\\]/g, "\\$&")}"]`)].join(", ");
  const args: InPageArgs = { rules, phone: o.phone, lang: o.lang, skipSelector, namesSrc: namesSource(), exact: registerMatcher().exact, patterns: registerMatcher().patterns, fallbacks: appFallbacks(), secrets: liveKeyForms() };
  const inside = await page.evaluate(inPage, args);
  const measured = inside.measured;
  const findings = [...inside.findings];
  const unable: LayoutMeasure["unable"] = {};
  const errors: LayoutMeasure["errors"] = {};
  if (rules.includes("axe") && inside.visible > 0) {
    try {
      const axe = await scan(page);
      measured.axe = axe.examined;
      findings.push(...axe.findings);
    } catch (e) {
      const why = `axe could not run: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
      if (movedUnderTheScan(e)) unable.axe = why + " (the page navigated during the scan)";
      else errors.axe = why;
    }
  }
  return { findings, measured, unable, errors };
}

/** Playwright's words for a page that went somewhere else while a script ran in it. */
export function movedUnderTheScan(e: unknown): boolean {
  return /execution context was destroyed|frame was detached|navigat/i.test(e instanceof Error ? e.message : String(e));
}

/** What the page says it is: its language (<html lang>), and whether it is a phone (a coarse pointer on a narrow window: the `phone` project). */
export async function readScreen(page: Page): Promise<{ htmlLang: string; lang: "en" | "hi"; phone: boolean; coarse: boolean; width: number }> {
  const s = await page.evaluate(() => {
    const width = document.documentElement.clientWidth || window.innerWidth;
    const coarse = matchMedia("(pointer: coarse)").matches;
    return { htmlLang: document.documentElement.lang, coarse, width, phone: coarse && width <= 600 };
  });
  return { ...s, lang: s.htmlLang.toLowerCase().split("-")[0] === "hi" ? "hi" : "en" };
}

// ---- Checks -------------------------------------------------------------------------------------------------------------------------------------------

/** One visual check to record: it holds, it measured nothing, or it found something (`known`: the id of the known fault the finding is). */
export type RulePlan = { rule: LayoutRule; label: string; known?: string; outcome: { pass: true } | { notChecked: string } | { fail: string } | { error: string } };

const SHOWN_FINDINGS = 8;

/**
 * One visual check per rule asked for (`rules`), in the order of LAYOUT_RULES. A rule that broke is an Error finding; a rule that measured nothing is NOT CHECKED with the reason; a rule that found nothing passes; one that
 * found something fails as UI, once for the findings no known fault explains and once for each known fault they fit (`matchKnown` on the rule and on "<target> <detail>"), so a known
 * fault keeps CI green and a new one does not.
 */
export function planChecks(m: LayoutMeasure, o: { name: string; rules: readonly LayoutRule[]; known: readonly KnownEntry[] }): RulePlan[] {
  const plans: RulePlan[] = [];
  for (const rule of LAYOUT_RULES) {
    if (!o.rules.includes(rule)) continue;
    const label = `${o.name}: ${LAYOUT_LABEL[rule]}`;
    const broke = m.errors[rule];
    if (broke !== undefined) {
      plans.push({ rule, label, outcome: { error: broke } });
      continue;
    }
    const unable = m.unable[rule];
    if (unable !== undefined) {
      plans.push({ rule, label, outcome: { notChecked: unable } });
      continue;
    }
    if (m.measured[rule] === 0) {
      plans.push({ rule, label, outcome: { notChecked: NOTHING_MEASURED[rule] } });
      continue;
    }
    const mine = m.findings.filter((f) => f.rule === rule);
    if (mine.length === 0) {
      plans.push({ rule, label, outcome: { pass: true } });
      continue;
    }
    const groups = new Map<string, LayoutFinding[]>();
    for (const f of mine) {
      const id = matchKnown({ rule, text: `${f.target} ${f.detail}` }, [...o.known])?.id ?? "";
      groups.set(id, [...(groups.get(id) ?? []), f]);
    }
    const ids = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));
    for (const id of ids) {
      const fs = groups.get(id)!;
      const lines = fs.slice(0, SHOWN_FINDINGS).map((f) => `- ${f.target}: ${f.detail}`);
      if (fs.length > SHOWN_FINDINGS) lines.push(`- and ${fs.length - SHOWN_FINDINGS} more`);
      plans.push({ rule, label, ...(id ? { known: id } : {}), outcome: { fail: `${fs.length} found:\n${lines.join("\n")}` } });
    }
  }
  return plans;
}
