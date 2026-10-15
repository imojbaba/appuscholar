import { describe, it, expect } from "vitest";
import { sanitizeHtml, wordCount } from "../src/sanitize";

describe("sanitizeHtml", () => {
  it("keeps ordinary document markup", () => {
    const html = '<h1>Title</h1><p>Hello <b>world</b> <a href="https://x.org">link</a></p><ul><li>a</li></ul><table><tr><td>1</td></tr></table>';
    const expected = '<h1>Title</h1><p>Hello <b>world</b> <a href="https://x.org">link</a></p><ul><li>a</li></ul><table><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(expected);
  });
  it("strips event handlers and script", () => {
    const out = sanitizeHtml('<p>ok</p><img src="x" onerror="fetch(1)"><script>alert(1)</script><svg onload="a()"></svg>');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onload");
    expect(out).toContain("<p>ok</p>");
  });
  it("drops javascript: and data: hrefs but keeps https", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><a href="https://ok.org">c</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text");
    expect(out).toContain('href="https://ok.org"');
  });
  it("allows images from blob storage and inline data images", () => {
    const out = sanitizeHtml('<img src="https://abc.public.blob.vercel-storage.com/x.png"><img src="data:image/png;base64,AAAA">');
    expect(out.match(/<img/g)?.length).toBe(2);
  });
});

describe("sanitizeHtml provenance mark", () => {
  it("keeps data-h on an ai-ins span, hard breaks included (rule 7)", () => {
    const html = '<p><span class="ai-ins" data-h="1xmanvp">a<br>b</span></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe("wordCount", () => {
  it("counts words of text content only", () => {
    expect(wordCount("<p>one two</p><p>three</p>")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
