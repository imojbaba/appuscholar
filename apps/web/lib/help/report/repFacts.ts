import { maskText } from "@appuscholar/core";

/** One entry of the error ring: when, which tool was open, the masked message, and file:line. */
export type RingError = { at: number; tool: string; message: string; where: string };

export type RepFactsInput = {
  build: string; tool: string; lang: string; ua: string;
  /** "<w>x<h>, window <w>x<h>" */
  screen: string;
  online: boolean; provider: string; keySaved: boolean; errors: RingError[];
};

/**
 * A message as the report may carry it: whitespace collapsed, the personal-data mask (core's `maskText`, v1 `pdMask`) applied, then cut to 140
 * characters. v1 cut first and masked after; masking first means an address or number at the cut point is never left half showing.
 */
export function scrubMessage(raw: unknown, max = 140): string {
  const flat = String(raw ?? "").replace(/\s+/g, " ").trim();
  return maskText(flat).slice(0, max);
}

/** The tool open, from the address: `writing`, `design/budget`; never the project's id. "none" outside a project. */
export function toolFromPath(path: string | null | undefined): string {
  const m = /^\/p\/[^/]+\/([^/?#]+)(?:\/([^/?#]+))?/.exec(path ?? "");
  return m ? m[1] + (m[2] ? "/" + m[2] : "") : "none";
}

const hhmm = (at: number): string => { try { return new Date(at).toISOString().slice(11, 16); } catch { return "--:--"; } };

/**
 * What the app adds to a problem report (v1 repFacts 11355-11385). Labels are fixed English: the report is read by whoever answers it.
 * Only these fields; nothing from documents, sources, data or keys (the key line says whether one is saved, never what it is).
 */
export function repFacts(i: RepFactsInput): string {
  const L = [
    "Appuscholar build: " + i.build,
    "Tool open: " + i.tool,
    "Interface language: " + i.lang,
    "Browser: " + i.ua,
    "Screen: " + i.screen,
    "Online: " + (i.online ? "yes" : "no"),
    "AI provider chosen: " + i.provider + ", key saved: " + (i.keySaved ? "yes" : "no"),
    "Recent errors: " + (i.errors.length ? "" : "none")
  ];
  // Masked again here: a caller may hand in an entry that did not come through the ring.
  for (const e of i.errors.slice(-5)) L.push("  " + hhmm(e.at) + " in " + e.tool + ": " + scrubMessage(e.message) + (e.where ? " (" + scrubMessage(e.where, 60) + ")" : ""));
  return L.join("\n");
}

/** v1 repSend: the body goes into the link cut to 1,500 characters; when the whole encoded body is over 1,800 the caller copies the report too. */
export function buildMailto(subject: string, body: string, support: string): { href: string; copied: boolean } {
  return {
    href: "mailto:" + support + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body.slice(0, 1500)),
    copied: encodeURIComponent(body).length > 1800
  };
}

/** The body of the email and of the copied report (v1 repBody): the student's words, a divider, the facts, and the counts when ticked. */
export function repBody(description: string, facts: string, usage: string | null): string {
  const desc = description.trim();
  return (desc || "(please describe the problem here)") + "\n\n--- Added by the app ---\n" + facts + (usage ? "\n" + usage : "");
}
