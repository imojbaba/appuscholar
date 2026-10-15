// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { latexDocument, toLatex } from "../lib/export/latex";

const body = `<h1>Intro</h1><p>Mean was <b>12%</b> &amp; <i>rising</i> <u>u</u> <s>s</s> x<sup>2</sup> H<sub>2</sub>O.</p><h2>Sub</h2><ul><li>a</li><li>b</li></ul><blockquote>q</blockquote><table><tr><th>h1</th><th>h2</th></tr><tr><td>1</td><td>2</td></tr></table><p><a href="https://x.org">link</a></p><div data-page-break></div><p>#$%&_{}~^\\</p><img src="data:image/png;base64,AA">`;

describe("toLatex", () => {
  it("matches v1's LaTeX mapping", () => {
    const tex = toLatex("My Thesis", body, "0000-0001-2345-6789");
    expect(tex).toContain("\\documentclass[12pt]{article}\n\\usepackage[a4paper,margin=1in]{geometry}\n\\usepackage[utf8]{inputenc}\n\\usepackage{ulem}\n\\usepackage{apacite}");
    expect(tex).toContain("\\title{My Thesis}\n\\author{Author \\\\ ORCID: 0000-0001-2345-6789}");
    expect(tex).toContain("\\section{Intro}");
    expect(tex).toContain("Mean was \\textbf{12\\%} \\& \\textit{rising} \\underline{u} \\sout{s} x\\textsuperscript{2} H\\textsubscript{2}O.");
    expect(tex).toContain("\\subsection{Sub}");
    // v1 pushes every line of an environment as its own block and joins blocks with a blank line.
    expect(tex).toContain("\\begin{itemize}\n\n\\item a\n\n\\item b\n\n\\end{itemize}");
    expect(tex).toContain("\\begin{quote}q\\end{quote}");
    expect(tex).toContain("\\begin{tabular}{ll}\n\nh1 & h2 \\\\\n\n1 & 2 \\\\\n\n\\end{tabular}");
    expect(tex).toContain("link\\footnote{https://x.org}");
    expect(tex).toContain("\\newpage");
    expect(tex).toContain("\\#\\$\\%\\&\\_\\{\\}\\textasciitilde{}\\textasciicircum{}\\textbackslash{}");
    expect(tex).not.toContain("base64");
  });
  it("author line without ORCID is plain", () => { expect(toLatex("T", "<p>x</p>")).toContain("\\author{Author}"); });
  it("maps the other headings, ordered lists, line breaks, hr and plain-text marks", () => {
    const tex = toLatex("T", `<h3>c</h3><h4>d</h4><ol><li>one</li></ol><p>a<br>b</p><hr><p><mark>m</mark> <span style="color:red">s</span> <span class="ai-ins">ai</span></p><div class="page-break"></div>`);
    expect(tex).toContain("\\subsubsection{c}\n\n\\subsubsection{d}");
    expect(tex).toContain("\\begin{enumerate}\n\n\\item one\n\n\\end{enumerate}");
    expect(tex).toContain("a\\\\ b");
    expect(tex).toContain("\\bigskip\\hrule\\bigskip");
    expect(tex).toContain("m s ai");
    expect(tex).toContain("\\newpage");
  });
  it("names the file after the title and ends the document", () => {
    const { filename, blob } = latexDocument("A/B: c", "<p>x</p>");
    expect(filename).toBe("AB c.tex");
    expect(blob.type).toBe("text/x-tex");
  });
});
