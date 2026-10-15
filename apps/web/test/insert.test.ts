// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { provHash } from "@appuscholar/core";
import { hasSelection, insertAiText, insertPlainHtml, mapRange, selectionRange, selectionText, tailText } from "../lib/editor/insert";

const make = (content: string) => new Editor({ extensions: editorExtensions, content });

describe("insertPlainHtml", () => {
  it("with atEnd the template lands after the last block even when the cursor is at the start", () => {
    const e = make("<p>First</p><p>Second</p>");
    e.commands.setTextSelection(1);
    insertPlainHtml(e, "<h1>Title</h1><p>Body</p>", { atEnd: true });
    expect(e.getHTML()).toBe("<p>First</p><p>Second</p><h1>Title</h1><p>Body</p>");
    e.destroy();
  });
  it("by default it goes at the cursor", () => {
    const e = make("<p>First</p><p>Second</p>");
    e.commands.setTextSelection(1);
    insertPlainHtml(e, "<h2>Here</h2>");
    expect(e.getHTML().indexOf("Here")).toBeLessThan(e.getHTML().indexOf("Second"));
    e.destroy();
  });
  it("replaces the empty paragraph of a blank document", () => {
    const e = make("<p></p>");
    insertPlainHtml(e, "<h1>Title</h1><p>Body</p>", { atEnd: true });
    expect(e.getHTML()).toBe("<h1>Title</h1><p>Body</p>");
    e.destroy();
  });
});

describe("insertAiText", () => {
  it("appends AI text at the end as a tagged span with a leading paragraph", () => {
    const ed = make("<p>mine</p>");
    insertAiText(ed, "theirs\nmore", false);
    expect(ed.getHTML()).toBe(`<p>mine</p><p><span class="ai-ins" data-h="${provHash("theirs\nmore")}">theirs<br>more</span></p>`);
    ed.destroy();
  });
  it("replaces the selection when asked", () => {
    const ed = make("<p>keep this drop this</p>");
    ed.commands.setTextSelection({ from: 11, to: 20 });
    insertAiText(ed, "new", true);
    expect(ed.getHTML()).toBe(`<p>keep this <span class="ai-ins" data-h="${provHash("new")}">new</span></p>`);
    ed.destroy();
  });
  it("writes into the empty paragraph of a blank document without a leading paragraph", () => {
    const ed = make("<p></p>");
    insertAiText(ed, "first", false);
    expect(ed.getHTML()).toBe(`<p><span class="ai-ins" data-h="${provHash("first")}">first</span></p>`);
    ed.destroy();
  });
  it("escapes markup in the AI text", () => {
    const ed = make("<p>a</p>");
    insertAiText(ed, "<b>x</b> & y", false);
    expect(ed.getHTML()).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(ed.getHTML()).not.toContain("<b>");
    ed.destroy();
  });
  it("text typed right after the insertion is not inside the span", () => {
    const ed = make("<p>mine</p>");
    insertAiText(ed, "theirs", false);
    ed.commands.insertContent("typed");
    expect(ed.getHTML()).toContain("</span>typed");
    ed.destroy();
  });
});

describe("selection and tail helpers", () => {
  it("selectionText is empty when collapsed and the words when selected", () => {
    const ed = make("<p>keep this drop this</p>");
    ed.commands.setTextSelection(3);
    expect(hasSelection(ed)).toBe(false);
    expect(selectionText(ed)).toBe("");
    ed.commands.setTextSelection({ from: 11, to: 20 });
    expect(hasSelection(ed)).toBe(true);
    expect(selectionText(ed)).toBe("drop this");
    ed.destroy();
  });
  it("tail is the last 2000 characters", () => {
    const ed = make("<p>" + "x".repeat(2500) + "</p>");
    expect(tailText(ed).length).toBe(2000);
    ed.destroy();
  });
  it("tail separates paragraphs with a newline", () => {
    const ed = make("<p>one</p><p>two</p>");
    expect(tailText(ed)).toBe("one\ntwo");
    ed.destroy();
  });
});

describe("replacing the range the request was made for", () => {
  it("replaces the original range even after the cursor moved elsewhere", () => {
    const ed = make("<p>keep this drop this</p>");
    ed.commands.setTextSelection({ from: 11, to: 20 });
    const range = selectionRange(ed);
    expect(range).toEqual({ from: 11, to: 20, text: "drop this" });
    ed.commands.setTextSelection(3);
    insertAiText(ed, "new", true, range);
    expect(ed.getHTML()).toBe(`<p>keep this <span class="ai-ins" data-h="${provHash("new")}">new</span></p>`);
    ed.destroy();
  });
  it("follows the range through edits made before it", () => {
    const ed = make("<p>keep this drop this</p>");
    ed.commands.setTextSelection({ from: 11, to: 20 });
    let range = selectionRange(ed)!;
    ed.on("transaction", ({ transaction }) => { if (transaction.docChanged) range = mapRange(range, transaction.mapping); });
    ed.commands.insertContentAt(1, "XX ");
    expect(range).toEqual({ from: 14, to: 23, text: "drop this" });
    insertAiText(ed, "new", true, range);
    expect(ed.getHTML()).toBe(`<p>XX keep this <span class="ai-ins" data-h="${provHash("new")}">new</span></p>`);
    ed.destroy();
  });
  it("appends at the end when the original text is no longer there", () => {
    const ed = make("<p>keep this drop this</p>");
    ed.commands.setTextSelection({ from: 11, to: 20 });
    const range = selectionRange(ed);
    ed.commands.insertContentAt({ from: 11, to: 20 }, "changed");
    ed.commands.setTextSelection(3);
    insertAiText(ed, "new", true, range);
    expect(ed.getHTML()).toBe(`<p>keep this changed</p><p><span class="ai-ins" data-h="${provHash("new")}">new</span></p>`);
    ed.destroy();
  });
  it("selectionRange is null when collapsed", () => {
    const ed = make("<p>abc</p>");
    ed.commands.setTextSelection(2);
    expect(selectionRange(ed)).toBeNull();
    ed.destroy();
  });
});
