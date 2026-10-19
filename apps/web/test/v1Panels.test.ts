import { describe, it, expect } from "vitest";
import { applyV1Panels, decodeEntities, extractV1Panels } from "../scripts/extract-v1-panels.mjs";

// A miniature v1: one static HTML panel and one script, with the shapes the real extraction has to tell apart.
const HTML = [
  '<section class="card" data-panel="x"><div class="panel">',
  '  <h3 data-i18n="tab_x">Keyed title</h3>',
  '  <p class="desc">Plain &amp; simple text, <b>with bold</b> inside.</p>',
  '  <button id="rsGoBtn" title="Opens a new tab" data-i18n="x_go">Keyed button</button>',
  '  <button id="rsTermsBtn">Suggest terms</button>',
  '  <input id="rsTopic" placeholder="e.g. sleep and anxiety" data-i18n-placeholder="x_ph">',
  '  <input id="rsOther" placeholder="Type a topic" aria-label="Topic box">',
  '  <label>Kind <select id="rsDes"><option value="any">Any</option><option value="k" data-i18n="x_k">Keyed option</option></select></label>',
  '  <style>.ap-box{border:1px solid #ddd}</style>',
  '</div></section>',
].join("\n");
const JS = [
  "const AP_STAGES=[{k:'gap',name:'Gap and aim',ask:'What was missing?',brief:'the gap in the work',terms:'gap aim'}];",
  "const AP_STOP=new Set('what which this that with'.split(' '));",
  "function f(n,f){",
  "  const prompt='You are a careful teacher. Do the work.';",
  "  showToast('Reading '+f.name+'…');",
  "  if(R.none==='no DOIs')return h+'<div class=\"ap-box\"><b>Heads up.</b> Nothing was found.</div>';",
  "  x.innerHTML='<button id=\"apAskBtn\" class=\"btn btn-purple\" onclick=\"go()\">Ask</button>'+escHTML(d.title)+'<span class=\"ap-ok\">Found '+n+' of '+n2.total+'</span>';",
  "  callAI('You are helping a student. '+fieldName()+' read this.',{max:10});",
  "  const re=/it's \"quoted\"/g;  // a regex with quotes and an apostrophe in a comment: don't read it",
  "  return 'lowercase'+'x';",
  "}",
].join("\n");
const SRC = [HTML, JS].join("\n");
const WINDOWS = [
  { kind: "html" as const, prefix: "rs2", from: 1, to: HTML.split("\n").length },
  { kind: "js" as const, prefix: "ap2", from: HTML.split("\n").length + 1, to: SRC.split("\n").length },
];

describe("extractV1Panels", () => {
  const out = extractV1Panels(SRC, WINDOWS) as { en: Record<string, string>; manifest: Record<string, { lines: string; sha256: string }> };
  it("takes the literal text of elements that carry no data-i18n key, and leaves the keyed ones alone", () => {
    expect(Object.values(out.en)).not.toContain("Keyed title");
    expect(Object.values(out.en)).not.toContain("Keyed button");
    expect(Object.values(out.en)).not.toContain("Keyed option");
    expect(out.en.rs2_terms_btn).toBe("Suggest terms");
    expect(out.en.rs2_plain_simple_text_with).toBe("Plain & simple text, <b>with bold</b> inside.");
    expect(out.en.rs2_any).toBe("Any");
  });
  it("takes a title on a keyed element, and placeholders or aria-labels that have no key of their own", () => {
    expect(out.en.rs2_go_btn_title).toBe("Opens a new tab");
    expect(Object.values(out.en)).not.toContain("e.g. sleep and anxiety");
    expect(out.en.rs2_other_placeholder).toBe("Type a topic");
    expect(out.en.rs2_other_aria).toBe("Topic box");
  });
  it("names the AP_STAGES question and name by the stage key, and leaves the prompt words out", () => {
    expect(out.en.ap2_stage_gap_ask).toBe("What was missing?");
    expect(out.en.ap2_stage_gap_name).toBe("Gap and aim");
    expect(Object.values(out.en)).not.toContain("the gap in the work");
    expect(Object.values(out.en)).not.toContain("gap aim");
    expect(JSON.stringify(out.en)).not.toContain("careful teacher");
    expect(JSON.stringify(out.en)).not.toContain("helping a student");
    expect(JSON.stringify(out.en)).not.toContain("what which");
  });
  it("joins a plain identifier into {name}, keeps content out of the key, and skips values the code tests", () => {
    expect(out.en.ap2_reading).toBe("Reading {name}…");
    expect(out.en.ap2_heads_up_nothing_was).toBe("<b>Heads up.</b> Nothing was found.");
    expect(Object.values(out.en)).not.toContain("no DOIs");
    expect(out.en.ap2_ask_btn).toBe("Ask");
    expect(out.en.ap2_found_of).toBe("Found {n} of {total}");
    expect(Object.values(out.en)).not.toContain("lowercase");
  });
  it("records the v1 lines and the sha256 of exactly those lines", async () => {
    const { createHash } = await import("node:crypto");
    const lines = SRC.split("\n");
    for (const [k, m] of Object.entries(out.manifest)) {
      const [a, b] = m.lines.split("-").map(Number) as [number, number];
      expect(createHash("sha256").update(lines.slice(a - 1, b).join("\n")).digest("hex"), k).toBe(m.sha256);
    }
    expect(out.manifest.rs2_terms_btn?.lines).toBe("5-5");
    expect(out.manifest.ap2_stage_gap_ask?.lines).toBe("11-11");
    expect(Object.keys(out.manifest)).toEqual([...Object.keys(out.manifest)].sort());
  });
  it("is the same on every run", () => {
    expect(JSON.stringify(extractV1Panels(SRC, WINDOWS))).toBe(JSON.stringify(out));
  });
  it("gives Hindi the English text and throws when a key already exists", () => {
    const r = applyV1Panels({ a: "A" }, { a: "ए" }, out) as { en: Record<string, string>; hi: Record<string, string> };
    expect(r.hi.rs2_terms_btn).toBe("Suggest terms");
    expect(r.hi.a).toBe("ए");
    expect(() => applyV1Panels({ rs2_terms_btn: "x" }, {}, out)).toThrow(/collides/);
  });
  it("decodes entities", () => {
    expect(decodeEntities("A &amp; B &lt;i&gt; &#39;x&#39; &#x2014; &nbsp;")).toBe("A & B <i> 'x' —  ");
  });
});
