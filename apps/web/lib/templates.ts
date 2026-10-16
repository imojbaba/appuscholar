/** v1's three starter outlines, word for word (v1 `SCAFFOLDS`). The brackets are prompts the student replaces. */
export const SCAFFOLDS = {
  "Lab report (APA)": "Title\n\nAbstract\n[150–250 words: aim, method, key result, conclusion]\n\nKeywords: \n\nIntroduction\n[Background, previous findings, rationale. End with your hypotheses.]\n\nMethod\n\nParticipants\n[N, age M and SD, sampling, ethics approval, informed consent]\n\nMaterials\n[Measures, reliability, apparatus]\n\nProcedure\n[What participants actually did, in order, past tense]\n\nDesign\n[IV, DV, design type]\n\nResults\n[Descriptives first, then inferential statistics in APA format]\n\nDiscussion\n[Restate findings in words, link to the literature, limitations, future directions]\n\nReferences\n",
  "Essay": "Title\n\nIntroduction\n[Context, the question, your line of argument]\n\n[Argument 1 — claim, evidence, evaluation]\n\n[Argument 2 — claim, evidence, evaluation]\n\n[Counter-argument and your response]\n\nConclusion\n[What the evidence supports, and what remains open]\n\nReferences\n",
  "Literature review": "Title\n\nIntroduction\n[Scope, why this review is needed, review question]\n\nMethod of review\n[Databases searched, inclusion and exclusion criteria, date range]\n\nTheme 1\n[Findings that agree, findings that conflict, quality of evidence]\n\nTheme 2\n\nTheme 3\n\nSynthesis\n[What the field agrees on, where it does not, what is missing]\n\nConclusion\n\nReferences\n"
} as const satisfies Record<string, string>;
export type ScaffoldName = keyof typeof SCAFFOLDS;

/** Lines that are headings in a scaffold; "Title" is the document title. Everything else (bracketed prompts, "Keywords: ") stays a paragraph. */
const H2 = new Set(["Abstract", "Introduction", "Method", "Participants", "Materials", "Procedure", "Design", "Results", "Discussion", "References", "Conclusion", "Synthesis", "Method of review", "Theme 1", "Theme 2", "Theme 3"]);

function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/** Turns scaffold text into editor HTML: Title is the h1, the section names are h2, every other non-blank line is a paragraph. */
export function scaffoldToHtml(text: string): string {
  return text.split("\n").filter((line) => line.trim() !== "").map((line) => {
    if (line === "Title") return "<h1>Title</h1>";
    if (H2.has(line)) return `<h2>${line}</h2>`;
    return `<p>${esc(line)}</p>`;
  }).join("");
}
