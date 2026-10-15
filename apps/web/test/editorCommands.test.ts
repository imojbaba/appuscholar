// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { clearFormatting } from "../lib/editor/clearFormatting";
import { findInDoc, nextMatchIndex, replaceRanges } from "../lib/editor/findInEditor";

function make(content: string) {
  return new Editor({ extensions: editorExtensions, content });
}

describe("clear formatting", () => {
  it("removes bold, underline, colour and size but keeps an AI-insertion span and its data-h", () => {
    const e = make('<p><strong><u><span style="color: #ff0000; font-size: 20px">plain <span class="ai-ins" data-h="abc123">ai words</span> end</span></u></strong></p>');
    e.commands.selectAll();
    clearFormatting(e);
    const html = e.getHTML();
    expect(html).toContain('<span class="ai-ins" data-h="abc123">ai words</span>');
    expect(html).not.toMatch(/<strong>|<u>|color:|font-size/);
    e.destroy();
  });
  it("resets a heading to a paragraph", () => {
    const e = make("<h2>Title</h2>");
    e.commands.selectAll();
    clearFormatting(e);
    expect(e.getHTML()).toMatch(/^<p>Title<\/p>/);
    e.destroy();
  });
});

describe("indent", () => {
  it("steps a paragraph's margin up to 8 and back down to none", () => {
    const e = make("<p>Body</p>");
    e.commands.selectAll();
    expect(e.can().outdent()).toBe(false);
    e.commands.indent();
    expect(e.getHTML()).toBe('<p style="margin-left: 2em;">Body</p>');
    for (let i = 0; i < 10; i++) e.commands.indent();
    expect(e.getHTML()).toContain("margin-left: 16em");
    expect(e.can().indent()).toBe(false);
    for (let i = 0; i < 8; i++) e.commands.outdent();
    expect(e.getHTML()).toBe("<p>Body</p>");
    e.destroy();
  });
  it("keeps alignment and indent together", () => {
    const e = make('<p style="text-align: center; margin-left: 4em">x</p>');
    expect(e.getHTML()).toMatch(/text-align: center/);
    expect(e.getHTML()).toMatch(/margin-left: 4em/);
    e.destroy();
  });
});

describe("replace one, then move on", () => {
  it("cat -> cats twice gives 'cats cats', not 'catss'", () => {
    const e = make("<p>cat cat</p>");
    let matches = findInDoc(e.state.doc, "cat", false);
    let at = 0;
    for (let i = 0; i < 2; i++) {
      const target = matches[at]!;
      replaceRanges(e, [target], "cats");
      matches = findInDoc(e.state.doc, "cat", false);
      at = nextMatchIndex(matches, target.from + "cats".length);
    }
    expect(e.getText()).toBe("cats cats");
    e.destroy();
  });
  it("wraps to the first match when none follows", () => {
    expect(nextMatchIndex([{ from: 1, to: 4 }], 10)).toBe(0);
  });
});
