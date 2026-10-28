/*
 * The simulator's picture (v1 plRun 9031-9040). Core builds it as an svg string, and core's sanitizeHtml removes every svg, so the string is not put into the page as markup.
 * It is read here and rebuilt from a short list of shapes (the root, rect, line and text) with a short list of attributes whose values must look like numbers, a hex colour
 * or `currentColor`. Anything else (a script, an event handler, a link, a style, an image, a foreignObject, a colour that is a url) is dropped. The picture carries only
 * numbers today; the check is for the day it carries more.
 */

export type SvgNode = { tag: "svg" | "rect" | "line" | "text"; props: Record<string, string>; children: Array<SvgNode | string> };

const NUM = /^-?\d+(?:\.\d+)?$/;
const COLOUR = /^(?:#[0-9a-f]{3,8}|currentColor)$/i;
/** Attribute (as written in the string) → [prop name React draws, accepted value]. */
const ATTRS: Record<SvgNode["tag"], Record<string, [string, RegExp]>> = {
  svg: { viewBox: ["viewBox", /^\d+(?: \d+){3}$/], width: ["width", /^\d+%?$/], role: ["role", /^img$/], "aria-label": ["aria-label", /^[^<>]{0,400}$/] },
  rect: { x: ["x", NUM], y: ["y", NUM], width: ["width", NUM], height: ["height", NUM], fill: ["fill", COLOUR] },
  line: { x1: ["x1", NUM], x2: ["x2", NUM], y1: ["y1", NUM], y2: ["y2", NUM], stroke: ["stroke", COLOUR], "stroke-width": ["strokeWidth", NUM], "stroke-dasharray": ["strokeDasharray", /^\d+(?: \d+)*$/] },
  text: { x: ["x", NUM], y: ["y", NUM], "font-size": ["fontSize", NUM], "text-anchor": ["textAnchor", /^(?:start|middle|end)$/], fill: ["fill", COLOUR] }
};
const TAGS = new Set(["rect", "line", "text"]);

function pick(el: Element, tag: SvgNode["tag"]): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [name, [prop, ok]] of Object.entries(ATTRS[tag])) {
    let v = el.getAttribute(name);
    if (v === null || !ok.test(v)) continue;
    // v1 drew the true-effect line in #111, which disappears on a dark page; the page's own text colour is used instead (register row D-S2-74)
    if (name === "stroke" && v.toLowerCase() === "#111") v = "currentColor";
    props[prop] = v;
  }
  return props;
}

/** The picture as a tree of the permitted shapes, or null when the string is not an svg picture. */
export function parseSimSvg(svg: string): SvgNode | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  const out: SvgNode = { tag: "svg", props: pick(root, "svg"), children: [] };
  for (const el of Array.from(root.children)) {
    if (!TAGS.has(el.localName)) continue;
    const tag = el.localName as "rect" | "line" | "text";
    const node: SvgNode = { tag, props: pick(el, tag), children: [] };
    // a text keeps its own characters only, never an element inside it
    if (tag === "text") node.children.push(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join(""));
    out.children.push(node);
  }
  return out;
}
