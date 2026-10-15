import { safeFileName } from "./download";

/** Ported from v1 `_texEsc` (the escape order, including its backslash-first quirk, is v1's). */
function texEsc(s: string | null | undefined): string {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Ported from v1 `_texInline`. Highlights, font/colour spans and AI-provenance spans fall through to plain text; images are not exported. */
function texInline(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += texEsc(n.textContent); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const inner = () => texInline(el);
    if (tag === "b" || tag === "strong") out += "\\textbf{" + inner() + "}";
    else if (tag === "i" || tag === "em") out += "\\textit{" + inner() + "}";
    else if (tag === "u") out += "\\underline{" + inner() + "}";
    else if (tag === "s" || tag === "strike" || tag === "del") out += "\\sout{" + inner() + "}";
    else if (tag === "sup") out += "\\textsuperscript{" + inner() + "}";
    else if (tag === "sub") out += "\\textsubscript{" + inner() + "}";
    else if (tag === "br") out += "\\\\ ";
    else if (tag === "a") out += inner() + "\\footnote{" + texEsc(el.getAttribute("href") || "") + "}";
    else out += inner();
  });
  return out;
}

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "h4", "hr", "blockquote", "ul", "ol", "table", "div", "section", "p"]);

/** This codebase's page break is a `div` (v1 used an `hr`); the sanitiser drops the data attribute, so the class counts too. */
function isPageBreak(el: Element): boolean {
  return el.classList.contains("page-break") || el.hasAttribute("data-page-break");
}

/** Ported from v1 `_texBlock`. */
function texBlock(node: Node, lines: string[]): void {
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join("").trim();
    if (t) lines.push(t);
    buf = [];
  };
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { // bare text directly inside the container
      if ((n.textContent ?? "").trim()) buf.push(texEsc(n.textContent));
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (!BLOCK_TAGS.has(tag)) { // inline element (b, i, span, a, sup, ...) sitting directly in the container
      const wrap = el.ownerDocument.createElement("span");
      wrap.appendChild(el.cloneNode(true));
      buf.push(texInline(wrap));
      return;
    }
    flush();
    if (isPageBreak(el)) { lines.push("\\newpage"); return; }
    if (tag === "p") { const t = texInline(el); if (t.trim()) lines.push(t); }
    else if (tag === "h1") lines.push("\\section{" + texInline(el) + "}");
    else if (tag === "h2") lines.push("\\subsection{" + texInline(el) + "}");
    else if (tag === "h3" || tag === "h4") lines.push("\\subsubsection{" + texInline(el) + "}");
    else if (tag === "hr") lines.push("\\bigskip\\hrule\\bigskip");
    else if (tag === "blockquote") lines.push("\\begin{quote}" + texInline(el) + "\\end{quote}");
    else if (tag === "ul" || tag === "ol") {
      const env = tag === "ul" ? "itemize" : "enumerate";
      lines.push("\\begin{" + env + "}");
      Array.from(el.children).forEach((li) => { if (li.tagName.toLowerCase() === "li") lines.push("\\item " + texInline(li)); });
      lines.push("\\end{" + env + "}");
    } else if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((td) => texInline(td)).join(" & ") + " \\\\");
      const first = el.querySelector("tr");
      const ncols = first ? first.children.length : 1;
      lines.push("\\begin{tabular}{" + Array(ncols).fill("l").join("") + "}");
      rows.forEach((r) => lines.push(r));
      lines.push("\\end{tabular}");
    } else if (tag === "div" || tag === "section") texBlock(el, lines);
  });
  flush();
}

/** v1's LaTeX export: an `article` (12 pt, A4, 1 in margins) that opens in Overleaf; the author line carries the ORCID when set. */
export function toLatex(title: string, bodyHtml: string, orcid?: string): string {
  const lines: string[] = [];
  texBlock(new DOMParser().parseFromString(bodyHtml, "text/html").body, lines);
  const id = (orcid ?? "").trim();
  const authorLine = id ? "Author \\\\ ORCID: " + texEsc(id) : "Author";
  return "\\documentclass[12pt]{article}\n" +
    "\\usepackage[a4paper,margin=1in]{geometry}\n" +
    "\\usepackage[utf8]{inputenc}\n" +
    "\\usepackage{ulem}\n" +
    "\\usepackage{apacite} % switch to a journal-specific citation package if needed\n" +
    "\\title{" + texEsc(title || "Untitled") + "}\n" +
    "\\author{" + authorLine + "}\n" +
    "\\date{\\today}\n" +
    "\\begin{document}\n" +
    "\\maketitle\n\n" +
    lines.join("\n\n") + "\n\n" +
    "\\end{document}\n";
}

export function latexDocument(title: string, bodyHtml: string, orcid?: string): { filename: string; blob: Blob } {
  return { filename: safeFileName(title || "Untitled") + ".tex", blob: new Blob([toLatex(title, bodyHtml, orcid)], { type: "text/x-tex" }) };
}
