// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS, aiuBuildV2, aiuInRange, classifyAiUse, buildIdeaPromptV2, type AiuEntry } from "@appuscholar/core";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task A4, the AI-use statement tab (v1 aiuOpen, aiuRender, aiuBuild, aiuCopy, aiuInsert, aiuDownload 5411-5568 and the dialog 1888-1910). The text is
 * core's aiuBuildV2 (aiuBuild with the two where-the-log-is-kept sentences made true, D-S2-58): the panel passes it the log, the ticks and the style and adds nothing, so each expected statement is core's own output for the same
 * input. The log is a fake GET /ai/log; the style blobs are an in-memory store (absent unless a test puts them there).
 */

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  sets: [] as Array<{ kind: string; value: unknown }>,
  loading: false,
  locked: false,
  broken: false,
  error: false,
  log: [] as unknown[],
  logFails: 0,
  gate: null as Promise<void> | null,
  paths: [] as string[],
  settings: {} as Record<string, unknown>,
  update: vi.fn(async () => undefined),
  inserts: [] as Array<{ html: string; opts: unknown }>,
  insertResult: true,
  downloads: [] as Array<{ name: string; blob: Blob }>,
  toast: vi.fn(),
  copy: vi.fn(async (_s: string) => undefined)
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/aiuse" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: (name: string, blob: Blob) => { h.downloads.push({ name, blob }); } }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {},
  apiFetch: async (path: string) => {
    h.paths.push(path);
    if (h.gate) await h.gate;
    if (h.logFails > 0) { h.logFails--; throw new Error("503"); }
    return h.log;
  }
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: null, settings: h.settings, update: h.update, reload: async () => undefined }) }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({
    insertBlock: async (html: string, opts?: unknown) => { h.inserts.push({ html, opts }); return h.insertResult; }
  })
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (kind: string) => ({
    value: h.store.has(kind) ? h.store.get(kind) : null,
    loading: h.loading, locked: h.locked, broken: h.broken, error: h.error, readOnly: false,
    set: (next: unknown) => { h.sets.push({ kind, value: next }); },
    flush: async () => true
  })
}));

import { AiUse } from "../components/tools/design/AiUse";
import { Panel } from "../components/tools/design/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
// The kind first run's idea check is logged under: core's label for the very prompt first run sends (so this breaks if the label or the prompt changes).
const FIRST_RUN = classifyAiUse(buildIdeaPromptV2("psychology", { topic: "Sleep and memory in students" }).prompt)!.k;
const e = (d: string, k: string, g: string, p = "groq", m = "openai/gpt-oss-120b"): AiuEntry => ({ d, p, m, k, g });
const LOG: AiuEntry[] = [
  e("2026-10-01", "grammar and polish", "text"),
  e("2026-10-05", "grammar and polish", "text"),
  e("2026-10-05", "summarising a paper", "explain", "gemini", "gemini-3.8-flash"),
  e("2026-10-09", "feedback on my draft", "feedback")
];
const TICKS_OFF = { own: false, reword: false, cite: false, facts: false, noData: false };
/** What the page starts with: the "I planned" tick on, as v1's dialog (aiuOwn is `checked`). */
const TICKS_DEFAULT = { ...TICKS_OFF, own: true };
const ALL = (list: AiuEntry[]): Record<string, 1> => Object.fromEntries(list.map((x) => [x.k, 1 as const]));

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const text = (id: string) => $(id)?.textContent ?? null;
async function render(ui: React.ReactElement = <AiUse projectId="p1" />): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui); });
  return root;
}
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); };
async function set(id: string, value: string) {
  const el = $(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const textOf = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
const out = () => ($("aiu-out") as HTMLTextAreaElement).value;
const rows = () => $$('[data-testid^="aiu-row-"]').map((r) => r.getAttribute("data-k"));
const escaped = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>");

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.paths.length = 0; h.inserts.length = 0; h.downloads.length = 0;
  h.loading = false; h.locked = false; h.broken = false; h.error = false;
  h.log = LOG; h.logFails = 0; h.gate = null; h.settings = {}; h.insertResult = true;
  h.update.mockClear(); h.toast.mockClear(); h.copy.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: h.copy }, configurable: true });
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AI-use statement (Task A4): the log", () => {
  it("reads this project's log, shows the kinds in range with their counts, all ticked, most used first", async () => {
    await render();
    expect(h.paths).toEqual(["/ai/log?projectId=p1"]);
    expect(rows()).toEqual(["grammar and polish", "summarising a paper", "feedback on my draft"]);
    const labels = $$('[data-testid^="aiu-row-"]').map((r) => r.closest("label")!.textContent);
    expect(labels).toEqual(["Grammar and polish (2)", "Summarising a paper (1)", "Feedback on my draft (1)"]);
    for (const r of $$('[data-testid^="aiu-row-"]')) expect((r as HTMLInputElement).checked).toBe(true);
    expect(text("aiu-count")).toBe("Requests logged for this project: 4. In the dates below: 4.");
    // v1's dates start at the log's first and last day.
    expect(($("aiu-from") as HTMLInputElement).value).toBe("2026-10-01");
    expect(($("aiu-to") as HTMLInputElement).value).toBe("2026-10-09");
  });

  it("range filtering is core's aiuInRange: the rows, the count and the statement follow the dates", async () => {
    await render();
    await set("aiu-to", "2026-10-05");
    const list = aiuInRange(LOG, "2026-10-01", "2026-10-05");
    expect(list).toHaveLength(3);
    expect(rows()).toEqual(["grammar and polish", "summarising a paper"]);
    expect(text("aiu-count")).toBe("Requests logged for this project: 4. In the dates below: 3.");
    await click("aiu-build");
    expect(out()).toBe((aiuBuildV2({ list, keep: ALL(list), other: "", fmt: "course", ticks: TICKS_DEFAULT, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string }).text);
    // A cleared date is no limit (v1: an empty box).
    await set("aiu-to", "");
    await set("aiu-from", "2026-10-06");
    expect(rows()).toEqual(["feedback on my draft"]);
    await set("aiu-from", "2026-11-01");
    expect(rows()).toEqual([]);
    expect(text("aiu-none")).toBe("The log has no requests in these dates.");
  });

  it("changing the dates ticks every kind again, as v1 redraws the rows", async () => {
    await render();
    await click("aiu-row-0");
    expect(($("aiu-row-0") as HTMLInputElement).checked).toBe(false);
    await set("aiu-to", "2026-10-09");
    await set("aiu-from", "2026-10-02");
    for (const r of $$('[data-testid^="aiu-row-"]')) expect((r as HTMLInputElement).checked).toBe(true);
  });

  it("a log that cannot be read says so in words, builds nothing, and Try again reads it again", async () => {
    h.logFails = 1;
    await render();
    expect(text("aiu-log-msg")).toBe(E.design_aiu_read_failed);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(true);
    expect(rows()).toEqual([]);
    await click("aiu-retry");
    expect(h.paths).toHaveLength(2);
    expect(text("aiu-log-msg")).toBe("");
    expect(rows()).toHaveLength(3);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a log that is not a list is an unreadable log, not an empty one", async () => {
    h.log = { error: "x" } as unknown as unknown[];
    await render();
    expect(text("aiu-log-msg")).toBe(E.design_aiu_read_failed);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Build is not offered while the log is still being read, and the page says it is reading", async () => {
    let open!: () => void;
    h.gate = new Promise<void>((r) => { open = r; });
    await render();
    expect(text("aiu-log-msg")).toBe(E.design_aiu_loading);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { open(); });
    expect(text("aiu-log-msg")).toBe("");
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(false);
  });

  it("an empty log is said in words; with the log on, a statement that no AI was used is core's, with its bracket to check", async () => {
    h.log = [];
    await render();
    expect(text("aiu-count")).toBe(E.design_aiu_empty);
    expect(rows()).toEqual([]);
    await click("aiu-build");
    const built = aiuBuildV2({ list: [], keep: {}, other: "", fmt: "course", ticks: TICKS_DEFAULT, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string };
    expect(out()).toBe(built.text);
    expect(out()).toContain("[Check this against your own records.");
  });

  it("with logging off the page says nothing is being recorded", async () => {
    h.log = [];
    h.settings = { aiLogOff: true };
    await render();
    expect(text("aiu-count")).toBe(E.design_aiu_off);
  });

  it("Keep the log is settings.aiLogOff, inverted", async () => {
    await render();
    const keep = $("aiu-keep") as HTMLInputElement;
    expect(keep.checked).toBe(true);
    await click("aiu-keep");
    expect(h.update).toHaveBeenCalledWith({ aiLogOff: true });
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.settings = { aiLogOff: true };
    await render();
    expect(($("aiu-keep") as HTMLInputElement).checked).toBe(false);
    await click("aiu-keep");
    expect(h.update).toHaveBeenLastCalledWith({ aiLogOff: false });
  });

  it("no project open: nothing is read", async () => {
    await render(<AiUse projectId="" />);
    expect(h.paths).toEqual([]);
    expect(text("aiu-log-msg")).toBe(E.design_aiu_no_project);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AI-use statement (Task A4): the statement", () => {
  it("it refuses 'no AI' while the log has rows: rows in range, all unticked, no other tools -> core's refusal and no statement", async () => {
    await render();
    for (const i of [0, 1, 2]) await click("aiu-row-" + i);
    await click("aiu-build");
    expect(text("aiu-refuse")).toBe("The log shows 4 requests in these dates. Tick them, or change the dates, before you say that no AI was used.");
    expect(out()).toBe("");
    expect(h.inserts).toHaveLength(0);
    // Nothing on the page offers a no-AI statement (the only way to one is an empty log).
    expect($$("button").map((b) => b.textContent).join("|").toLowerCase()).not.toContain("no ai");
    // One ticked row clears the refusal and builds.
    await click("aiu-row-0");
    await click("aiu-build");
    expect(text("aiu-refuse")).toBe("");
    expect(out()).toContain("I used Appuscholar");
    expect(out()).not.toContain("I did not use AI tools");
  });

  it("the same refusal for one request is singular, and other tools used outside Appuscholar lift it", async () => {
    h.log = [e("2026-10-01", "grammar and polish", "text")];
    await render();
    await click("aiu-row-0");
    await click("aiu-build");
    expect(text("aiu-refuse")).toBe("The log shows 1 request in these dates. Tick them, or change the dates, before you say that no AI was used.");
    await set("aiu-other", "Grammarly for spelling.");
    await click("aiu-build");
    expect(text("aiu-refuse")).toBe("");
    expect(out()).toContain("I also used Grammarly for spelling.");
  });

  it("it names first run's idea check: the kind is core's plain label, ticked by default, and the statement says it", async () => {
    // First run's check is logged with k "checking whether my project idea is realistic" (group feedback) and claimed for the project when it is saved.
    h.log = [e("2026-10-21", FIRST_RUN, "feedback")];
    await render();
    expect(FIRST_RUN).toBe("checking whether my project idea is realistic");
    expect(rows()).toEqual([FIRST_RUN]);
    expect(($("aiu-row-0") as HTMLInputElement).checked).toBe(true);
    expect($("aiu-row-0")!.closest("label")!.textContent).toBe("Checking whether my project idea is realistic (1)");
    await click("aiu-build");
    // What core writes for that kind (the text of the project export's statement too): the kind inside the "commented on my work" sentence.
    expect(out()).toContain("The AI commented on my work or ideas without writing them: checking whether my project idea is realistic (1 request).");
    expect(out()).toContain("on 21 October 2026");
    expect(out()).not.toContain("I did not use AI tools");
  });

  it("the statement for course, thesis and journal equals aiuBuildV2's output for the same input (the panel adds nothing)", async () => {
    await render();
    await click("aiu-cite");
    await click("aiu-facts");
    await set("aiu-other", "Grammarly for spelling. ");
    for (const fmt of ["course", "thesis", "journal"] as const) {
      await set("aiu-fmt", fmt);
      await click("aiu-build");
      const want = aiuBuildV2({ list: LOG, keep: ALL(LOG), other: "Grammarly for spelling. ", fmt, ticks: { ...TICKS_DEFAULT, cite: true, facts: true }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string };
      expect(out(), fmt).toBe(want.text);
    }
    expect(out()).toMatch(/^Declaration of AI use\n\n/);
  });

  it("each tick feeds core: all five true, and unticked rows leave their requests out", async () => {
    await render();
    for (const id of ["aiu-reword", "aiu-cite", "aiu-facts", "aiu-nodata"]) await click(id);
    await click("aiu-own");
    await click("aiu-row-1");
    await click("aiu-build");
    const list = LOG;
    const keep = { "grammar and polish": 1, "feedback on my draft": 1 } as Record<string, 1>;
    const want = aiuBuildV2({ list, keep, other: "", fmt: "course", ticks: { own: false, reword: true, cite: true, facts: true, noData: true }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string };
    expect(out()).toBe(want.text);
    expect(out()).not.toContain("summarising a paper");
  });

  it("v1's defaults: only 'I planned the argument' is ticked, the style is coursework", async () => {
    await render();
    expect(($("aiu-own") as HTMLInputElement).checked).toBe(true);
    for (const id of ["aiu-reword", "aiu-cite", "aiu-facts", "aiu-nodata"]) expect(($(id) as HTMLInputElement).checked, id).toBe(false);
    expect(($("aiu-fmt") as HTMLSelectElement).value).toBe("course");
    expect($$('[data-testid="aiu-fmt"] option').map((o) => o.getAttribute("value"))).toEqual(["course", "thesis", "journal"]);
  });

  it("style absent: no style sentence, and looking at the page writes nothing", async () => {
    await render();
    await click("aiu-build");
    expect(out()).not.toContain("writing style");
    expect(h.sets).toEqual([]);
    expect(text("aiu-style-note")).toBe("");
  });

  it("style present (Use my style on, declared, with samples): the style sentence is core's", async () => {
    h.store.set("style_profile", { profile: "plain", on: true });
    h.store.set("style_meta", { decl: "2026-10-03" });
    h.store.set("style_samples", [{ id: "a" }, { id: "b" }]);
    await render();
    await click("aiu-build");
    const want = aiuBuildV2({ list: LOG, keep: ALL(LOG), other: "", fmt: "course", ticks: TICKS_DEFAULT, style: { on: true, decl: "2026-10-03", samples: 2 }, providers: PROVIDERS }) as { text: string };
    expect(out()).toBe(want.text);
    expect(out()).toContain("A profile of my own writing style, built from 2 samples that I declared as my own work on 3 October 2026, was used to match the wording of AI suggestions.");
  });

  it("style off, undeclared or without samples gives no sentence", async () => {
    const cases: Array<[unknown, unknown, unknown]> = [
      [{ profile: "x", on: false }, { decl: "2026-10-03" }, [{ id: "a" }]],
      [{ profile: "x", on: true }, {}, [{ id: "a" }]],
      [{ profile: "x", on: true }, { decl: "2026-10-03" }, []],
      [null, { decl: "2026-10-03" }, [{ id: "a" }]]
    ];
    for (const [p, m, s] of cases) {
      h.store.clear();
      if (p) h.store.set("style_profile", p);
      h.store.set("style_meta", m);
      h.store.set("style_samples", s);
      await render();
      await click("aiu-build");
      expect(out()).not.toContain("writing style");
      for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("a style record that is locked or unread stops the build, in words; one that does not open is said and the statement leaves it out", async () => {
    h.store.set("style_profile", { profile: "plain", on: true });
    h.locked = true;
    await render();
    expect(text("aiu-style-note")).toBe(E.design_aiu_style_wait);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(true);
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.locked = false; h.broken = true;
    await render();
    expect(text("aiu-style-note")).toBe(E.design_aiu_style_broken);
    expect(($("aiu-build") as HTMLButtonElement).disabled).toBe(false);
    await click("aiu-build");
    expect(out()).not.toContain("writing style");
  });

  it("the statement box is editable and a refusal leaves what is in it", async () => {
    await render();
    await click("aiu-build");
    await set("aiu-out", "My own words.");
    expect(out()).toBe("My own words.");
    for (const i of [0, 1, 2]) await click("aiu-row-" + i);
    await click("aiu-build");
    expect(text("aiu-refuse")).toContain("The log shows 4 requests");
    expect(out()).toBe("My own words.");
  });
});

describe("AI-use statement (Task A4): where the log is kept (D-S2-58)", () => {
  it("the empty-log statement and the thesis statement say the log is in the account and per project, never 'in this browser'", async () => {
    h.log = [];
    await render();
    await click("aiu-build");
    expect(out()).toContain("The log only knows about Appuscholar, and only about this project.");
    expect(out()).not.toContain("in this browser");
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.log = LOG;
    await render();
    await set("aiu-fmt", "thesis");
    await click("aiu-build");
    expect(out()).toContain("The log is kept in my Appuscholar account and I can show it to my supervisor on request.");
    expect(out()).not.toContain("kept in my browser");
  });

  it("the tab says the statement covers this project's log only, whatever state the log is in", async () => {
    await render();
    expect(text("aiu-scope")).toBe(E.design_aiu_scope);
    expect(E.design_aiu_scope).toContain("this project's log only");
    expect(E.design_aiu_scope).toContain("no project open");
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.logFails = 1;
    await render();
    expect(text("aiu-scope")).toBe(E.design_aiu_scope);
  });
});

describe("AI-use statement (Task A4): Copy, Insert and Download", () => {
  it("each is off until a statement is built", async () => {
    await render();
    for (const id of ["aiu-copy", "aiu-insert", "aiu-download"]) expect(($(id) as HTMLButtonElement).disabled, id).toBe(true);
    await click("aiu-build");
    for (const id of ["aiu-copy", "aiu-insert", "aiu-download"]) expect(($(id) as HTMLButtonElement).disabled, id).toBe(false);
  });

  it("Copy writes the edited text to the clipboard and says so inline", async () => {
    await render();
    await click("aiu-build");
    await set("aiu-out", "Edited statement.\nSecond line.");
    await click("aiu-copy");
    expect(h.copy).toHaveBeenCalledWith("Edited statement.\nSecond line.");
    expect(text("aiu-action-msg")).toBe(E.design_aiu_copied);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("Copy that the browser refuses says so inline", async () => {
    h.copy.mockRejectedValueOnce(new Error("denied"));
    await render();
    await click("aiu-build");
    await click("aiu-copy");
    expect(text("aiu-action-msg")).toBe(E.design_aiu_copy_failed);
  });

  it("Insert puts the text once at the end of the document as plain text, and says Inserted", async () => {
    await render();
    await click("aiu-build");
    await set("aiu-out", "Line <one> & \"two\"\nline 3");
    await click("aiu-insert");
    expect(h.inserts).toHaveLength(1);
    // The helper's default position is the end of the document; no position is passed.
    expect(h.inserts[0]!.opts).toBeUndefined();
    expect(h.inserts[0]!.html).toBe(escaped("Line <one> & \"two\"\nline 3"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.design_inserted);
  });

  it("Insert that the document cannot take says so next to the button and shows no toast", async () => {
    h.insertResult = false;
    await render();
    await click("aiu-build");
    await click("aiu-insert");
    expect(text("aiu-action-msg")).toBe(E.design_insert_failed);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("Download saves the edited text as ai-use-statement.txt (text/plain) and says its name", async () => {
    await render();
    await click("aiu-build");
    await set("aiu-out", "Edited statement.");
    await click("aiu-download");
    expect(h.downloads).toHaveLength(1);
    const d = h.downloads[0]!;
    expect(d.name).toBe("ai-use-statement.txt");
    expect(d.blob.type).toMatch(/^text\/plain/);
    expect(await textOf(d.blob)).toBe("Edited statement.");
    expect(text("aiu-action-msg")).toBe("Downloaded ai-use-statement.txt");
  });
});

describe("AI-use statement (Task A4): the page and its copy", () => {
  it("the Panel dispatches aiuse to this page, and a tab it does not list reads Not built yet", async () => {
    await render(<Panel tab="aiuse" projectId="p1" />);
    expect($("panel-design-aiuse")).not.toBeNull();
    expect($("not-built")).toBeNull();
  });

  it("drawing the page raises no React warning (the five ticks each carry a key; the e2e run showed one)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render();
    expect(err.mock.calls.map((c) => String(c[0]) + " " + String(c[1] ?? ""))).toEqual([]);
  });

  it("the page's messages are always mounted for screen readers (role=status)", async () => {
    await render();
    for (const id of ["aiu-log-msg", "aiu-refuse", "aiu-action-msg", "aiu-style-note"]) expect($(id)!.getAttribute("role"), id).toBe("status");
  });

  it("new English strings have no em-dash or emoji; every key has a Hindi line and no Hindi line says exempt", () => {
    const mine = Object.keys(designEn).filter((k) => k.startsWith("design_aiu_"));
    expect(mine.length).toBeGreaterThan(30);
    for (const k of mine) {
      const v = (designEn as Record<string, string>)[k]!;
      expect(v, k).not.toMatch(/—|\p{Extended_Pictographic}/u);
      expect(v, k).not.toMatch(/exempt/i);
      expect((designHi as Record<string, string>)[k], k).toBeTruthy();
      expect((designHi as Record<string, string>)[k], k).not.toMatch(/—|\p{Extended_Pictographic}/u);
    }
    // Keys the page reuses exist already.
    for (const k of ["copy_btn", "design_inserted", "design_insert_failed", "design_exported", "tab_name_aiuse"]) {
      expect(k in E || k in (hi as Record<string, string>), k).toBe(true);
    }
  });
});
