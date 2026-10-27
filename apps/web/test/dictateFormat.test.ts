import { describe, expect, it } from "vitest";
import { DICTATION_LANGS, defaultDictationLang, dictErrorKey, dictErrorMessage, formatSpoken, placeSpoken } from "../lib/editor/dictate";

/*
 * Wave D Task 4: spoken punctuation and the capital and space rules of dictation, ported from v1 dictFormat and dictInsert (index.html 4257-4277).
 * Pure functions, so no DOM: the recogniser and the notice are in dictation.test.tsx.
 */

describe("DICTATION_LANGS", () => {
  it("lists the four v1 languages in v1 order, with the language names as labels", () => {
    expect(DICTATION_LANGS.map((l) => [l.code, l.label])).toEqual([
      ["en-IN", "English (India)"], ["hi-IN", "Hindi"], ["en-GB", "English (UK)"], ["en-US", "English (US)"]
    ]);
  });
  it("defaults to Hindi for a Hindi project and English (India) otherwise", () => {
    expect(defaultDictationLang("hi")).toBe("hi-IN");
    expect(defaultDictationLang("en")).toBe("en-IN");
    expect(defaultDictationLang(undefined)).toBe("en-IN");
  });
});

describe("formatSpoken: English", () => {
  it("turns each spoken command into its mark, taking the space in front of it", () => {
    expect(formatSpoken("a full stop b", "en-IN")).toBe("a. b");
    expect(formatSpoken("a comma b", "en-IN")).toBe("a, b");
    expect(formatSpoken("is it question mark", "en-IN")).toBe("is it?");
    expect(formatSpoken("wow exclamation mark", "en-IN")).toBe("wow!");
    expect(formatSpoken("wow exclamation point", "en-IN")).toBe("wow!");
    expect(formatSpoken("as follows colon one", "en-IN")).toBe("as follows: one");
    expect(formatSpoken("first semicolon second", "en-IN")).toBe("first; second");
  });
  it("makes new paragraph two line breaks and new line one, with no spaces left at the start of the next line", () => {
    expect(formatSpoken("hello new paragraph world", "en-IN")).toBe("hello\n\nworld");
    expect(formatSpoken("hello new line world", "en-IN")).toBe("hello\nworld");
    expect(formatSpoken("new paragraph hello", "en-IN")).toBe("\n\nhello");
    // v1 trims spaces and tabs only, so a break at the end stays.
    expect(formatSpoken("hello new paragraph", "en-IN")).toBe("hello\n\n");
    expect(formatSpoken("hello new line new line world", "en-IN")).toBe("hello\n\nworld");
  });
  it("does not match colon inside semicolon, nor a command that is only the start of a longer word", () => {
    expect(formatSpoken("a semicolon b", "en-IN")).toBe("a; b");
    expect(formatSpoken("a semicolon b", "en-IN")).not.toContain(":");
    expect(formatSpoken("a full stopper b", "en-IN")).toBe("a full stopper b");
    expect(formatSpoken("my commander", "en-IN")).toBe("my commander");
  });
  it("is case-insensitive", () => {
    expect(formatSpoken("A Full Stop B", "en-GB")).toBe("A. B");
    expect(formatSpoken("A COMMA B", "en-US")).toBe("A, B");
    expect(formatSpoken("A Question Mark", "en-IN")).toBe("A?");
    expect(formatSpoken("one NEW PARAGRAPH two", "en-IN")).toBe("one\n\ntwo");
  });
  it("handles several commands in one phrase, in v1's order, and trims the ends", () => {
    expect(formatSpoken("  one comma two full stop  ", "en-IN")).toBe("one, two.");
    expect(formatSpoken("what is it question mark new line next full stop", "en-US")).toBe("what is it?\nnext.");
    expect(formatSpoken("   ", "en-IN")).toBe("");
    expect(formatSpoken("", "en-IN")).toBe("");
  });
  it("leaves the Hindi commands alone", () => {
    expect(formatSpoken("मैं पूर्ण विराम", "en-IN")).toBe("मैं पूर्ण विराम");
  });
});

describe("formatSpoken: Hindi", () => {
  it("turns the four Hindi commands into their marks", () => {
    expect(formatSpoken("मैं पूर्ण विराम", "hi-IN")).toBe("मैं।");
    expect(formatSpoken("एक अल्प विराम दो", "hi-IN")).toBe("एक, दो");
    expect(formatSpoken("क्या प्रश्न चिह्न", "hi-IN")).toBe("क्या?");
    expect(formatSpoken("एक नई पंक्ति दो", "hi-IN")).toBe("एक\nदो");
  });
  it("accepts the command with or without the space inside it", () => {
    expect(formatSpoken("मैं पूर्णविराम", "hi-IN")).toBe("मैं।");
    expect(formatSpoken("एक अल्पविराम दो", "hi-IN")).toBe("एक, दो");
    expect(formatSpoken("क्या प्रश्नचिह्न", "hi-IN")).toBe("क्या?");
  });
  it("picks the Hindi list for any language code that starts with hi, and leaves English phrases alone", () => {
    expect(formatSpoken("मैं पूर्ण विराम", "hi")).toBe("मैं।");
    expect(formatSpoken("a full stop b", "hi-IN")).toBe("a full stop b");
  });
  it("has no word boundary, so a command glued to the next word still matches (v1)", () => {
    expect(formatSpoken("मैं पूर्ण विरामअगला", "hi-IN")).toBe("मैं।अगला");
  });
});

describe("placeSpoken", () => {
  it("capitalises the first letter at the start of a document", () => {
    expect(placeSpoken("hello", "", "en-IN")).toEqual({ text: "Hello", leadSpace: false });
  });
  it("capitalises after a full stop, a question mark or an exclamation mark, with or without the space typed", () => {
    expect(placeSpoken("next", "done. ", "en-IN")).toEqual({ text: "Next", leadSpace: false });
    expect(placeSpoken("next", "done.", "en-IN")).toEqual({ text: "Next", leadSpace: true });
    expect(placeSpoken("next", "really? ", "en-GB")).toEqual({ text: "Next", leadSpace: false });
    expect(placeSpoken("next", "wow!", "en-US")).toEqual({ text: "Next", leadSpace: true });
  });
  it("capitalises the first letter after a line break at the front of the phrase", () => {
    expect(placeSpoken("\n\nnext part", "some text", "en-IN")).toEqual({ text: "\n\nNext part", leadSpace: false });
    expect(placeSpoken("\nnext", "some text", "en-IN").text).toBe("\nNext");
  });
  it("does not capitalise in the middle of a sentence", () => {
    expect(placeSpoken("world", "hello", "en-IN")).toEqual({ text: "world", leadSpace: true });
    expect(placeSpoken("world", "hello ", "en-IN")).toEqual({ text: "world", leadSpace: false });
    expect(placeSpoken("again", "done, ", "en-IN").text).toBe("again");
  });
  it("never capitalises Hindi, and puts no space before the danda", () => {
    expect(placeSpoken("नमस्ते", "", "hi-IN")).toEqual({ text: "नमस्ते", leadSpace: false });
    expect(placeSpoken("hello", "", "hi-IN").text).toBe("hello");
    expect(placeSpoken("अगला", "पहला।", "hi-IN")).toEqual({ text: "अगला", leadSpace: true });
    expect(placeSpoken("।", "पहला", "hi-IN").leadSpace).toBe(false);
  });
  it("puts no space before closing punctuation or a line break", () => {
    for (const mark of [".", ",", "?", "!", ":", ";", "।", ")", "\n"]) {
      expect(placeSpoken(mark, "hello", "en-IN").leadSpace, JSON.stringify(mark)).toBe(false);
    }
    expect(placeSpoken(".", "hello", "en-IN")).toEqual({ text: ".", leadSpace: false });
  });
  it("puts no space at the very start, and none after a space or a line break already there", () => {
    expect(placeSpoken("word", "", "en-IN").leadSpace).toBe(false);
    expect(placeSpoken("word", "end ", "en-IN").leadSpace).toBe(false);
    expect(placeSpoken("word", "end\n", "en-IN").leadSpace).toBe(false);
  });
  it("gives back empty text unchanged, with no space", () => {
    expect(placeSpoken("", "hello", "en-IN")).toEqual({ text: "", leadSpace: false });
  });
  it("is what a spoken phrase becomes at the caret: format, then place", () => {
    const put = (raw: string, before: string, lang = "en-IN") => { const p = placeSpoken(formatSpoken(raw, lang), before, lang); return (p.leadSpace ? " " : "") + p.text; };
    expect(put("hello full stop", "")).toBe("Hello.");
    expect(put("next one", "Hello.")).toBe(" Next one");
    expect(put("comma and more", "Hello")).toBe(", and more");
    expect(put("new paragraph start again", "Hello.")).toBe("\n\nStart again");
    // v1 capitalises only the front of a phrase: a full stop inside it does not capitalise the words after it.
    expect(put("hello full stop next one", "")).toBe("Hello. next one");
  });
});

describe("dictErrorKey", () => {
  it("maps the five browser error codes to their own sentence and any other code to the generic one", () => {
    expect(dictErrorKey("not-allowed")).toBe("dict_err_not_allowed");
    expect(dictErrorKey("service-not-allowed")).toBe("dict_err_service");
    expect(dictErrorKey("network")).toBe("dict_err_network");
    expect(dictErrorKey("audio-capture")).toBe("dict_err_audio");
    expect(dictErrorKey("language-not-supported")).toBe("dict_err_lang");
    expect(dictErrorKey("bad-grammar")).toBe("dict_err_other");
    expect(dictErrorKey("")).toBe("dict_err_other");
    expect(dictErrorKey("constructor")).toBe("dict_err_other");
  });
  it("dictErrorMessage asks t() for that key and hands over the code, or 'unknown' when there is none", () => {
    const t = (key: string, vars?: Record<string, string | number>) => key + "|" + JSON.stringify(vars ?? {});
    expect(dictErrorMessage("network", t)).toBe('dict_err_network|{"code":"network"}');
    expect(dictErrorMessage("bad-grammar", t)).toBe('dict_err_other|{"code":"bad-grammar"}');
    expect(dictErrorMessage("", t)).toBe('dict_err_other|{"code":"unknown"}');
  });
});
