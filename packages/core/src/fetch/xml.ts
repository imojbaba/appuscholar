/* A small XML reader for PubMed's efetch answer. v1 reads it with the browser's DOMParser (`parseFromString(text,'text/xml')`, rsPubmedAbstracts 8093) and
   three selectors, `PubmedArticle`, `MedlineCitation > PMID` and `Abstract > AbstractText`, then getAttribute('Label') and textContent. core has no DOM, so
   this reader builds the element tree and gives the same three things: elements in document order (xmlAll), attributes, and textContent (xmlText: every
   text and CDATA section below the element, in order). It reads what PubMed sends: the XML declaration, a DOCTYPE, comments, processing instructions,
   CDATA, the five predefined entities and character references. It throws where an XML parser stops (a tag closed out of order, an unclosed element,
   an unknown entity or a bare `&`, an unquoted attribute), which v1's try (8090-8101) turns into no abstracts, as DOMParser's parsererror document does
   (it holds no PubmedArticle). Register D-S2-5. */

export type XmlEl = { name: string; attrs: Record<string, string>; kids: Array<XmlEl | string>; parent: XmlEl | null };

const ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&([^;&\s]*);?/g, (m, name: string) => {
    if (!m.endsWith(";")) throw new Error("xml: a bare & in text");
    if (name in ENT) return ENT[name]!;
    const n = /^#x([0-9a-fA-F]+)$/.exec(name) ? parseInt(name.slice(2), 16) : /^#([0-9]+)$/.test(name) ? parseInt(name.slice(1), 10) : NaN;
    if (Number.isNaN(n)) throw new Error(`xml: unknown entity &${name};`);
    return String.fromCodePoint(n);
  });
}

function skipTo(src: string, from: number, end: string): number {
  const at = src.indexOf(end, from);
  if (at < 0) throw new Error(`xml: no ${end}`);
  return at + end.length;
}

/** The document: a root named "#document" whose kids are the top-level elements. */
export function xmlParse(src: string): XmlEl {
  const doc: XmlEl = { name: "#document", attrs: {}, kids: [], parent: null };
  let cur = doc, i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const text = src.slice(i, lt < 0 ? src.length : lt);
    if (text) {
      const t = decode(text);
      if (cur !== doc) cur.kids.push(t);
      else if (t.trim()) throw new Error("xml: text outside the root element");
    }
    if (lt < 0) break;
    if (src.startsWith("<?", lt)) i = skipTo(src, lt, "?>");
    else if (src.startsWith("<!--", lt)) i = skipTo(src, lt, "-->");
    else if (src.startsWith("<![CDATA[", lt)) {
      const end = skipTo(src, lt, "]]>");
      if (cur === doc) throw new Error("xml: CDATA outside the root element");
      cur.kids.push(src.slice(lt + 9, end - 3));
      i = end;
    } else if (src.startsWith("<!DOCTYPE", lt)) {
      let j = lt + 9, q = "", depth = 0;
      for (; j < src.length; j++) {
        const c = src[j]!;
        if (q) { if (c === q) q = ""; }
        else if (c === '"' || c === "'") q = c;
        else if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth === 0) break;
      }
      if (j >= src.length) throw new Error("xml: unclosed DOCTYPE");
      i = j + 1;
    } else if (src[lt + 1] === "/") {
      const m = /^<\/([^\s>]+)\s*>/.exec(src.slice(lt));
      if (!m || cur === doc || m[1] !== cur.name) throw new Error(`xml: unexpected </${m ? m[1] : "?"}>`);
      cur = cur.parent!;
      i = lt + m[0].length;
    } else {
      const m = /^<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(lt));
      if (!m) throw new Error("xml: a malformed tag");
      const el: XmlEl = { name: m[1]!, attrs: {}, kids: [], parent: cur };
      for (const a of m[2]!.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1]!] = decode(a[2] ?? a[3] ?? "");
      if (cur === doc && doc.kids.length) throw new Error("xml: a second root element");
      cur.kids.push(el);
      if (!m[3]) cur = el;
      i = lt + m[0].length;
    }
  }
  if (cur !== doc) throw new Error(`xml: <${cur.name}> is not closed`);
  if (!doc.kids.length) throw new Error("xml: no root element");
  return doc;
}

/** The elements below `root` (not `root` itself) for which `test` holds, in document order, as querySelectorAll lists them. */
export function xmlAll(root: XmlEl, test: (el: XmlEl) => boolean): XmlEl[] {
  const out: XmlEl[] = [];
  const walk = (el: XmlEl) => { for (const k of el.kids) if (typeof k !== "string") { if (test(k)) out.push(k); walk(k); } };
  walk(root);
  return out;
}

/** textContent: the text of every text and CDATA node below `el`, in document order. */
export function xmlText(el: XmlEl): string {
  return el.kids.map((k) => (typeof k === "string" ? k : xmlText(k))).join("");
}
