// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { BODY_LIMIT_PLAIN, BODY_LIMIT_SEALED, fitsBudget, sizeMessageKey } from "../lib/editor/sizeBudget";
import en from "../messages/en.json";
import { TOOL_MESSAGE_FILES } from "../messages/tools";

/** A minimal editor: all fitsBudget reads is the HTML. */
const stub = (length: number) => ({ getHTML: () => "x".repeat(length) }) as unknown as Editor;

describe("fitsBudget", () => {
  it("has the limits the api's 2.8 MB body cap leaves: 2.8 million characters as typed, 2.1 million before the vault's 4/3 growth", () => {
    expect(BODY_LIMIT_PLAIN).toBe(2_800_000);
    expect(BODY_LIMIT_SEALED).toBe(2_100_000);
    // Both bodies stay under the api's raw limit (apps/api/src/app.ts DEFAULT_MAX_BODY_BYTES), with room for the JSON around them.
    const apiCap = 2.8 * 1024 * 1024;
    expect(BODY_LIMIT_PLAIN).toBeLessThan(apiCap);
    expect(Math.ceil((BODY_LIMIT_SEALED * 4) / 3)).toBeLessThan(apiCap);
  });
  it("is false when the HTML plus the extra is over the sealed limit with the vault on, true under the plain limit with it off", () => {
    const e = stub(1_900_000);
    expect(fitsBudget(e, 300_000, true)).toBe(false);
    expect(fitsBudget(e, 300_000, false)).toBe(true);
    expect(fitsBudget(e, 100_000, true)).toBe(true);
    expect(fitsBudget(e, 900_001, false)).toBe(false);
  });
  it("includes the extra: a small document that gets a big picture does not fit", () => {
    const e = stub(100);
    expect(fitsBudget(e, 0, true)).toBe(true);
    expect(fitsBudget(e, BODY_LIMIT_SEALED, true)).toBe(false);
    expect(fitsBudget(e, BODY_LIMIT_PLAIN, false)).toBe(false);
  });
  it("with the vault on counts UTF-8 bytes, which the sealed body grows from: a long Hindi document reaches the limit sooner", () => {
    const e = { getHTML: () => "<p>" + "अ".repeat(150_000) + "</p>" + "A".repeat(1_900_000) } as unknown as Editor;
    expect(fitsBudget(e, 0, true)).toBe(false);
    expect(fitsBudget(e, 0, false)).toBe(true);
    const ascii = stub(2_049_999);
    expect(fitsBudget(ascii, 0, true)).toBe(true);
  });
  it("fits exactly at the limit and not one character over, for both vault states", () => {
    const e = stub(1_000_000);
    expect(fitsBudget(e, BODY_LIMIT_SEALED - 1_000_000, true)).toBe(true);
    expect(fitsBudget(e, BODY_LIMIT_SEALED - 1_000_000 + 1, true)).toBe(false);
    expect(fitsBudget(e, BODY_LIMIT_PLAIN - 1_000_000, false)).toBe(true);
    expect(fitsBudget(e, BODY_LIMIT_PLAIN - 1_000_000 + 1, false)).toBe(false);
  });
  it("counts the HTML of a real editor, markup included", () => {
    const e = new Editor({ extensions: editorExtensions, content: "<p>" + "a".repeat(1000) + "</p>" });
    const length = e.getHTML().length;
    expect(length).toBeGreaterThan(1000);
    expect(fitsBudget(e, BODY_LIMIT_SEALED - length, true)).toBe(true);
    expect(fitsBudget(e, BODY_LIMIT_SEALED - length + 1, true)).toBe(false);
    expect(fitsBudget(e, BODY_LIMIT_PLAIN - length, false)).toBe(true);
    expect(fitsBudget(e, BODY_LIMIT_PLAIN - length + 1, false)).toBe(false);
    e.destroy();
  });
  it("counts a picture already in the document, not only the one about to come", () => {
    const src = "data:image/jpeg;base64," + "A".repeat(2_000_000);
    const e = new Editor({ extensions: editorExtensions, content: `<p>Text</p><img src="${src}">` });
    expect(e.getHTML().length).toBeGreaterThan(2_000_000);
    expect(fitsBudget(e, 0, true)).toBe(true);
    expect(fitsBudget(e, 200_000, true)).toBe(false);
    expect(fitsBudget(e, 200_000, false)).toBe(true);
    e.destroy();
  });
});

describe("sizeMessageKey", () => {
  it("names a message in the pictures pair, in both languages, in plain words", () => {
    expect(sizeMessageKey).toBe("pic_too_big");
    const english = TOOL_MESSAGE_FILES["pictures.en.json"]!;
    const hindi = TOOL_MESSAGE_FILES["pictures.hi.json"]!;
    expect(english[sizeMessageKey]).toMatch(/too large/);
    expect(hindi[sizeMessageKey]).toBeTruthy();
    // The key is new: the base dictionary has no entry under it.
    expect(sizeMessageKey in (en as Record<string, string>)).toBe(false);
  });
});
