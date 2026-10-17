/** Port of v1 provHash (index.html:3402), provCountDoc (3407) and computeOriginality (3346), without a DOM. */
export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };

/** djb2 over whitespace-stripped text, base36 (v1 provHash). */
export function provHash(s: string): string {
  const t = String(s || "").replace(/\s+/g, "");
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const VOID = new Set(["br", "hr", "img", "input", "wbr", "meta", "link", "area", "base", "col", "embed", "source", "track"]);

function decode(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

type Frame = { depth: number; h: string | null; text: string };
type Visit = { text(t: string, inAi: boolean): void; passage(f: Frame): void };

/** Walks the HTML as a token stream. A frame is any element whose class list has `ai-ins`. */
function walk(html: string, v: Visit): void {
  const src = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  // The attribute part takes a "…" run whole, so a ">" inside a quoted value does not end the tag (v1 reads the DOM, which does not either).
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^">])*)>|[^<]+/g;
  const stack: string[] = [];
  const frames: Frame[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[2] === undefined) {
      const t = decode(m[0]);
      for (const f of frames) f.text += t;
      v.text(t, frames.length > 0);
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (!closing) {
      if (VOID.has(name) || /\/\s*$/.test(attrs)) continue;
      stack.push(name);
      const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs) || /class\s*=\s*'([^']*)'/i.exec(attrs);
      const cv = cls ? cls[1] ?? "" : "";
      if (cv.split(/\s+/).includes("ai-ins")) {
        const h = /data-h\s*=\s*"([^"]*)"/i.exec(attrs) || /data-h\s*=\s*'([^']*)'/i.exec(attrs);
        frames.push({ depth: stack.length, h: (h && h[1]) || null, text: "" });
      }
    } else {
      const at = stack.lastIndexOf(name);
      if (at < 0) continue;
      stack.length = at;
      while (frames.length && (frames[frames.length - 1] as Frame).depth > stack.length) v.passage(frames.pop() as Frame);
    }
  }
  while (frames.length) v.passage(frames.pop() as Frame);
}

/** Words inside span.ai-ins vs outside; kept/edited/unknown by data-h (v1 provCountDoc). */
export function originCount(html: string): OriginStats {
  let typed = 0, ai = 0, kept = 0, edited = 0, unknown = 0;
  walk(html, {
    text(t, inAi) {
      const c = (t.match(/\S+/g) || []).length;
      if (inAi) ai += c; else typed += c;
    },
    passage(f) {
      if (!f.h) unknown++;
      else if (provHash(f.text) === f.h) kept++;
      else edited++;
    }
  });
  return { typed, ai, passages: kept + edited + unknown, kept, edited, unknown };
}

/** Character share for the badge (v1 computeOriginality). */
export function originShare(html: string): { total: number; ai: number; studentPct: number } {
  let total = 0, ai = 0;
  walk(html, {
    text(t, inAi) { total += t.length; if (inAi) ai += t.length; },
    passage() {}
  });
  return { total, ai, studentPct: total ? Math.round(100 * (total - ai) / total) : 100 };
}
