import { ncFmtP, numbersCheck, numbersSummary, type NcKind, type NcNote } from "@appuscholar/core";

/*
 * The Check tab's numbers check (v1 ncOpen 12351-12367, ncJump 12368): core finds every statistic written in the APA order and judges the reported p against
 * the one recomputed from the statistic and df (numbers.ts); this file turns that into the cards the tab draws. No AI, nothing leaves the browser.
 */

export type CardStatus = "ok" | "warn" | "error";
/** One card: what was found, how it was judged and the two p-values the student is shown. */
export type NumbersCard = {
  kind: NcKind;
  /** The text as written, without the spaces round it (v1 `f.raw.trim()`). */
  raw: string;
  status: CardStatus;
  /** The i18n key of the note ("" for none). */
  note: NcNote;
  /** v1 shows the "You wrote / Recomputed" line when the status is not ok or there is a note. */
  detail: boolean;
  /** "p = .043": the reported p as the student wrote it. */
  wrote: string;
  /** "p = .043" or "p < .001" as core formats the recomputed one, "–" when it cannot be worked out. */
  recomputed: string;
  /** Which time this same text appears among the cards before this one: "Go to this text" selects that one in the document. */
  nth: number;
};
export type NumbersView = { cards: NumbersCard[]; summary: { n: number; ok: number; warn: number; err: number } };

/** What the student's document text comes to: v1's ncOpen over `text`. */
export function numbersView(text: string): NumbersView {
  const items = numbersCheck(text);
  const seen = new Map<string, number>();
  const cards = items.map((f): NumbersCard => {
    const key = needle(f.raw);
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return {
      kind: f.kind, raw: f.raw.trim(), status: f.j.status, note: f.j.note,
      detail: f.j.status !== "ok" || !!f.j.note,
      wrote: "p " + f.op + " " + f.pStr,
      recomputed: f.j.pcalc !== undefined && isFinite(f.j.pcalc) ? "p " + ncFmtP(f.j.pcalc) : "–",
      nth
    };
  });
  return { cards, summary: numbersSummary(items) };
}

/**
 * What to look for in the editor: the document's text nodes run together with nothing between them (the way the editor's text is searched), so a line break
 * in the text read from the document is dropped, and a no-break space is a space.
 */
export function needle(raw: string): string {
  return raw.replace(/\n+/g, "").replace(/ /g, " ");
}
