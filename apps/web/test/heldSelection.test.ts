// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { heldEditorSelection, helperScope } from "../lib/editor/heldSelection";
import { selBubbleVisible } from "../lib/editor/selectionBubble";
import { insertAiText } from "../lib/editor/insert";
import { replaceRanges } from "../lib/editor/findInEditor";

let editor: Editor;
const para = (n: number, c = "a") => c.repeat(n);
const blur = () => editor.view.dom.dispatchEvent(new FocusEvent("blur"));
const focus = () => editor.view.dom.dispatchEvent(new FocusEvent("focus"));

beforeEach(() => {
  editor = new Editor({ extensions: editorExtensions, content: `<p>${para(3000)}</p><p>Second paragraph of the essay.</p>` });
});
afterEach(() => { editor.destroy(); });

describe("heldEditorSelection (Task 32)", () => {
  it("is nothing before anything is selected", () => {
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("holds a selection of any length, past the bubble's 800 characters", () => {
    editor.commands.setTextSelection({ from: 1, to: 3001 });
    const held = heldEditorSelection(editor)!;
    expect(held.text).toBe(para(3000));
    expect(held).toMatchObject({ from: 1, to: 3001 });
    expect(selBubbleVisible({ empty: false, text: held.text })).toBe(false);
  });

  it("joins the paragraphs of a selection with one line break, as the writing actions read it", () => {
    editor.commands.setTextSelection({ from: 2990, to: 3014 });
    expect(heldEditorSelection(editor)!.text).toBe(para(11) + "\n" + "Second para");
  });

  it("keeps the selection through a blur, even when the page then collapses the live selection", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    blur();
    // A phone can collapse the selection as the menu takes focus; the editor is not the one choosing.
    editor.commands.setTextSelection(50);
    expect(heldEditorSelection(editor)).toMatchObject({ from: 1, to: 101, text: para(100) });
  });

  it("a new selection made while the document has focus replaces it", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    focus();
    editor.commands.setTextSelection({ from: 200, to: 260 });
    expect(heldEditorSelection(editor)).toMatchObject({ from: 200, to: 260 });
  });

  it("a cursor placed in the focused document clears it", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    focus();
    editor.commands.setTextSelection(500);
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("coming back to the document and clicking into it clears what was held", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    blur();
    focus();
    editor.commands.setTextSelection(500);
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("an edit inside the held range clears it", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500); // the page collapses the live selection; only the hold remembers it
    editor.commands.insertContentAt(60, "typed", { updateSelection: false });
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("deleting across part of the held range clears it", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500);
    editor.commands.deleteRange({ from: 100, to: 120 });
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("while the live selection survives an edit it is the selection, whatever the edit did to its words", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    editor.commands.deleteRange({ from: 100, to: 120 });
    expect(heldEditorSelection(editor)).toMatchObject({ from: 10, to: 100, text: para(90) });
  });

  it("an edit before the range moves it with the text; an edit after leaves it", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500);
    editor.commands.insertContentAt(3, "xx", { updateSelection: false });
    expect(heldEditorSelection(editor)).toMatchObject({ from: 12, to: 112, text: para(100) });
    editor.commands.insertContentAt(2000, "yy", { updateSelection: false });
    expect(heldEditorSelection(editor)).toMatchObject({ from: 12, to: 112, text: para(100) });
  });

  it("typing right after the end of the range does not clear it", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500);
    editor.commands.insertContentAt(110, "z", { updateSelection: false });
    expect(heldEditorSelection(editor)).toMatchObject({ from: 10, to: 110 });
  });

  it("Replace all, which leaves the selection alone, moves the hold with its text", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500);
    expect(replaceRanges(editor, [{ from: 3, to: 5 }], "xyz")).toBe(1);
    expect(heldEditorSelection(editor)).toMatchObject({ from: 11, to: 111, text: para(100) });
  });

  it("a mark added to other words keeps it", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(700);
    editor.view.dispatch(editor.state.tr.addMark(500, 600, editor.schema.marks.bold!.create()));
    expect(heldEditorSelection(editor)).toMatchObject({ from: 10, to: 110, text: para(100) });
  });

  // The hold is the student's choice of words, not of a place: once an edit has put the cursor somewhere else (an insert, Accept, Tab, typing),
  // the helpers read the whole document again, as v1 does (its savedRange follows every caret). The cases below failed before the hold ended here.
  it("an insert that moves the cursor ends the hold", () => {
    editor.commands.setTextSelection({ from: 10, to: 110 });
    blur();
    editor.commands.setTextSelection(500);
    editor.commands.insertContentAt(2000, "yy");
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("accepting an AI answer (it goes in at the end and the cursor follows) ends the hold, blurred or not", () => {
    editor.commands.setTextSelection({ from: 1, to: 3001 });
    blur(); // the Accept button took the focus
    insertAiText(editor, "Aim: to test it.", false, null);
    expect(heldEditorSelection(editor)).toBeNull();
    editor.commands.setTextSelection({ from: 1, to: 3001 });
    focus(); // Tab, with the document focused
    insertAiText(editor, "Aim: to test it.", false, null);
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("an answer that replaces the selection (Improve, Extend) ends the hold", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    blur();
    insertAiText(editor, "Better words.", true, { from: 1, to: 101, text: para(100) });
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("typing after the document is focused again does not bring the old hold back", () => {
    editor.commands.setTextSelection({ from: 1, to: 101 });
    blur();
    editor.commands.setTextSelection(200);
    focus();
    editor.view.dispatch(editor.state.tr.insertText("x"));
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("a selection of white space only is nothing", () => {
    editor.commands.setContent("<p>one two</p>");
    editor.commands.setTextSelection({ from: 4, to: 5 });
    expect(heldEditorSelection(editor)).toBeNull();
  });

  it("select all holds the whole document", () => {
    editor.commands.selectAll();
    expect(heldEditorSelection(editor)!.text).toBe(para(3000) + "\nSecond paragraph of the essay.");
  });

  it("an editor without the extension reads its live selection", () => {
    const bare = new Editor({ extensions: editorExtensions.filter((e) => e.name !== "heldSelection"), content: "<p>Some words here.</p>" });
    bare.commands.setTextSelection({ from: 1, to: 5 });
    expect(heldEditorSelection(bare)).toMatchObject({ text: "Some", from: 1, to: 5 });
    bare.commands.setTextSelection(3);
    expect(heldEditorSelection(bare)).toBeNull();
    bare.destroy();
  });
});

describe("helperScope", () => {
  it("is the held text, at any length (the builders cut at 12,000 and 6,000, as v1)", () => {
    const text = para(30000);
    expect(helperScope({ text }, "the whole document")).toEqual({ text, whole: false, chars: 30000 });
  });

  it("is the whole document with nothing held", () => {
    expect(helperScope(null, "  The whole document.  ")).toEqual({ text: "The whole document.", whole: true, chars: "The whole document.".length });
  });

  it("counts the trimmed text, and a blank held text means the whole document", () => {
    expect(helperScope({ text: "  hello there \n" }, "doc").chars).toBe(11);
    expect(helperScope({ text: " \n " }, "doc")).toEqual({ text: "doc", whole: true, chars: 3 });
  });
});
