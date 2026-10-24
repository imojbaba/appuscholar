import { describe, it, expect } from "vitest";
import { provHash, originCount, originShare, typedText, MIN_SAMPLE_WORDS } from "../src/origin";

describe("origin counting (v1 provCountDoc / computeOriginality)", () => {
  it("hashes ignoring whitespace like v1 provHash", () => {
    expect(provHash("a b c")).toBe(provHash("abc"));
    expect(provHash("abc")).toMatch(/^[0-9a-z]+$/);
  });
  it("counts words typed vs inside ai-ins spans, and kept vs edited by data-h", () => {
    const kept = `<span class="ai-ins" data-h="${provHash("one two")}">one two</span>`;
    const edited = `<span class="ai-ins" data-h="zzz">three four five</span>`;
    const r = originCount(`<p>mine here ${kept}</p><p>${edited} tail</p><p><span class="ai-ins">old</span></p>`);
    expect(r).toEqual({ typed: 3, ai: 6, passages: 3, kept: 1, edited: 1, unknown: 1 });
  });
  it("counts nested inline tags and <br> inside a span as part of it", () => {
    const r = originCount(`<p><span class="ai-ins" data-h="x">a <b>b</b><br>c</span> d</p>`);
    expect(r.ai).toBe(3); expect(r.typed).toBe(1);
  });
  it("hashes the decoded text content: tags dropped, <br> adds no space, entities decoded", () => {
    const h = provHash("a&b");
    expect(originCount(`<p><span class="ai-ins" data-h="${h}">a<b>&amp;</b><br>b</span></p>`).kept).toBe(1);
  });
  it("character share for the badge", () => {
    expect(originShare(`<p>abcd<span class="ai-ins" data-h="x">efgh</span></p>`)).toEqual({ total: 8, ai: 4, studentPct: 50 });
    expect(originShare("").studentPct).toBe(100);
  });
});

describe("typedText (v1 extractStudentText 3944, wave D writing-sample capture)", () => {
  it("drops the words inside span.ai-ins and keeps the student's own", () => {
    const r = typedText(`<p>mine here <span class="ai-ins" data-h="x">from the AI</span> and more</p>`);
    expect(r).toEqual({ text: "mine here and more", words: 4 });
  });
  it("drops an AI span's nested tags and a block inside an AI wrapper, not the text after it", () => {
    expect(typedText(`<p>a <span class="ai-ins"><b>x</b> <i>y</i><br>z</span> b</p><p>c</p>`).text).toBe("a b c");
    expect(typedText(`<div class="ai-ins"><p>gone</p><p>also gone</p></div><p>kept</p>`).text).toBe("kept");
  });
  it("separates blocks with a space (v1 joined them: <p>a</p><p>b</p> gave ab)", () => {
    expect(typedText("<p>one two</p><p>three</p>")).toEqual({ text: "one two three", words: 3 });
    expect(typedText("<h1>Title</h1><ul><li>first</li><li>second</li></ul><blockquote>quoted</blockquote>").text).toBe("Title first second quoted");
    expect(typedText("<table><tr><td>a</td><td>b</td></tr></table>").text).toBe("a b");
    expect(typedText("<p>line one<br>line two</p>").text).toBe("line one line two");
  });
  it("does not split a word at an inline tag", () => {
    expect(typedText("<p>un<b>believ</b><i>able</i> <a href=\"x\">link</a></p>")).toEqual({ text: "unbelievable link", words: 2 });
  });
  it("decodes entities and squeezes whitespace", () => {
    expect(typedText("<p>a&nbsp;&nbsp;b &amp; c &lt;d&gt; &quot;e&quot;</p>\n\n  <p>  f  </p>").text).toBe('a b & c <d> "e" f');
  });
  it("is empty for no text, an empty string or only AI text", () => {
    expect(typedText("")).toEqual({ text: "", words: 0 });
    expect(typedText("<p></p><p> </p>")).toEqual({ text: "", words: 0 });
    expect(typedText(`<p><span class="ai-ins">only ai</span></p>`)).toEqual({ text: "", words: 0 });
  });
  it("counts the words that the threshold is judged on: 29 is under, 30 is enough", () => {
    expect(MIN_SAMPLE_WORDS).toBe(30);
    const w = (n: number) => `<p>${Array.from({ length: n }, (_, i) => "w" + i).join(" ")}</p>`;
    expect(typedText(w(29)).words).toBe(29);
    expect(typedText(w(29)).words < MIN_SAMPLE_WORDS).toBe(true);
    expect(typedText(w(30)).words).toBe(30);
    expect(typedText(w(30)).words < MIN_SAMPLE_WORDS).toBe(false);
    // Two paragraphs of 15 are 30, not 29: the blocks are separated.
    expect(typedText(w(15) + w(15)).words).toBe(30);
  });
  it("leaves the counters as they were: a block tag changes neither originCount nor originShare", () => {
    expect(originCount("<p>a</p><p>b</p>").typed).toBe(2);
    expect(originShare("<p>ab</p><p>cd</p>")).toEqual({ total: 4, ai: 0, studentPct: 100 });
  });
});
