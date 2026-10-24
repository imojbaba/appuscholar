// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { editorExtensions } from "../lib/editorExtensions";
import { captionHtml, hasCaptionAbove, insertCaption, nearestTablePos, noteHtml, renumberCaptions, topLevelBlockPos } from "../lib/editor/captions";

/*
 * Numbered APA captions (wave D Task 5, R1 section 1, v1 4501-4515, 4539-4557, 4566). A caption is an ordinary paragraph marked by an attribute
 * (Task 2's CaptionParagraph); the numbers are rewritten only on an explicit event (ruling P1), in ONE transaction and only when a number is wrong.
 */

const made: Editor[] = [];
function make(content: string) {
  const e = new Editor({ extensions: editorExtensions, content });
  made.push(e);
  return e;
}
afterEach(() => { for (const e of made.splice(0)) e.destroy(); });

const IMG = '<img src="data:image/png;base64,AAAA">';
const FIG = (n: number) => `<p data-cap="figure"><strong>Figure ${n}</strong></p>`;
const TAB = (n: number) => `<p data-cap="table"><strong>Table ${n}</strong></p>`;
const TABLE = "<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>";

/** The top-level blocks as `[type, cap, text]`, so a test reads the document's order at a glance. */
function outline(e: Editor) {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.type.name + (n.attrs.cap ? `[${n.attrs.cap}]` : n.attrs.capTitle ? "[title]" : n.attrs.capNote ? "[note]" : "") + ":" + n.textContent));
  return out;
}
/** The document position of the nth node of a type. */
function posOf(e: Editor, type: string, nth = 0): number {
  let found = -1, seen = 0;
  e.state.doc.descendants((n, pos) => { if (n.type.name === type && seen++ === nth) { found = pos; return false; } return found < 0; });
  if (found < 0) throw new Error("no " + type);
  return found;
}
/** Puts the cursor inside the text of the first paragraph whose text is `text`. */
function cursorIn(e: Editor, text: string) {
  let at = -1;
  e.state.doc.descendants((n, pos) => { if (at < 0 && n.type.name === "paragraph" && n.textContent === text) { at = pos + 1; return false; } return at < 0; });
  if (at < 0) throw new Error("no paragraph " + text);
  e.commands.setTextSelection(at);
}
function selectImage(e: Editor, nth = 0) { e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, posOf(e, "image", nth)))); }
/** How many transactions an action dispatches, counted at the view (the path autosave and the undo history both see). */
function dispatches(e: Editor, run: () => void): number {
  const spy = vi.spyOn(e.view, "dispatch");
  run();
  const n = spy.mock.calls.length;
  spy.mockRestore();
  return n;
}

describe("the caption markup", () => {
  it("is v1's: a bold placeholder number, then an italic title, the title escaped", () => {
    expect(captionHtml("figure", "Sleep and scores")).toBe('<p data-cap="figure"><strong>Figure 0</strong></p><p data-cap-title="1"><em>Sleep and scores</em></p>');
    expect(captionHtml("table", "Means")).toBe('<p data-cap="table"><strong>Table 0</strong></p><p data-cap-title="1"><em>Means</em></p>');
    expect(captionHtml("figure", "a < b & \"c\"")).toContain("<em>a &lt; b &amp; &quot;c&quot;</em>");
  });
  it("leaves the title paragraph out when the title is empty, as v1 does", () => {
    expect(captionHtml("figure", "")).toBe('<p data-cap="figure"><strong>Figure 0</strong></p>');
  });
  it("makes the note an italic Note. then the text, escaped, and nothing for an empty note", () => {
    expect(noteHtml("From the survey")).toBe('<p data-cap-note="1"><em>Note.</em> From the survey</p>');
    expect(noteHtml("n < 30 & more")).toBe('<p data-cap-note="1"><em>Note.</em> n &lt; 30 &amp; more</p>');
    expect(noteHtml("")).toBe("");
  });
  it("loads through the schema as caption paragraphs", () => {
    const e = make(captionHtml("figure", "T") + noteHtml("N"));
    expect(outline(e)).toEqual(["paragraph[figure]:Figure 0", "paragraph[title]:T", "paragraph[note]:Note. N"]);
  });
});

describe("renumberCaptions", () => {
  it("numbers two figures and one table in document order, with two independent counters", () => {
    const e = make(FIG(0) + `<p>${IMG}</p>` + TAB(0) + TABLE + FIG(0) + `<p>${IMG}</p>`);
    expect(renumberCaptions(e)).toEqual({ f: 2, t: 1 });
    expect(outline(e).filter((s) => s.includes("[figure]") || s.includes("[table]"))).toEqual(["paragraph[figure]:Figure 1", "paragraph[table]:Table 1", "paragraph[figure]:Figure 2"]);
    expect(e.getHTML()).toContain('<p data-cap="figure"><strong>Figure 2</strong></p>');
  });
  it("closes the gap after a caption is deleted: the second figure becomes Figure 1 (explicit, v1 4506)", () => {
    const e = make(FIG(1) + `<p>${IMG}</p>` + FIG(2) + `<p>${IMG}</p>`);
    const first = e.state.doc.child(0);
    e.view.dispatch(e.state.tr.delete(0, first.nodeSize));
    // Nothing renumbers by itself (ruling P1): the gap stays until the student asks.
    expect(outline(e)[1]).toBe("paragraph[figure]:Figure 2");
    expect(renumberCaptions(e)).toEqual({ f: 1, t: 0 });
    expect(outline(e)[1]).toBe("paragraph[figure]:Figure 1");
  });
  it("rewrites the bold text and keeps whatever follows it in the paragraph, as v1 does", () => {
    const e = make('<p data-cap="figure"><strong>Figure 9</strong>. Extra words</p>');
    renumberCaptions(e);
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 1</strong>. Extra words</p>');
  });
  it("creates the bold number when the paragraph has none, in front of the text (v1 4511)", () => {
    const e = make('<p data-cap="table">Means</p>' + TABLE);
    renumberCaptions(e);
    expect(e.getHTML()).toMatch(/^<p data-cap="table"><strong>Table 1<\/strong>Means<\/p>/);
    expect(renumberCaptions(e)).toEqual({ f: 0, t: 1 });
  });
  it("counts a caption inside a quote too, in document order, as v1's querySelectorAll does", () => {
    const e = make(FIG(7) + "<blockquote>" + FIG(7) + "</blockquote>");
    expect(renumberCaptions(e)).toEqual({ f: 2, t: 0 });
    expect(e.getHTML()).toContain("Figure 2");
  });
  it("is one transaction for any number of changes", () => {
    const e = make(FIG(5) + TAB(5) + FIG(5) + TAB(5));
    expect(dispatches(e, () => renumberCaptions(e))).toBe(1);
    expect(outline(e)).toEqual(["paragraph[figure]:Figure 1", "paragraph[table]:Table 1", "paragraph[figure]:Figure 2", "paragraph[table]:Table 2"]);
  });
  it("dispatches no transaction at all when every number is already right (autosave is not churned)", () => {
    const e = make(FIG(1) + `<p>${IMG}</p>` + TAB(1) + TABLE + FIG(2));
    const updates = vi.fn();
    e.on("update", updates);
    expect(dispatches(e, () => expect(renumberCaptions(e)).toEqual({ f: 2, t: 1 }))).toBe(0);
    expect(updates).not.toHaveBeenCalled();
  });
  it("is one undo step", () => {
    const e = make(FIG(3) + FIG(3));
    const before = e.getHTML();
    renumberCaptions(e);
    expect(e.getHTML()).not.toBe(before);
    e.commands.undo();
    expect(e.getHTML()).toBe(before);
  });
  it("leaves a document with no captions alone", () => {
    const e = make("<p>Plain</p>");
    expect(dispatches(e, () => expect(renumberCaptions(e)).toEqual({ f: 0, t: 0 }))).toBe(0);
  });
});

describe("hasCaptionAbove (v1 picCapExists 4566, ieOpenFor 4413)", () => {
  const above = (html: string, picture = 0) => {
    const e = make(html);
    return hasCaptionAbove(e, posOf(e, "image", picture));
  };
  it("is true when the previous top-level block has the caption mark", () => {
    expect(above(FIG(1) + `<p>${IMG}</p>`)).toBe(true);
  });
  it("is true when the previous block is the title paragraph", () => {
    expect(above(`<p data-cap-title="1"><em>T</em></p><p>${IMG}</p>`)).toBe(true);
  });
  it("is true when the caption is two blocks up, over a title", () => {
    expect(above(FIG(1) + '<p data-cap-title="1"><em>T</em></p>' + `<p>${IMG}</p>`)).toBe(true);
  });
  it("is true with one plain paragraph between, as v1 asks only that the block two up has the caption mark (4415)", () => {
    expect(above(FIG(1) + "<p>between</p>" + `<p>${IMG}</p>`)).toBe(true);
  });
  it("is false with no caption, with a caption three blocks up, and for a picture at the top", () => {
    expect(above(`<p>Intro</p><p>${IMG}</p>`)).toBe(false);
    expect(above(`<p>${IMG}</p>`)).toBe(false);
    expect(above(FIG(1) + "<p>one</p><p>two</p>" + `<p>${IMG}</p>`)).toBe(false);
    // A title paragraph only counts directly above; two up it is not enough (v1 asks for data-cap there).
    expect(above('<p data-cap-title="1"><em>T</em></p><p>x</p>' + `<p>${IMG}</p>`)).toBe(false);
    // A note belongs under a picture; it is not a caption above.
    expect(above('<p data-cap-note="1"><em>Note.</em> n</p>' + `<p>${IMG}</p>`)).toBe(false);
  });
  it("answers for the second of two pictures by what sits above that one", () => {
    expect(above(FIG(1) + `<p>${IMG}</p><p>text</p><p>${IMG}</p>`, 1)).toBe(false);
    expect(above(FIG(1) + `<p>${IMG}</p>` + FIG(2) + `<p>${IMG}</p>`, 1)).toBe(true);
  });
  it("reads the top-level block of a picture inside a table cell, so the caption above the table counts", () => {
    expect(above(TAB(1) + `<table><tbody><tr><td><p>${IMG}</p></td></tr></tbody></table>`)).toBe(true);
    expect(above(`<p>x</p><table><tbody><tr><td><p>${IMG}</p></td></tr></tbody></table>`)).toBe(false);
  });
  it("accepts the position of the block itself", () => {
    const e = make(FIG(1) + `<p>${IMG}</p>`);
    expect(hasCaptionAbove(e, e.state.doc.child(0).nodeSize)).toBe(true);
  });
});

describe("topLevelBlockPos and nearestTablePos", () => {
  it("gives the start of the depth-1 block that holds a position", () => {
    const e = make("<p>one</p><p>two</p>" + TABLE);
    const second = e.state.doc.child(0).nodeSize;
    cursorIn(e, "two");
    expect(topLevelBlockPos(e, e.state.selection.from)).toBe(second);
    expect(topLevelBlockPos(e, posOf(e, "tableCell"))).toBe(second + e.state.doc.child(1).nodeSize);
    // A position between two top-level blocks is already the start of the one that follows.
    expect(topLevelBlockPos(e, second)).toBe(second);
  });
  it("finds the table around the cursor and returns its top-level block", () => {
    const e = make("<p>before</p>" + TABLE);
    cursorIn(e, "b");
    expect(nearestTablePos(e)).toBe(posOf(e, "table"));
  });
  it("returns the quote's position for a table nested in a quote", () => {
    const e = make("<p>x</p><blockquote>" + TABLE + "</blockquote>");
    cursorIn(e, "a");
    expect(nearestTablePos(e)).toBe(posOf(e, "blockquote"));
    expect(nearestTablePos(e)).not.toBe(posOf(e, "table"));
  });
  it("is null outside a table, and for a picture selected outside one", () => {
    const e = make(`<p>Plain</p><p>${IMG}</p>` + TABLE);
    cursorIn(e, "Plain");
    expect(nearestTablePos(e)).toBeNull();
    selectImage(e);
    expect(nearestTablePos(e)).toBeNull();
  });
  it("sees a table that is itself selected", () => {
    const e = make("<p>x</p>" + TABLE);
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, posOf(e, "table"))));
    expect(nearestTablePos(e)).toBe(posOf(e, "table"));
  });
});

describe("insertCaption", () => {
  it("a table caption goes above the whole table and the note below it", () => {
    const e = make("<p>Intro</p>" + TABLE + "<p>After</p>");
    cursorIn(e, "b");
    expect(insertCaption(e, { kind: "table", title: "Group means", note: "Scores out of 10" })).toBe("inserted");
    expect(outline(e)).toEqual(["paragraph:Intro", "paragraph[table]:Table 1", "paragraph[title]:Group means", "table:ab", "paragraph[note]:Note. Scores out of 10", "paragraph:After"]);
  });
  it("leaves out the note paragraph when the note is empty", () => {
    const e = make(TABLE + "<p>After</p>");
    cursorIn(e, "a");
    insertCaption(e, { kind: "table", title: "Means", note: "   " });
    expect(outline(e)).toEqual(["paragraph[table]:Table 1", "paragraph[title]:Means", "table:ab", "paragraph:After"]);
  });
  it("a picture inside a table cell puts the caption above the whole table", () => {
    const e = make("<p>Intro</p><table><tbody><tr><td><p>Photo</p><p>" + IMG + "</p></td><td><p>b</p></td></tr></tbody></table><p>After</p>");
    selectImage(e);
    insertCaption(e, { kind: "figure", title: "The photo", note: "A note" });
    expect(outline(e)).toEqual(["paragraph:Intro", "paragraph[figure]:Figure 1", "paragraph[title]:The photo", "table:Photob", "paragraph[note]:Note. A note", "paragraph:After"]);
  });
  it("a figure caption with a picture selected goes above that picture's paragraph, the note below it", () => {
    const e = make(`<p>Intro</p><p>${IMG}</p><p>After</p><p>${IMG}</p>`);
    selectImage(e, 0);
    expect(e.isActive("image")).toBe(true);
    insertCaption(e, { kind: "figure", title: "Sleep", note: "Source: survey" });
    expect(outline(e)).toEqual(["paragraph:Intro", "paragraph[figure]:Figure 1", "paragraph[title]:Sleep", "paragraph:", "paragraph[note]:Note. Source: survey", "paragraph:After", "paragraph:"]);
    // The picture stays selected: the dialog closing does not lose it.
    expect(e.isActive("image")).toBe(true);
    expect(e.state.doc.child(3).firstChild?.type.name).toBe("image");
  });
  it("a figure caption with no picture selected goes in at the cursor, caption then note, with no picture", () => {
    const e = make("<p>First</p><p>Second</p><p>Third</p>");
    cursorIn(e, "Second");
    expect(insertCaption(e, { kind: "figure", title: "Loose", note: "n" })).toBe("inserted");
    expect(outline(e)).toContain("paragraph[figure]:Figure 1");
    const text = outline(e).join("|");
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Figure 1"));
    expect(text.indexOf("Figure 1")).toBeLessThan(text.indexOf("Loose"));
    expect(text.indexOf("Loose")).toBeLessThan(text.indexOf("Note. n"));
    expect(text.indexOf("Note. n")).toBeLessThan(text.indexOf("Third"));
  });
  it("an insert at the cursor splits the paragraph it is in and keeps every word", () => {
    const e = make("<p>Second</p>");
    e.commands.setTextSelection(4);
    insertCaption(e, { kind: "figure", title: "Mid", note: "" });
    expect(outline(e)).toEqual(["paragraph:Sec", "paragraph[figure]:Figure 1", "paragraph[title]:Mid", "paragraph:ond"]);
  });
  it("an insert at the cursor with words selected goes after them and does not replace them (a deliberate change from v1)", () => {
    const e = make("<p>Keep these words</p>");
    e.commands.setTextSelection({ from: 1, to: 5 });
    insertCaption(e, { kind: "figure", title: "Mid", note: "" });
    expect(outline(e)).toEqual(["paragraph:Keep", "paragraph[figure]:Figure 1", "paragraph[title]:Mid", "paragraph: these words"]);
  });
  it("a Select all with several pictures captions none of them: it goes in at the cursor end instead", () => {
    const e = make(`<p>${IMG}</p><p>${IMG}</p>`);
    e.commands.selectAll();
    insertCaption(e, { kind: "figure", title: "Which?", note: "" });
    expect(outline(e).slice(0, 2)).toEqual(["paragraph:", "paragraph:"]);
    expect(outline(e).slice(2)).toEqual(["paragraph[figure]:Figure 1", "paragraph[title]:Which?"]);
  });
  it("a table caption with the cursor outside any table goes in at the cursor, as v1 does", () => {
    const e = make("<p>Only</p>");
    cursorIn(e, "Only");
    expect(insertCaption(e, { kind: "table", title: "Loose", note: "" })).toBe("inserted");
    expect(outline(e).some((s) => s === "paragraph[table]:Table 1")).toBe(true);
  });
  it("numbers the new caption among the old ones in the same step: a figure above an existing Figure 1 becomes Figure 1 and the old one Figure 2", () => {
    const e = make(`<p>Intro</p><p>${IMG}</p>` + FIG(1) + `<p>${IMG}</p>`);
    selectImage(e, 0);
    insertCaption(e, { kind: "figure", title: "Earlier", note: "" });
    expect(outline(e).filter((s) => s.includes("[figure]"))).toEqual(["paragraph[figure]:Figure 1", "paragraph[figure]:Figure 2"]);
  });
  it("an empty or blank title returns need-title and changes nothing", () => {
    const e = make("<p>Intro</p>" + TABLE);
    cursorIn(e, "a");
    const before = JSON.stringify(e.getJSON());
    expect(dispatches(e, () => expect(insertCaption(e, { kind: "table", title: "", note: "n" })).toBe("need-title"))).toBe(0);
    expect(insertCaption(e, { kind: "figure", title: "   \n ", note: "n" })).toBe("need-title");
    expect(JSON.stringify(e.getJSON())).toBe(before);
  });
  it("trims the title and the note", () => {
    const e = make(TABLE);
    cursorIn(e, "a");
    insertCaption(e, { kind: "table", title: "  Means  ", note: "  n  " });
    expect(outline(e)).toContain("paragraph[title]:Means");
    expect(outline(e)).toContain("paragraph[note]:Note. n");
  });
  it("escapes the title: <b>x</b> reads as text, with no bold node", () => {
    const e = make(TABLE);
    cursorIn(e, "a");
    insertCaption(e, { kind: "table", title: "<b>x</b>", note: "<i>y</i>" });
    expect(outline(e)).toContain("paragraph[title]:<b>x</b>");
    expect(outline(e)).toContain("paragraph[note]:Note. <i>y</i>");
    const html = e.getHTML();
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    // The only bold in the document is the caption's own number.
    expect(html.match(/<strong>/g)).toHaveLength(1);
  });
  it("is one undo step: the caption, the note and the renumbering come out together", () => {
    const e = make(FIG(1) + `<p>${IMG}</p>` + "<p>Mid</p>" + `<p>${IMG}</p>`);
    selectImage(e, 0);
    const before = e.getHTML();
    insertCaption(e, { kind: "figure", title: "New", note: "n" });
    expect(e.getHTML()).not.toBe(before);
    e.commands.undo();
    expect(e.getHTML()).toBe(before);
  });
  it("is one transaction, so autosave sees one update", () => {
    const e = make(TABLE);
    cursorIn(e, "a");
    expect(dispatches(e, () => insertCaption(e, { kind: "table", title: "T", note: "N" }))).toBe(1);
  });
});

describe("Enter and Backspace around a caption", () => {
  // Task 2's fix (keepOnSplit false on the three attributes, and an Enter handler): the next line is never a second caption, so Renumber all cannot write
  // "Figure n" over the student's sentence.
  it("Enter at the end of a caption starts an ordinary paragraph, and renumbering leaves it alone", () => {
    const e = make(FIG(1));
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.splitBlock();
    expect(e.state.doc.childCount).toBe(2);
    expect(e.state.doc.child(0).attrs.cap).toBe("figure");
    expect(e.state.doc.child(1).attrs.cap ?? null).toBeNull();
    e.commands.insertContent("My next sentence.");
    expect(renumberCaptions(e)).toEqual({ f: 1, t: 0 });
    expect(outline(e)).toEqual(["paragraph[figure]:Figure 1", "paragraph:My next sentence."]);
  });
  it("Enter at the end of a title paragraph starts an ordinary paragraph too", () => {
    const e = make(captionHtml("figure", "Title"));
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.splitBlock();
    expect(outline(e)).toEqual(["paragraph[figure]:Figure 0", "paragraph[title]:Title", "paragraph:"]);
  });
  // Backspace at the start of the paragraph after a caption merges that paragraph into the caption (Task 2 review). The number must be rewritten
  // without touching the body that came with it.
  it("keeps the body that Backspace merged into the caption: only the label changes", () => {
    const e = make(FIG(4) + "<p>body words</p>");
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize + 1);
    e.commands.joinBackward();
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 4</strong>body words</p>');
    expect(renumberCaptions(e)).toEqual({ f: 1, t: 0 });
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 1</strong>body words</p>');
  });
  it("keeps merged body text that is itself bold, which joins the label's own run", () => {
    const e = make(FIG(4) + "<p><strong>Bold start</strong> and more</p>");
    e.commands.setTextSelection(e.state.doc.child(0).nodeSize + 1);
    e.commands.joinBackward();
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 4Bold start</strong> and more</p>');
    renumberCaptions(e);
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 1Bold start</strong> and more</p>');
    // Already right: nothing to do, even though the run holds more than the label.
    expect(dispatches(e, () => renumberCaptions(e))).toBe(0);
  });
  it("rewrites a label that spans several differently marked pieces without losing the text after it", () => {
    const e = make('<p data-cap="table"><strong>Table <em>7</em></strong> kept <strong>second bold</strong></p>');
    renumberCaptions(e);
    expect(e.getHTML()).toBe('<p data-cap="table"><strong>Table 1</strong> kept <strong>second bold</strong></p>');
  });
  it("replaces a bold run that does not start like a label, as v1 sets the strong's text, and still leaves the rest", () => {
    const e = make('<p data-cap="figure"><strong>Fig. 3</strong> the chart</p>');
    renumberCaptions(e);
    expect(e.getHTML()).toBe('<p data-cap="figure"><strong>Figure 1</strong> the chart</p>');
  });
  it("completes a label whose number was deleted", () => {
    const e = make('<p data-cap="table"><strong>Table</strong>: means</p>');
    renumberCaptions(e);
    expect(e.getHTML()).toBe('<p data-cap="table"><strong>Table 1</strong>: means</p>');
  });
});
