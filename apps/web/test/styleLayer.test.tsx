// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { styleFeatures, type StyleSample } from "@appuscholar/core";

type B = { value: unknown; loading: boolean; locked: boolean; broken?: boolean };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, B>,
  opened: [] as Array<[string, string | null]>,
  status: "off" as string
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (kind: string, id: string | null) => {
    h.opened.push([kind, id]);
    if (id === null) return { value: null, loading: false, locked: false, set: () => {}, flush: async () => true, readOnly: false };
    return { ...(h.blobs[kind] ?? { value: null, loading: false, locked: false }), set: () => {}, flush: async () => true, readOnly: false };
  }
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.status }) }));

import { DocumentLayer } from "../components/tools/style/DocumentLayer";
import { runWritingAction, type ActionDeps } from "../lib/ai/actions";
import { clearCurrentStyle, currentStylePrompt } from "../lib/tools/style/current";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
function render(projectId = "p1"): Root {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  roots.push(r);
  act(() => r.render(<DocumentLayer projectId={projectId} />));
  return r;
}
const profile = (on: boolean, text = "- Warm, reflective tone.\n- Medium-length sentences."): B => ({ value: { profile: text, on }, loading: false, locked: false });
const level = { score: 5, k: "general", date: "2026-10-21" };

beforeEach(() => {
  h.blobs = { style_profile: profile(true), style_samples: { value: [], loading: false, locked: false }, style_meta: { value: {}, loading: false, locked: false } };
  h.opened = [];
  h.status = "off";
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  clearCurrentStyle("p1");
});

/** Fakes for the writing buttons: the prompt that goes to the AI and the note that comes back are what these tests read. */
function deps(over: Partial<ActionDeps> = {}) {
  const sent: string[] = [];
  const sets: Array<{ text: string; note: { msg: string; warn: boolean } | null }> = [];
  const d: ActionDeps = {
    callAI: async (prompt) => { sent.push(prompt); return "A longer answer follows here."; },
    hasSelection: () => true, selectionText: () => "The students wrote careful notes.", selectionRange: () => null, tailText: () => "The students wrote careful notes and then",
    setThinking: () => 1, isCurrent: () => true, set: (text, note) => { sets.push({ text, note }); }, setFeedback: () => {}, clear: () => {}, toast: () => {}, t: (k) => k,
    draftFirst: false, ...over
  };
  return { d, sent, sets };
}

describe("Continue, Improve and Extend carry My style (ledger ruling R3)", () => {
  it("Continue's prompt carries the profile only when the toggle is on", async () => {
    render();
    const on = deps();
    await runWritingAction("continue", on.d);
    expect(on.sent[0]).toContain("STYLE NOTES (they describe the author's voice only");
    expect(on.sent[0]).toContain("- Warm, reflective tone.\n- Medium-length sentences.");
    expect(on.sent[0]).toContain("Match this voice in tone, rhythm and word choice.");

    h.blobs.style_profile = profile(false);
    render();
    // A second layer for the same project reads the toggle off and replaces the snapshot.
    const off = deps();
    await runWritingAction("continue", off.d);
    expect(off.sent[0]).not.toContain("STYLE NOTES");
    expect(off.sent[0]).not.toContain("Warm, reflective tone");
  });
  it("Improve and Extend carry it too, and the ten-word level adds v1's vocabulary rule", async () => {
    h.blobs.style_meta = { value: { vocab_level: level }, loading: false, locked: false };
    render();
    for (const kind of ["improve", "expand"] as const) {
      const x = deps();
      await runWritingAction(kind, x.d);
      expect(x.sent[0]).toContain("STYLE NOTES");
      expect(x.sent[0]).toContain("\nVOCABULARY: Use plain academic vocabulary.");
    }
  });
  it("a style given in the deps wins over the layer's, and Draft first writes nothing and sends no style", async () => {
    render();
    const own = deps({ stylePrompt: "\n\nSTYLE NOTES (own)" });
    await runWritingAction("continue", own.d);
    expect(own.sent[0]).toContain("STYLE NOTES (own)");
    expect(own.sent[0]).not.toContain("Warm, reflective tone");
    const df = deps({ draftFirst: true, tailText: () => "The students wrote careful notes and then they compared them with the notes of their teacher, who had written a longer account of the same lesson last year." });
    await runWritingAction("continue", df.d);
    expect(df.sent[0]).not.toContain("STYLE NOTES");
    expect(df.sets).toHaveLength(0);
  });
  it("with no layer mounted the style is off", async () => {
    const x = deps();
    await runWritingAction("continue", x.d);
    expect(x.sent[0]).not.toContain("STYLE NOTES");
  });
  it("with My style on and 150 words of the student's own, the accuracy note names longer words that are not theirs (v1 sugNoteFull)", async () => {
    const vw = Array.from({ length: 160 }, (_, i) => "known" + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + ((i >> 2) % 26)) + String.fromCharCode(97 + ((i >> 4) % 26)) + "word");
    const sample: StyleSample = { id: "s1", name: "a.txt", date: "2026-10-21", ...styleFeatures("A short plain text."), vw };
    h.blobs.style_samples = { value: [sample], loading: false, locked: false };
    render();
    const x = deps({ callAI: async () => "The remarkably extraordinary students wrote careful notes." });
    await runWritingAction("improve", x.d);
    expect(x.sets[0]!.note!.msg).toContain("Longer words that do not appear in your own writing: remarkably, extraordinary.");
    expect(x.sets[0]!.note!.warn).toBe(true);
    h.blobs.style_profile = profile(false);
    render();
    const y = deps({ callAI: async () => "The remarkably extraordinary students wrote careful notes." });
    await runWritingAction("improve", y.d);
    expect(y.sets[0]!.note!.msg).not.toContain("Longer words");
  });
});

describe("the DocumentLayer sets and clears the getter", () => {
  it("renders nothing, sets the prompt for its project, and clears it when it goes away", () => {
    const r = render();
    expect(document.body.textContent).toBe("");
    expect(currentStylePrompt()).toContain("Warm, reflective tone");
    act(() => r.unmount());
    roots.splice(0);
    expect(currentStylePrompt()).toBeUndefined();
  });
  it("clears when the vault is locked, and does not open the blobs then (it never asks for the passphrase)", () => {
    h.status = "locked";
    render();
    expect(currentStylePrompt()).toBeUndefined();
    expect(h.opened.every(([, id]) => id === null)).toBe(true);
  });
  it("clears for a blob that is locked or does not open, and for a project that is not known yet", () => {
    h.blobs.style_samples = { value: null, loading: false, locked: true };
    render();
    expect(currentStylePrompt()).toBeUndefined();
    clearCurrentStyle("p1");
    h.blobs.style_samples = { value: null, loading: false, locked: false, broken: true };
    render();
    expect(currentStylePrompt()).toBeUndefined();
    h.blobs.style_samples = { value: [], loading: false, locked: false };
    render("");
    expect(currentStylePrompt()).toBeUndefined();
  });
  it("reads all three style blobs of the project", () => {
    render("p9");
    expect(new Set(h.opened.filter(([, id]) => id === "p9").map(([k]) => k))).toEqual(new Set(["style_profile", "style_samples", "style_meta"]));
    clearCurrentStyle("p9");
  });
});
