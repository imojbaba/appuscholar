// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildVivaPrompt } from "@appuscholar/core";
import en from "../messages/en.json";
import vivaEn from "../messages/tools/viva.en.json";
import type { VivaLog } from "../lib/blobs/kinds/viva";

/*
 * The Viva tab (Task E4; v1 vivaOpen/vivaAsk/vivaSave 3600-3631): who is asking, a question from the AI (gold-edged and labelled), an answer box with no AI help, Save my answer into the
 * viva_log blob (last 60). Rule 4: a viva question is never insertable into the document.
 */
const E = { ...(en as Record<string, string>), ...(vivaEn as Record<string, string>) };
const WORDS = (n: number) => Array.from({ length: n }, (_, i) => "word" + i).join(" ");
const TEXT = WORDS(40);

const h = vi.hoisted(() => ({
  text: "" as string,
  selection: "" as string,
  callAI: vi.fn(),
  toast: vi.fn(),
  log: null as null | VivaLog,
  blob: { loading: false, locked: false, broken: false, readOnly: false },
  setCalls: [] as unknown[],
  insert: {
    insertText: vi.fn(), insertBlock: vi.fn(), replaceInDocument: vi.fn(), rewriteDocument: vi.fn(), wrapSelection: vi.fn()
  },
  sug: { set: vi.fn(), setFeedback: vi.fn(), setThinking: vi.fn(), clear: vi.fn(), accept: vi.fn(), copy: vi.fn(), tab: vi.fn(), setEditor: vi.fn(), isCurrent: vi.fn() },
  confirm: vi.fn()
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", currentDoc: { id: "cur" } }) }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({ text: () => h.text, selection: () => h.selection, allDocuments: async () => [], ...h.insert })
}));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ sug: null, text: null, note: null, status: "idle", editor: null, ...h.sug }), SuggestionProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/ui/toast", () => ({ toast: (m: string) => h.toast(m) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [v, setV] = React.useState<VivaLog | null>(h.log);
      return {
        value: v, ...h.blob, flush: async () => true,
        set: (u: unknown) => { h.setCalls.push(kind); const n = typeof u === "function" ? (u as (p: unknown) => unknown)(v) : u; setV(n as VivaLog); h.log = n as VivaLog; }
      };
    }
  };
});

import { Panel } from "../components/tools/viva/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) { for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); } throw new Error("condition not reached"); }
async function mount(projectId = "p1") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="viva" projectId={projectId} />); });
  await until(() => !!tid("panel-viva"));
  await settle();
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function choose(el: HTMLSelectElement, value: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("change", { bubbles: true })); });
}
const get = () => click(tid("viva-get"));
const ask = async (q = "Why did you choose this sample?") => { h.callAI.mockResolvedValueOnce(q); await get(); await until(() => !!tid("viva-question")); };

beforeAll(async () => { await import("../components/tools/viva/VivaBody"); }, 120_000);
beforeEach(() => {
  h.text = TEXT; h.selection = ""; h.log = null; h.setCalls = [];
  h.blob = { loading: false, locked: false, broken: false, readOnly: false };
  h.callAI.mockReset(); h.toast.mockReset(); h.confirm.mockReset().mockReturnValue(true);
  for (const f of [...Object.values(h.insert), ...Object.values(h.sug)]) f.mockReset();
  vi.stubGlobal("confirm", h.confirm);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Viva: the question", () => {
  it("opens with who is asking (an examiner first, as v1), Get a question, and no answer box yet", async () => {
    await mount();
    expect($("h3")!.textContent).toBe(E.viva_heading);
    const sel = tid("viva-aud") as HTMLSelectElement;
    expect(sel.value).toBe("viva");
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([["viva", E.viva_aud_viva], ["conf", E.viva_aud_conf]]);
    expect(document.body.textContent).toContain(E.viva_aud);
    expect(tid("viva-get")!.textContent).toBe(E.viva_get);
    expect(tid("viva-answer")).toBeNull();
    expect(tid("viva-question")).toBeNull();
  });

  it("under 25 words says viva_need in the panel and sends nothing", async () => {
    h.text = WORDS(24);
    await mount();
    await get();
    expect(tid("viva-note")!.textContent).toBe(E.viva_need);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("sends exactly buildVivaPrompt(aud, text) with temperature 0.6 and 700 tokens, for the examiner and then for the panel", async () => {
    await mount();
    await ask("Q1?");
    expect(h.callAI).toHaveBeenCalledWith(buildVivaPrompt("viva", TEXT).prompt, { temp: 0.6, max: 700 });
    choose(tid("viva-aud") as HTMLSelectElement, "conf");
    await ask("Q2?");
    expect(h.callAI).toHaveBeenLastCalledWith(buildVivaPrompt("conf", TEXT).prompt, { temp: 0.6, max: 700 });
  });

  it("asks about the selection when there is one, else the whole document", async () => {
    h.selection = "  " + WORDS(30) + " ";
    await mount();
    await ask();
    expect(h.callAI.mock.calls[0]![0]).toBe(buildVivaPrompt("viva", WORDS(30)).prompt);
  });

  it("a selection of fewer than 25 words is refused even when the document is long (v1 counts selText)", async () => {
    h.selection = WORDS(10);
    await mount();
    await get();
    expect(tid("viva-note")!.textContent).toBe(E.viva_need);
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("shows the reading line while it waits, the button disabled, then the question with the gold edge and its label", async () => {
    let done!: (s: string) => void;
    h.callAI.mockReturnValueOnce(new Promise<string>((r) => { done = r; }));
    await mount();
    await get();
    expect(tid("viva-status")!.textContent).toBe(E.viva_reading);
    expect((tid("viva-get") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { done("  What is your sample size justification?  "); });
    const q = tid("viva-question")!;
    expect(q.classList.contains("ai-read")).toBe(true);
    expect(q.querySelector(".ai-read-label")!.textContent).toBe(E.viva_label);
    expect(tid("viva-q-text")!.textContent).toBe("What is your sample size justification?");
    expect(tid("viva-status")).toBeNull();
    expect((tid("viva-get") as HTMLButtonElement).disabled).toBe(false);
    expect(tid("viva-get")!.textContent).toBe(E.viva_another);
    expect(tid("viva-answer")).not.toBeNull();
  });

  it("an error shows its sentence in the panel and no answer box", async () => {
    h.callAI.mockRejectedValueOnce(new Error("Could not reach the AI provider."));
    await mount();
    await get();
    await until(() => !!tid("viva-note"));
    expect(tid("viva-note")!.textContent).toBe("Could not reach the AI provider.");
    expect(tid("viva-question")).toBeNull();
    expect(tid("viva-answer")).toBeNull();
    expect((tid("viva-get") as HTMLButtonElement).disabled).toBe(false);
  });

  it("another question replaces the question and empties the answer (v1 vivaAsk 3619)", async () => {
    await mount();
    await ask("First?");
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "my half answer");
    await ask("Second?");
    expect(tid("viva-q-text")!.textContent).toBe("Second?");
    expect((tid("viva-answer") as HTMLTextAreaElement).value).toBe("");
  });

  it("a reply that arrives after the panel went away is dropped (no state set on an unmounted tree)", async () => {
    let done!: (s: string) => void;
    h.callAI.mockReturnValueOnce(new Promise<string>((r) => { done = r; }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await mount();
    await get();
    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    await act(async () => { done("late"); });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("Viva: the answer and the log", () => {
  it("has a plain answer box with the v1 placeholder and no AI control beside it: the only buttons are Get a question and Save my answer", async () => {
    await mount();
    await ask();
    const box = tid("viva-answer") as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.placeholder).toBe(E.viva_ph);
    expect($$("button").map((b) => b.textContent!.trim())).toEqual([E.viva_another, E.viva_save]);
  });

  it("an empty answer says viva_empty and saves nothing", async () => {
    await mount();
    await ask();
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "   \n ");
    await click(tid("viva-save"));
    expect(tid("viva-note")!.textContent).toBe(E.viva_empty);
    expect(h.setCalls).toEqual([]);
  });

  it("Save my answer stores {t, aud, q, a} (trimmed) in viva_log, toasts Saved, clears the question and the answer, and shows the count", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    await mount();
    choose(tid("viva-aud") as HTMLSelectElement, "conf");
    await ask("  Why a survey?  ");
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "  Because it reaches many people.  ");
    await click(tid("viva-save"));
    expect(h.log).toEqual([{ t: 1_700_000_000_000, aud: "conf", q: "Why a survey?", a: "Because it reaches many people." }]);
    expect(h.setCalls).toEqual(["viva_log"]);
    expect(h.toast).toHaveBeenCalledWith("Saved");
    expect(tid("viva-question")).toBeNull();
    expect(tid("viva-answer")).toBeNull();
    expect(tid("viva-get")!.textContent).toBe(E.viva_get);
    expect(tid("viva-count")!.textContent).toBe(E.viva_count!.replace("{n}", "1"));
    vi.restoreAllMocks();
  });

  it("the count line shows the saved answers already there when the tab opens, and nothing when there are none", async () => {
    await mount();
    expect(tid("viva-count")).toBeNull();
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    h.log = Array.from({ length: 7 }, (_, i) => ({ t: i, aud: "viva" as const, q: "q", a: "a" }));
    await mount();
    expect(tid("viva-count")!.textContent).toBe(E.viva_count!.replace("{n}", "7"));
  });

  it("the saved log keeps only the last 60", async () => {
    h.log = Array.from({ length: 60 }, (_, i) => ({ t: i, aud: "viva" as const, q: "q" + i, a: "a" + i }));
    await mount();
    await ask("newest?");
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "newest answer");
    await click(tid("viva-save"));
    expect(h.log).toHaveLength(60);
    expect(h.log![0]!.q).toBe("q1");
    expect(h.log![59]).toMatchObject({ q: "newest?", a: "newest answer" });
    expect(tid("viva-count")!.textContent).toBe(E.viva_count!.replace("{n}", "60"));
  });

  it("while the saved answers are locked it says so and saves nothing; while they cannot be opened it asks first, and a No saves nothing", async () => {
    h.blob = { loading: false, locked: true, broken: false, readOnly: false };
    h.log = null;
    await mount();
    await ask();
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "an answer");
    await click(tid("viva-save"));
    expect(tid("viva-note")!.textContent).toBe(E.vault_save_locked);
    expect(h.setCalls).toEqual([]);
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    h.blob = { loading: false, locked: false, broken: true, readOnly: false };
    h.confirm.mockReturnValue(false);
    await mount();
    expect(tid("viva-broken")!.textContent).toBe(E.viva_broken);
    await ask();
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "an answer");
    await click(tid("viva-save"));
    expect(h.confirm).toHaveBeenCalledWith(E.viva_broken_confirm);
    expect(h.setCalls).toEqual([]);
    h.confirm.mockReturnValue(true);
    await click(tid("viva-save"));
    expect(h.setCalls).toEqual(["viva_log"]);
  });
});

describe("rule 4", () => {
  it("a viva question cannot be inserted into the document", async () => {
    await mount();
    await ask("Why did you pick this design?");
    typeIn(tid("viva-answer") as HTMLTextAreaElement, "Because it fits the question.");
    await click(tid("viva-save"));
    await ask("A second question?");
    // No document write of any kind, and nothing handed to the suggestion pane (whose Accept and Tab insert).
    for (const [name, fn] of Object.entries(h.insert)) expect(fn, name).not.toHaveBeenCalled();
    for (const [name, fn] of Object.entries(h.sug)) expect(fn, name).not.toHaveBeenCalled();
    // No insert, accept or add control in the panel: its buttons are Get a question / Another question and Save my answer, and no input or link offers one.
    expect($$("button").map((b) => b.textContent!.trim())).toEqual([E.viva_another, E.viva_save]);
    expect($$("a, [role='button'], input[type='button'], input[type='submit']")).toEqual([]);
    expect(document.body.textContent).not.toMatch(/\b(insert|accept|add to (my )?document)\b/i);
    expect(tid("viva-question")!.getAttribute("draggable")).not.toBe("true");
  });
});
