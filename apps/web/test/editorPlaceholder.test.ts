// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensionsWith, setEditorPlaceholder } from "../lib/editorExtensions";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

describe("editor placeholder follows the interface language", () => {
  it("redraws the empty-document hint in place when the option changes", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const e = new Editor({ element: el, extensions: editorExtensionsWith(en.editor_placeholder), content: "" });
    const hint = () => el.querySelector("p.is-editor-empty")?.getAttribute("data-placeholder");
    expect(hint()).toBe(en.editor_placeholder);
    const before = e.view.dom;
    setEditorPlaceholder(e, hi.editor_placeholder);
    expect(hint()).toBe(hi.editor_placeholder);
    expect(e.view.dom).toBe(before);
    setEditorPlaceholder(e, en.editor_placeholder);
    expect(hint()).toBe(en.editor_placeholder);
    e.destroy();
  });
});
