// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { insertPlainHtml } from "../lib/editor/insert";

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
