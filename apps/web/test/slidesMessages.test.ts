import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/tools/slides.en.json";
import hi from "../messages/tools/slides.hi.json";
import app from "../messages/en.json";

/* The Slides tab's own copy (Task E3): plain words, no emoji, no em-dash, sentence case; v1's `slides_generate_btn` is reused from en.json and its `slides_panel_desc`, which says a picture becomes its own slide, is not. */
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const keys = (d: Record<string, string>) => Object.keys(d).filter((k) => !k.startsWith("$"));

describe("slides.en.json", () => {
  it("has the panel's keys, each starting slides_, none of them one en.json already has (a clash throws at load)", () => {
    expect(keys(E).length).toBeGreaterThanOrEqual(9);
    for (const k of keys(E)) {
      expect(k.startsWith("slides_"), k).toBe(true);
      expect(Object.keys(app), k).not.toContain(k);
    }
  });
  it("has no emoji and no em-dash", () => {
    for (const [k, v] of Object.entries(E)) {
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v, k).not.toContain("—");
    }
  });
  it("corrects v1's description: H3 breaks too, the picture goes on the slide it sits under, only the first picture is used", () => {
    expect(E.slides_desc).toBe("Uses your Heading 1, 2 and 3 styles as slide breaks. The text under each heading becomes bullet points. A picture goes on the slide it sits under, and only the first picture on a slide is used. Add headings in the formatting bar if you have not yet.");
    expect((app as Record<string, string>).slides_panel_desc).toContain("any picture becomes its own slide");
  });
  it("keeps v1's sentence for an empty document", () => {
    expect(E.slides_empty).toBe("Write something in your document first, then come back here.");
  });
});

describe("slides.hi.json", () => {
  it("carries the DRAFT marker and exactly the English file's keys, each with its {placeholders}", () => {
    expect(H.$draft).toMatch(/^DRAFT: Hindi for Dr\. Sharma's review, reviewed by: /);
    expect(keys(H).sort()).toEqual(keys(E).sort());
    for (const k of keys(E)) expect((H[k]!.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((E[k]!.match(/\{\w+\}/g) ?? []).sort());
  });
});

describe("the module", () => {
  it("is turned on in the exact form the registry reads, and imports no library eagerly", () => {
    const src = readFileSync(join(__dirname, "../components/tools/slides/index.ts"), "utf8");
    expect(src).toContain("export const built = true;");
    expect(src).toContain('export { Panel } from "./Panel";');
    const build = readFileSync(join(__dirname, "../lib/tools/slides/buildPptx.ts"), "utf8");
    expect(build).not.toMatch(/^import .*pptxgenjs/m);
    expect(build).toContain('await import("pptxgenjs")');
  });
});
