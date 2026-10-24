// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task 10: the Statistics personal-details box against the participant list (spec 2026-10-24-participants-design.md §1 F1, §7.5 Tables, §8.1, §8.3 "Explain in plain language", C14;
 * rulings R8, R10, R13, R35). The mockup's table (student name, village, notes, score; Sunita not on the list, Imran withdrawn) gives each proposed row with the choice it starts at;
 * Apply adds the unlisted people first, then codes the table with the codes the saved list holds, and downloads no key file. With the vault off, the list unreadable or nobody on it,
 * the box is v1's (with the F1 rule), with a line that says why.
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  download: vi.fn(),
  /** The blobs the panel reads (by kind), and every write it made, as the JSON that would be sent. */
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  loading: {} as Record<string, boolean>,
  /** The vault: "unlocked" reads the list; "off" and "locked" do not. */
  vault: "unlocked" as string,
  /** What flush answers for the participants blob: false is a save the server did not take (the blob then reports an error, as the real one does). */
  flushOk: true,
  /** While set, the participants flush waits for it: a save that takes a while. */
  gate: null as Promise<void> | null,
  error: {} as Record<string, boolean>,
  confirm: vi.fn(() => true),
  askPd: vi.fn(async (_sc: unknown) => ({ answer: "mask", leave: [] as string[] }) as { answer: "send" | "mask" | "cancel"; leave: string[] }),
  prompts: [] as string[],
  /** The options each Explain request went out with. */
  opts: [] as unknown[],
  forces: new Set<() => void>(),
  /** The kinds the project's blob listing holds (GET /projects/:id/blobs); "fail" is a listing that cannot be read. While `listGate` is set the listing waits for it. */
  listing: [] as string[] | "fail",
  listGate: null as Promise<void> | null,
  listCalls: 0
}));
vi.mock("@/lib/blobs/listing", async (orig) => ({
  ...(await orig<typeof import("@/lib/blobs/listing")>()),
  listProjectBlobs: async () => {
    h.listCalls++;
    if (h.listGate) await h.listGate;
    if (h.listing === "fail") throw new Error("listing failed");
    return h.listing.map((kind) => ({ kind, keyVersion: 1, updatedAt: "2026-10-24T00:00:00Z" }));
  }
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", docOpen: false, openDocument: vi.fn() }) }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: async () => true }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => async (prompt: string, opts?: unknown) => { h.prompts.push(prompt); h.opts.push(opts); return "The groups differ."; } }));
vi.mock("@/lib/ai/pdDialog", () => ({ askPd: async (sc: unknown) => h.askPd(sc) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.vault }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer, useRef, useEffect } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      const alive = useRef(true);
      useEffect(() => { alive.current = true; h.forces.add(force); return () => { alive.current = false; h.forces.delete(force); }; }, [force]);
      return {
        value: h.store[kind] ?? null, loading: h.loading[kind] ?? false, locked: false, broken: false, error: h.error[kind] ?? false, readOnly: false, version: undefined,
        set: (next: unknown) => {
          if (!alive.current) return;
          const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
          h.store[kind] = v;
          h.writes.push({ kind, json: JSON.stringify(v) });
          force();
        },
        flush: async () => {
          if (kind !== "participants") return true;
          if (h.gate) await h.gate;
          h.error.participants = !h.flushOk;
          if (alive.current) force();
          return h.flushOk;
        }
      };
    }
  };
});

import { statsParseText } from "@appuscholar/core";
import type { Participant, ParticipantList } from "../lib/blobs/kinds/participants";
import { todayIso } from "../lib/tools/participants/dates";
import { resetLists } from "../lib/tools/participants/store";
import { Panel } from "../components/tools/stats/Panel";
import { applyPd, getData, getLab, parse, resetLabs, setPdContext, setText } from "../lib/tools/stats/lab";
import { codesFor, flaggedInText, listedMasks } from "../lib/tools/stats/explainGuard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const HI = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => tid(id)?.textContent ?? "";
const sel = (id: string) => tid(id) as HTMLSelectElement;
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

async function mount(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="data" projectId="p1" />); });
  return root;
}
async function type(testId: string, value: string) {
  const el = tid(testId) as HTMLTextAreaElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(testId: string) {
  const el = tid(testId);
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.click(); });
}
async function choose(testId: string, value: string) {
  const el = sel(testId);
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(cond(), "condition not met in time").toBe(true);
}
/** The blobs' state changed outside the tab (a read finished, the vault opened): every hook of the tab draws again. */
async function rerender() { await act(async () => { for (const f of [...h.forces]) f(); }); }
/** Pastes a table and parses it. */
async function load(csv: string) {
  await mount();
  await type("stats-paste", csv);
  await click("stats-parse");
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
/** Parses another table into the tab that is already open. */
async function clearAndLoad(csv: string) {
  await type("stats-paste", csv);
  await click("stats-parse");
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
async function applyAndWait() {
  await click("pd-apply");
  await until(() => tid("pd-result") !== null);
}

// ---- The list ---------------------------------------------------------------------------------------------------------------------------------------

const P = (n: number, name: string, extra: Partial<Participant> = {}): Participant => ({
  id: "id" + n, code: "P" + String(n).padStart(3, "0"), name, spellings: [], everyday: [], joined: "2026-10-01", about: {}, ...extra
});
const LIST = (people: Participant[], extra: Partial<ParticipantList> = {}): ParticipantList => ({
  v: 1, next: Math.max(0, ...people.map((p) => Number(p.code.slice(1)))) + 1, people, notNames: [], ...extra
});
/** Priya, Rahul, Kavya, Imran (withdrew on 15 October and asked for his data to be removed), Ananya: the next code is P006. */
const MOCK_LIST = () => LIST([
  P(1, "Priya Sharma", { spellings: ["Priya"] }), P(2, "Rahul Verma", { spellings: ["Rahul"] }), P(3, "Kavya Nair"),
  P(4, "Imran Khan", { withdrawn: { on: "2026-10-15", data: "remove" } }), P(5, "Ananya Rao")
]);
/** The mockup's table (panel A): the names, the village, open answers, the score. Sunita Devi is not on the list; Imran withdrew; Meena is only named in an answer. */
const MOCK = [
  "student name,village,notes,score",
  "Priya Sharma,Kharghar,Rahul and I studied together in the second week,12",
  "Rahul Verma,Kharghar,Meena didi helped me a lot,15",
  "Kavya Nair,Panvel,It was fine,9",
  "Imran Khan,Panvel,We ran every day,11",
  "Ananya Rao,Kharghar,I liked the routine,14",
  "Sunita Devi,Panvel,The morning walk was hard,10"
].join("\n");
/** The walk's v1 table: names that the scan codes, phone numbers it removes. */
const PEOPLE = ["name,phone,site,score", ...Array.from({ length: 6 }, (_, i) => `${["Asha Rao", "Ravi Kumar", "Meena Iyer", "John Paul", "Sita Devi", "Omar Khan"][i]},98765432${10 + i},ZXQ-SITE-${i},${10 + i}`)].join("\n");
const savedList = () => h.store.participants as ParticipantList;
/** How many people the list holds now. */
const listPeople = () => savedList().people.length;

beforeEach(() => {
  resetLabs();
  resetLists();
  for (const k of Object.keys(h.store)) delete h.store[k];
  for (const k of Object.keys(h.loading)) delete h.loading[k];
  h.writes.length = 0; h.prompts.length = 0; h.opts.length = 0;
  h.vault = "unlocked"; h.flushOk = true; h.gate = null; h.listing = []; h.listGate = null; h.listCalls = 0;
  for (const k of Object.keys(h.error)) delete h.error[k];
  h.toast.mockClear(); h.download.mockClear(); h.askPd.mockReset(); h.askPd.mockResolvedValue({ answer: "mask", leave: [] });
  vi.spyOn(window, "confirm").mockImplementation(h.confirm);
});
afterEach(async () => {
  await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// ---- The mockup's table -----------------------------------------------------------------------------------------------------------------------------

describe("the box against the list: the mockup's table (panel A)", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });

  it("proposes each row with the choice it starts at", async () => {
    await load(MOCK);
    expect(text("pd-found")).toContain(E.stats_pd_title_list);
    // The names: replace with their codes, four on the list (the withdrawn one is apart), one not on it.
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-list-0")).toContain(fill(E.stats_pd_on_list_many!, { n: 4, codes: "P001 P002 P003 P005" }));
    expect(text("pd-unlisted-0")).toContain(fill(E.stats_pd_unlisted_one!, { names: "Sunita Devi" }));
    expect(text("pd-will-add")).toBe("Apply will add 1 person to your list: Sunita Devi (P006)");
    expect(text("pd-will-add")).toBe(fill(E.stats_pd_will_add_one!, { names: "Sunita Devi (P006)" }));
    // Imran withdrew and asked for his data to be removed: his rows start at Remove.
    expect(text("pd-withdrawn-0")).toContain("Imran Khan withdrew on 15/10/2026 and asked for their data to be removed.");
    expect(sel("pd-withdrawn-sel-0").value).toBe("remove");
    // The village is an address: Remove, as v1.
    expect(sel("pd-sel-1").value).toBe("remove");
    // The open answers: not flagged as names, no column choice; Rahul is on the list (replace), Meena is only a suggestion (no action chosen).
    expect(tid("pd-sel-2")).toBeNull();
    expect(text("pd-intext-2")).toContain("Rahul");
    expect(sel("pd-intext-sel-2").value).toBe("codes");
    expect(text("pd-maybe-2")).toContain("Meena");
    expect(sel("pd-maybe-sel-2-0").value).toBe("");
    expect([...sel("pd-maybe-sel-2-0").options].map((o) => o.value)).toEqual(["", "name", "add", "keep"]);
    // Each choice is named by the words of its row (the screen reader says which name it is for), not by the column alone.
    const named = (id: string) => document.getElementById(sel(id).getAttribute("aria-labelledby")!)!.textContent;
    expect(named("pd-unlisted-sel-0")).toContain("Sunita Devi");
    expect(named("pd-maybe-sel-2-0")).toContain("Meena");
    // Scores are not personal; nothing is said about them.
    expect(tid("pd-sel-3")).toBeNull();
    expect(text("pd-found")).toContain(E.stats_pd_from_list);
    expect(text("pd-box")).not.toMatch(/\bsafe\b/i);
    expect(tid("pd-why")).toBeNull();
    expect(text("pd-scope")).toContain(E.stats_pd_scope);
  });

  it("Apply adds Sunita first, codes the table with the codes the saved list holds, removes Imran's row, and downloads no key file", async () => {
    await load(MOCK);
    await applyAndWait();
    const box = (tid("stats-paste") as HTMLTextAreaElement).value;
    expect(box.split("\n")).toEqual([
      "ParticipantCode,notes,score",
      "P001,P002 and I studied together in the second week,12",
      "P002,Meena didi helped me a lot,15",
      "P003,It was fine,9",
      "P005,I liked the routine,14",
      "P006,The morning walk was hard,10"
    ]);
    expect(getData("p1")!.headers).toEqual(["ParticipantCode", "notes", "score"]);
    // Sunita is on the list, with the next code, joined today; the counter went on.
    const l = savedList();
    expect(l.people.map((p) => [p.code, p.name])).toEqual([["P001", "Priya Sharma"], ["P002", "Rahul Verma"], ["P003", "Kavya Nair"], ["P004", "Imran Khan"], ["P005", "Ananya Rao"], ["P006", "Sunita Devi"]]);
    expect(l.people[5]!.joined).toBe(todayIso());
    expect(l.next).toBe(7);
    // One save, and it was the list: the people were added before the table was written.
    expect(h.writes.filter((w) => w.kind === "participants")).toHaveLength(1);
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    // The sentence says what was done, and the codes actually given.
    const said = text("pd-result");
    expect(said).toContain(E.stats_pd_done);
    expect(said).toContain(fill(E.stats_pd_removed!, { n: 1 }));
    expect(said).toContain(fill(E.stats_pd_coded!, { n: 1 }));
    expect(said).toContain(fill(E.stats_pd_rows_removed!, { n: 1 }));
    expect(said).toContain(fill(E.stats_pd_added!, { names: "Sunita Devi (P006)" }));
    // Rahul inside an answer was replaced too, and the sentence says so alongside the rest (R39c).
    expect(said).toContain(E.stats_pd_cells);
    expect(said).not.toContain(E.stats_pd_keyed);
  });

  it("the names not on the list can be kept as typed, or emptied, instead of added; the listed ones are still coded", async () => {
    await load(MOCK);
    await choose("pd-unlisted-sel-0", "keep");
    expect(tid("pd-will-add")).toBeNull();
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("Sunita Devi,The morning walk was hard,10");
    expect(listPeople()).toBe(5);
  });

  it("Remove these cells empties them", async () => {
    await load(MOCK);
    await choose("pd-unlisted-sel-0", "remove");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain(",The morning walk was hard,10");
    expect((tid("stats-paste") as HTMLTextAreaElement).value).not.toContain("Sunita");
    expect(listPeople()).toBe(5);
  });

  it("a word that is a person's name and also an ordinary word is asked about, with that person's code to choose", async () => {
    h.store.participants = LIST([P(1, "Asha Rao", { spellings: ["Asha"], everyday: ["Asha"] }), P(2, "Rahul Verma")]);
    await load("id,notes\n1,Asha helped me a lot with the tasks at home\n2,Nothing else to say about the week really\n3,The room was warm and the facilitators were kind");
    expect(text("pd-maybe-1")).toContain(fill(E.stats_pd_maybe_ask!, { text: "Asha", answers: E.stats_pd_answers_one!, codes: "P001" }));
    expect([...sel("pd-maybe-sel-1-0").options].map((o) => o.text)).toEqual([E.stats_pd_choose, fill(E.stats_pd_maybe_code!, { code: "P001" }), E.stats_pd_maybe_keep]);
    expect(sel("pd-maybe-sel-1-0").value).toBe("");
    await choose("pd-maybe-sel-1-0", "id1");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")[1]).toBe("1,P001 helped me a lot with the tasks at home");
  });

  it("a suggestion starts at Choose… and is only acted on when chosen: Replace with [name], Add to my list or Not a name", async () => {
    await load(MOCK);
    await choose("pd-maybe-sel-2-0", "name");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("[name] didi helped me a lot");
  });

  it("Add to my list gives the suggested name the next code, says so before Apply, and writes the code in the answer", async () => {
    await load(MOCK);
    await choose("pd-maybe-sel-2-0", "add");
    expect(text("pd-will-add")).toBe(fill(E.stats_pd_will_add_many!, { n: 2, names: "Sunita Devi (P006), Meena (P007)" }));
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("P007 didi helped me a lot");
    expect(savedList().people.map((p) => [p.code, p.name]).slice(-2)).toEqual([["P006", "Sunita Devi"], ["P007", "Meena"]]);
  });

  it("Not a name keeps the answer as it is and the list remembers the word", async () => {
    await load(MOCK);
    await choose("pd-maybe-sel-2-0", "keep");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("Meena didi helped me a lot");
    expect(savedList().notNames).toEqual(["meena"]);
  });

  it("choices that were not made leave the answers alone: Choose… is Keep when Apply runs", async () => {
    await load(MOCK);
    await choose("pd-intext-sel-2", "keep");
    await choose("pd-sel-0", "keep");
    await choose("pd-withdrawn-sel-0", "keep");
    await choose("pd-sel-1", "keep");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(MOCK);
    // Nothing to add was chosen: the list was sent as it is (Apply always saves first, R38), nobody was added.
    expect(listPeople()).toBe(5);
  });

  it("when the list cannot take the new people, nothing is changed and the box says so", async () => {
    h.flushOk = false;
    await load(MOCK);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe("Could not add them to your list, so nothing was changed.");
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(MOCK);
    expect(getData("p1")!.headers).toEqual(["student name", "village", "notes", "score"]);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("the code a name gets is the saved list's, even when the list had moved on: Sunita is the next code the list holds", async () => {
    await load(MOCK);
    // Another window added somebody since the box was drawn; the save lands on that list and Sunita's code comes from it.
    const l = MOCK_LIST();
    l.people.push(P(6, "Meera Joshi"));
    l.next = 7;
    h.store.participants = l;
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("P007,The morning walk was hard,10");
    expect(savedList().people.find((p) => p.name === "Sunita Devi")!.code).toBe("P007");
  });

  it("a list that changes while the table is open moves the box with it, and a choice already made stays", async () => {
    await load(MOCK);
    await choose("pd-withdrawn-sel-0", "keep");
    const l = MOCK_LIST();
    l.people.push(P(6, "Sunita Devi"));
    l.next = 7;
    h.store.participants = l;
    await rerender();
    await until(() => tid("pd-unlisted-0") === null);
    expect(text("pd-list-0")).toContain(fill(E.stats_pd_on_list_many!, { n: 5, codes: "P001 P002 P003 P005 P006" }));
    expect(tid("pd-will-add")).toBeNull();
    expect(sel("pd-withdrawn-sel-0").value).toBe("keep");
  });

  it("the page may show a real name (the sentences), and no toast does", async () => {
    await load(MOCK);
    await applyAndWait();
    expect(text("pd-result")).toContain("Sunita Devi");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("no data row is written to any blob: the list holds the new person's name, and no answer", async () => {
    await load(MOCK);
    await applyAndWait();
    const written = h.writes.map((w) => w.json).join("\n");
    for (const cell of ["Meena didi", "studied together", "morning walk", "Kharghar", "Panvel", "We ran every day"]) expect(written, cell).not.toContain(cell);
    expect(written).toContain("Sunita Devi");
    expect([...new Set(h.writes.map((w) => w.kind))].sort()).toEqual(["participants", "stats_sets"]);
  });

  it("made-up names mode: a table still gets the code (the made-up name is for documents and requests)", async () => {
    h.store.design_ec = { idMode: "pseudonyms" };
    const l = MOCK_LIST();
    l.people[0] = { ...l.people[0]!, pseudonym: "Meera Patel" };
    h.store.participants = l;
    await load(MOCK);
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")[1]).toBe("P001,P002 and I studied together in the second week,12");
  });
});

// ---- Where a column starts (R8, R10, R13, C14) ------------------------------------------------------------------------------------------------------

describe("where each column starts", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });

  it("a column that only the values call names (not the heading) starts at Choose… and Apply treats it as Keep", async () => {
    await load("member,score\nPriya Sharma,5\nSita Gupta,6\nTara Menon,7\nUma Pillai,8");
    expect(sel("pd-sel-0").value).toBe("");
    expect([...sel("pd-sel-0").options].map((o) => o.value)).toEqual(["", "remove", "code", "keep", "notnames"]);
    expect(text("pd-found")).toContain(E.stats_pd_label_name_values);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
    expect(listPeople()).toBe(5);
  });

  it("Not names is Keep as well", async () => {
    await load("member,score\nPriya Sharma,5\nSita Gupta,6\nTara Menon,7\nUma Pillai,8");
    await choose("pd-sel-0", "notnames");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("Sita Gupta,6");
  });

  it("a values-only column with over half of its values on the list starts at Replace with their codes (R8)", async () => {
    await load("member,score\nPriya Sharma,5\nRahul Verma,6\nKavya Nair,7\nSita Gupta,8");
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-list-0")).toContain(fill(E.stats_pd_on_list_many!, { n: 3, codes: "P001 P002 P003" }));
    expect(text("pd-will-add")).toBe(fill(E.stats_pd_will_add_one!, { names: "Sita Gupta (P006)" }));
  });

  it("a heading that says names, with nobody on the list in it, starts at Replace with codes and adds them all (v1's heading rule)", async () => {
    await load("name,score\nSita Gupta,5\nTara Menon,6\nUma Pillai,7");
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-will-add")).toBe(fill(E.stats_pd_will_add_many!, { n: 3, names: "Sita Gupta (P006), Tara Menon (P007), Uma Pillai (P008)" }));
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "P006,5", "P007,6", "P008,7"]);
    expect(savedList().people.slice(-3).map((p) => p.name)).toEqual(["Sita Gupta", "Tara Menon", "Uma Pillai"]);
  });

  it("a free-text column with one odd exact-name cell starts at Keep for the column and offers its names inside answers (R8)", async () => {
    await load("id,comment\n1,Priya Sharma\n2,I really enjoyed the whole programme and the group\n3,It was a bit tiring at the end of the week for me\n4,The facilitators were kind and the room was warm");
    expect(tid("pd-found")).not.toBeNull();
    expect(sel("pd-sel-1").value).toBe("keep");
    expect([...sel("pd-sel-1").options].map((o) => o.value)).toEqual(["code", "keep"]);
    expect(text("pd-list-1")).toContain(fill(E.stats_pd_on_list_one!, { codes: "P001" }));
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
  });

  it("an unflagged column with a listed name inside an answer is offered only that (names inside answers start at their codes)", async () => {
    await load("id,comment\n1,Rahul told me about it before the first session\n2,I came with my cousin to the second one\n3,Nothing else to add really about this week");
    expect(tid("pd-sel-1")).toBeNull();
    expect(text("pd-intext-1")).toContain("Rahul");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")[1]).toBe("1,P002 told me about it before the first session");
  });

  it("a roll column whose numbers are all on the list starts at Replace with their codes", async () => {
    const l = LIST([P(1, "Priya Sharma", { roll: "101" }), P(2, "Rahul Verma", { roll: "102" }), P(3, "Kavya Nair", { roll: "103" })]);
    h.store.participants = l;
    await load("roll no,score\n101,5\n102,6\n103,7");
    expect(sel("pd-sel-0").value).toBe("code");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "P001,5", "P002,6", "P003,7"]);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("a roll column that does not match the list starts at Remove (new codes would clash with the list's) and says why", async () => {
    await load("roll no,score\n201,5\n202,6\n203,7");
    expect(sel("pd-sel-0").value).toBe("remove");
    expect(text("pd-col-0")).toContain(E.stats_pd_roll_none);
    expect([...sel("pd-sel-0").options].map((o) => o.value)).toEqual(["remove", "keep"]);
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["score", "5", "6", "7"]);
  });

  it("a roll column that matches only some of the list is not coded: it starts at Remove, and Replace with codes is not offered", async () => {
    const l = LIST([P(1, "Priya Sharma", { roll: "101" }), P(2, "Rahul Verma", { roll: "102" })]);
    h.store.participants = l;
    await load("roll no,score\n101,5\n102,6\n103,7");
    expect(sel("pd-sel-0").value).toBe("remove");
    expect(text("pd-col-0")).toContain(E.stats_pd_roll_some);
    expect([...sel("pd-sel-0").options].map((o) => o.value)).toEqual(["remove", "keep"]);
  });

  it("phone, email and the other columns v1 flags by what they are keep v1's start, and cannot be turned into list codes", async () => {
    await load("name,phone,score\nPriya Sharma,9876543210,5\nRahul Verma,9123456780,6\nKavya Nair,9988776655,7");
    expect(sel("pd-sel-1").value).toBe("remove");
    expect([...sel("pd-sel-1").options].map((o) => o.value)).toEqual(["remove", "keep"]);
  });

  it("an anonymous plan starts the name columns at Remove and says so", async () => {
    h.store.design_ec = { idMode: "anonymous" };
    await load(MOCK);
    expect(sel("pd-sel-0").value).toBe("remove");
    expect(text("pd-col-0")).toContain(E.stats_pd_anonymous);
    expect([...sel("pd-sel-0").options].map((o) => o.value)).toEqual(["remove", "keep"]);
    expect(tid("pd-will-add")).toBeNull();
    await applyAndWait();
    expect(getData("p1")!.headers).toEqual(["notes", "score"]);
    expect(listPeople()).toBe(5);
  });

  it("a person who withdrew and chose to keep what was collected gets a note, and their rows stay", async () => {
    h.store.participants = LIST([P(1, "Priya Sharma", { withdrawn: { on: "2026-10-12", data: "keep" } }), P(2, "Rahul Verma")]);
    await load("name,score\nPriya Sharma,5\nRahul Verma,6\nSita Gupta,7");
    expect(text("pd-withdrawn-keep-0")).toBe(fill(E.stats_pd_withdrawn_note!, { name: "Priya Sharma", date: "12/10/2026" }));
    expect(tid("pd-withdrawn-0")).toBeNull();
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n").slice(0, 3)).toEqual(["ParticipantCode,score", "P001,5", "P002,6"]);
  });

  const SHARED = () => LIST([P(1, "Sam Rao", { spellings: ["Sam"] }), P(2, "Sam Iyer", { spellings: ["Sam"], withdrawn: { on: "2026-10-12", data: "remove" } }), P(3, "Kavya Nair")]);
  const SAM = "name,score\nSam,5\nKavya Nair,6\nSita Gupta,7";

  it("a row whose name two people share, only some of whom withdrew, is asked about: it starts at Keep, and kept it stays as typed", async () => {
    h.store.participants = SHARED();
    await load(SAM);
    expect(text("pd-ask-0-0")).toContain("P001");
    expect(text("pd-ask-0-0")).toContain("P002");
    expect(sel("pd-ask-sel-0-0").value).toBe("keep");
    expect(tid("pd-withdrawn-0")).toBeNull();
    await applyAndWait();
    // The cell is not swapped for the first of the two people's codes: it stays as typed, and the student was told so.
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "Sam,5", "P003,6", "P004,7"]);
  });

  it("and its row goes only when the student chooses Remove", async () => {
    h.store.participants = SHARED();
    await load(SAM);
    await choose("pd-ask-sel-0-0", "remove");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "P003,6", "P004,7"]);
  });
});

// ---- Cells that hold more than one person ------------------------------------------------------------------------------------------------------------

describe("cells that are not one person", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });

  it("a cell with two people on the list lands with the names that are not on the list, is not added, and starts at Keep with the reason", async () => {
    await load("pair,score\nPriya & Rahul,5\nKavya Nair,6\nAnanya Rao,7");
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-multi-0")).toContain(fill(E.stats_pd_multi!, { value: "Priya & Rahul", codes: "P001 P002" }));
    expect(sel("pd-multi-sel-0-0").value).toBe("keep");
    expect(tid("pd-will-add")).toBeNull();
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "Priya & Rahul,5", "P003,6", "P005,7"]);
    expect(listPeople()).toBe(5);
  });

  it("the student can replace the names in such a cell with their codes", async () => {
    await load("pair,score\nPriya & Rahul,5\nKavya Nair,6\nAnanya Rao,7");
    await choose("pd-multi-sel-0-0", "codes");
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")[1]).toBe("P001 & P002,5");
  });

  const SAMS = () => LIST([P(1, "Sam Rao", { spellings: ["Sam"] }), P(2, "Sam Iyer", { spellings: ["Sam"] }), P(3, "Kavya Nair")]);

  it("a name that two people on the list share is not coded as the first of them: the box says it stays as written", async () => {
    h.store.participants = SAMS();
    await load("name,score\nSam,5\nKavya Nair,6\nSita Gupta,7");
    expect(text("pd-shared-0")).toBe(fill(E.stats_pd_shared_one!, { value: "Sam", codes: "P001 P002" }));
    // Only Kavya is a person the box can code.
    expect(text("pd-list-0")).toContain(fill(E.stats_pd_on_list_one!, { codes: "P003" }));
  });

  it("Apply leaves every such cell as typed, and codes the others", async () => {
    h.store.participants = SAMS();
    await load("name,score\nSam,5\nKavya Nair,6\nSita Gupta,7\nSam,8");
    expect(text("pd-shared-0")).toBe(fill(E.stats_pd_shared_many!, { n: 2, examples: "“Sam” (P001 P002)" }));
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")).toEqual(["ParticipantCode,score", "Sam,5", "P003,6", "P004,7", "Sam,8"]);
  });

  it("and a column of nothing else is not offered codes", async () => {
    h.store.participants = SAMS();
    await load("name,score\nSam,5\nSam,6\nSam,7");
    expect([...sel("pd-sel-0").options].map((o) => o.value)).toEqual(["remove", "keep"]);
    expect(sel("pd-sel-0").value).toBe("keep");
  });

  it("a listed cell with other names in it is warned about before it is swapped for one code", async () => {
    await load("who,score\nPriya and Sunita Devi,5\nKavya Nair,6\nAnanya Rao,7");
    expect(text("pd-wide-0")).toBe(fill(E.stats_pd_wide_one!, { examples: "Priya and Sunita Devi" }));
  });
});

// ---- Leftover cells of a coded name column (R49) ---------------------------------------------------------------------------------------------------

describe("cells of a name column that are not on the list and were not added (R49)", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });
  const K = "K. R. Narayanan Swamy Iyer";
  const M = "Mohammed Abdul Rahman Khan Siddiqui";
  /** The reviewer's probe: two people with long names that are not on the list, a listed one, and Sunita, who is added. */
  const PROBE = `student name,score\nPriya Sharma,12\n${K},15\nSunita Devi,10\n${M},9`;
  const pasted = () => (tid("stats-paste") as HTMLTextAreaElement).value.split("\n");

  it("the box names them, not as people to add, and starts at Remove these cells while the column is being replaced with codes", async () => {
    await load(PROBE);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-leftover-0")).toContain(fill(E.stats_pd_leftover_many!, { n: 2, names: `${K}, ${M}` }));
    expect(sel("pd-leftover-sel-0").value).toBe("remove");
    expect([...sel("pd-leftover-sel-0").options].map((o) => o.textContent)).toEqual([E.stats_pd_leftover_remove, E.stats_pd_leftover_keep]);
    // Sunita is the only one added; the long names are not people.
    expect(text("pd-will-add")).toBe(fill(E.stats_pd_will_add_one!, { names: "Sunita Devi (P006)" }));
    expect(text("pd-unlisted-0")).toContain(fill(E.stats_pd_unlisted_one!, { names: "Sunita Devi" }));
    // The words in cells that go are not asked about one by one.
    expect(tid("pd-maybe-0")).toBeNull();
  });

  it("Apply with the default choice leaves no leftover name in the coded column", async () => {
    await load(PROBE);
    await applyAndWait();
    expect(pasted()).toEqual(["ParticipantCode,score", "P001,12", ",15", "P006,10", ",9"]);
    expect(pasted().join("\n")).not.toMatch(/Narayanan|Mohammed|Siddiqui|Swamy/);
    expect(listPeople()).toBe(6);
    expect(savedList().people.map((p) => p.name)).not.toContain(K);
    expect(savedList().people.map((p) => p.name)).not.toContain(M);
  });

  it("Keep leaves them as typed, and the box asks about the words inside them as it does for any answer", async () => {
    await load(PROBE);
    await choose("pd-leftover-sel-0", "keep");
    expect(tid("pd-maybe-0")).not.toBeNull();
    await applyAndWait();
    expect(pasted()).toEqual(["ParticipantCode,score", "P001,12", `${K},15`, "P006,10", `${M},9`]);
  });

  it("with the column kept as it is, the cells start at Keep; chosen to go, they are emptied under the old header", async () => {
    await load(PROBE);
    await choose("pd-sel-0", "keep");
    expect(sel("pd-leftover-sel-0").value).toBe("keep");
    await choose("pd-leftover-sel-0", "remove");
    await applyAndWait();
    expect(pasted()).toEqual(["student name,score", "Priya Sharma,12", ",15", "Sunita Devi,10", ",9"]);
  });

  it("a column removed says nothing about them, and a table with none says nothing at all", async () => {
    await load(PROBE);
    await choose("pd-sel-0", "remove");
    expect(tid("pd-leftover-0")).toBeNull();
    await clearAndLoad(MOCK);
    expect(tid("pd-leftover-0")).toBeNull();
  });

  it("a long list of them shows a few and the number", async () => {
    const many = Array.from({ length: 6 }, (_, i) => `Mr Ravi Kumar Number${i} Of Nagpur`).join("\n");
    await load(`student name,score\nPriya Sharma,1\n${many.split("\n").map((v, i) => `${v},${i}`).join("\n")}`);
    const first = [0, 1, 2].map((i) => `Mr Ravi Kumar Number${i} Of Nagpur`).join(", ");
    expect(text("pd-leftover-0")).toContain(fill(E.stats_pd_leftover_many!, { n: 6, names: `${first} ${fill(E.stats_pd_more!, { n: 3 })}` }));
    expect(text("pd-leftover-0")).not.toContain("Number5");
  });
});

// ---- No list: v1's box, with the line that says why ------------------------------------------------------------------------------------------------

describe("without a list the box is v1's, and says why", () => {
  it("the vault off: the walk's table starts at code and remove, Apply makes fresh codes and downloads the key file", async () => {
    h.vault = "off";
    await load(PEOPLE);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(sel("pd-sel-1").value).toBe("remove");
    expect([...sel("pd-sel-0").options].map((o) => o.textContent)).toEqual([E.stats_pd_remove, E.stats_pd_code, E.stats_pd_keep]);
    expect(text("pd-found")).toContain(E.stats_pd_title);
    expect(text("pd-found")).toContain(E.stats_pd_intro);
    expect(text("pd-found")).toContain(E.stats_pd_pseudo);
    expect(text("pd-why")).toBe("Set up your vault and add your participants to get the same code for each person in every table.");
    expect(tid("pd-list-0")).toBeNull();
    expect(tid("pd-will-add")).toBeNull();
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect((tid("stats-paste") as HTMLTextAreaElement).value.split("\n")[0]).toBe("ParticipantCode,site,score");
    expect(h.download).toHaveBeenCalledTimes(1);
    expect((h.download.mock.calls[0] as [string, Blob])[0]).toBe("appuscholar_key_keep_separate.csv");
    expect(text("pd-result")).toBe([E.stats_pd_done, fill(E.stats_pd_removed!, { n: 1 }), fill(E.stats_pd_coded!, { n: 1 }), E.stats_pd_keyed].join(" "));
    expect(h.writes.filter((w) => w.kind === "participants")).toEqual([]);
  });

  it("a column that only the values call names starts at Choose…, as with the list (F1), and Replace with a code is the student's to pick", async () => {
    h.vault = "off";
    await load("member,score\nPriya Sharma,5\nSita Gupta,6\nTara Menon,7\nUma Pillai,8");
    expect(sel("pd-sel-0").value).toBe("");
    expect([...sel("pd-sel-0").options].map((o) => o.textContent)).toEqual([E.stats_pd_choose, E.stats_pd_remove, E.stats_pd_code, E.stats_pd_keep, E.stats_pd_notnames]);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
    await choose("pd-sel-0", "code");
    await click("pd-apply");
    await until(() => text("pd-result") !== E.stats_pd_unchanged);
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it("a list with nobody on it, with a codes plan: the same, with its own line", async () => {
    h.store.participants = LIST([]);
    h.store.design_ec = { idMode: "codes" };
    await load(PEOPLE);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-why")).toBe(E.stats_pd_why_empty);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it("a locked vault with no participant list in the project: v1's box as it was, and the line does not claim a list exists (R51)", async () => {
    h.vault = "locked";
    h.listing = ["design_ec", "stats_prefs"];
    await load(PEOPLE);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-why")).toBe(E.stats_pd_why_locked_none);
    // It says the vault is locked and that no list was used; it does not call a list "yours" or ask for an unlock.
    expect(text("pd-why")).not.toMatch(/your participant list|unlock/i);
  });

  it("the list is read after the table was parsed: the box then uses it", async () => {
    h.store.participants = MOCK_LIST();
    h.loading.participants = true;
    await load(MOCK);
    expect(text("pd-why")).toBe(E.stats_pd_why_loading);
    expect(tid("pd-list-0")).toBeNull();
    h.loading.participants = false;
    await rerender();
    await until(() => tid("pd-list-0") !== null);
    expect(tid("pd-why")).toBeNull();
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-will-add")).toContain("Sunita Devi (P006)");
  });

  it("a plan that turns out anonymous after the table was parsed moves an untouched name column to Remove, and leaves one the student chose alone", async () => {
    h.vault = "off";
    await load(PEOPLE);
    expect(sel("pd-sel-0").value).toBe("code");
    h.store.design_ec = { idMode: "anonymous" };
    await rerender();
    expect(sel("pd-sel-0").value).toBe("remove");
    expect(text("pd-col-0")).toContain(E.stats_pd_anonymous);
    await choose("pd-sel-0", "keep");
    h.store.design_ec = { idMode: "codes" };
    await rerender();
    expect(sel("pd-sel-0").value).toBe("keep");
  });

  it("an anonymous plan with no list: v1's box with the name column at Remove and the note", async () => {
    h.vault = "off";
    h.store.design_ec = { idMode: "anonymous" };
    await load(PEOPLE);
    expect(sel("pd-sel-0").value).toBe("remove");
    expect(text("pd-col-0")).toContain(E.stats_pd_anonymous);
    expect(sel("pd-sel-1").value).toBe("remove");
  });
});

// ---- A list that is loading or locked (R51) --------------------------------------------------------------------------------------------------------

describe("a participant list that is still being read, or locked, is never coded against with fresh codes (R51)", () => {
  const optionOf = (id: string, value: string) => [...sel(id).options].find((o) => o.value === value);
  const values = (id: string) => [...sel(id).options].map((o) => o.value);
  const pasted = () => (tid("stats-paste") as HTMLTextAreaElement).value;
  const ROLLS = "roll no,score\nR101,5\nR102,6\nR103,7\nR104,8";

  it("while the list is being read, Replace with a code is off for the names until the read answers, and Apply makes no fresh codes", async () => {
    h.store.participants = MOCK_LIST();
    h.loading.participants = true;
    await load(PEOPLE);
    expect(text("pd-why")).toBe(E.stats_pd_why_loading);
    expect(values("pd-sel-0")).toEqual(["remove", "code", "keep"]);
    expect(optionOf("pd-sel-0", "code")!.disabled).toBe(true);
    expect(sel("pd-sel-0").value).not.toBe("code");
    // The phone column is not a name: v1's choices are as they were.
    expect(optionOf("pd-sel-1", "code")!.disabled).toBe(false);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(pasted().split("\n")[0]).not.toContain("ParticipantCode");
    expect(pasted()).not.toMatch(/P00\d/);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("a roll column is not coded with fresh codes either while the list is being read", async () => {
    h.store.participants = MOCK_LIST();
    h.loading.participants = true;
    await load(ROLLS);
    expect(optionOf("pd-sel-0", "code")!.disabled).toBe(true);
    expect(sel("pd-sel-0").value).not.toBe("code");
  });

  it("when the read answers, the box is the list's and codes are offered again", async () => {
    h.store.participants = MOCK_LIST();
    h.loading.participants = true;
    await load(MOCK);
    expect(optionOf("pd-sel-0", "code")!.disabled).toBe(true);
    h.loading.participants = false;
    await rerender();
    await until(() => tid("pd-list-0") !== null);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(optionOf("pd-sel-0", "code")!.disabled).toBe(false);
  });

  it("locked, and the project's blob listing holds a participant list: the box says it is locked and to unlock, offers Remove and Keep for names, and never makes fresh codes", async () => {
    h.vault = "locked";
    h.listing = ["design_ec", "participants"];
    await load(PEOPLE);
    expect(h.listCalls).toBeGreaterThan(0);
    expect(text("pd-why")).toBe(E.stats_pd_why_locked);
    expect(E.stats_pd_why_locked).toMatch(/locked/);
    expect(E.stats_pd_why_locked).toMatch(/[Uu]nlock/);
    expect(values("pd-sel-0")).toEqual(["remove", "keep"]);
    expect(sel("pd-sel-0").value).toBe("remove");
    // Other columns are v1's.
    expect(values("pd-sel-1")).toEqual(["remove", "code", "keep"]);
    await choose("pd-sel-0", "keep");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(pasted().split("\n")[0]).toBe("name,site,score");
    expect(pasted()).not.toMatch(/P00\d/);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("locked with a list, a column the student never touched is not coded by Apply either: it is removed, as it is shown", async () => {
    h.vault = "locked";
    h.listing = ["participants"];
    await load(PEOPLE);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(pasted().split("\n")[0]).toBe("site,score");
    expect(h.download).not.toHaveBeenCalled();
  });

  it("locked with a list: a roll column has Remove and Keep only", async () => {
    h.vault = "locked";
    h.listing = ["participants"];
    await load(ROLLS);
    expect(values("pd-sel-0")).toEqual(["remove", "keep"]);
  });

  it("locked with no participant list: v1's behaviour, fresh codes and the key file, and a line that does not say a list exists", async () => {
    h.vault = "locked";
    h.listing = ["design_ec"];
    await load(PEOPLE);
    expect(values("pd-sel-0")).toEqual(["remove", "code", "keep"]);
    expect(sel("pd-sel-0").value).toBe("code");
    expect(text("pd-why")).toBe(E.stats_pd_why_locked_none);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(pasted().split("\n")[0]).toBe("ParticipantCode,site,score");
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it("a listing that cannot be read says nothing is locked (there is no way to tell): v1's box", async () => {
    h.vault = "locked";
    h.listing = "fail";
    await load(PEOPLE);
    await until(() => tid("pd-why") !== null && text("pd-why") === E.stats_pd_why_locked_none);
    expect(sel("pd-sel-0").value).toBe("code");
  });

  it("until the listing answers, codes are off as they are while a list is read; the answer then settles the box", async () => {
    h.vault = "locked";
    h.listing = ["participants"];
    let open!: () => void;
    h.listGate = new Promise<void>((r) => { open = r; });
    await load(PEOPLE);
    expect(optionOf("pd-sel-0", "code")!.disabled).toBe(true);
    expect(sel("pd-sel-0").value).not.toBe("code");
    open();
    await until(() => text("pd-why") === E.stats_pd_why_locked);
    expect(values("pd-sel-0")).toEqual(["remove", "keep"]);
  });

  it("the listing is asked only when the vault is locked", async () => {
    h.store.participants = MOCK_LIST();
    await load(MOCK);
    expect(h.listCalls).toBe(0);
    h.vault = "off";
    await rerender();
    expect(h.listCalls).toBe(0);
  });

  it("an anonymous plan with no list expected says nothing about a locked vault with none", async () => {
    h.vault = "locked";
    h.listing = [];
    h.store.design_ec = { idMode: "anonymous" };
    await load(PEOPLE);
    expect(tid("pd-why")).toBeNull();
  });
});

// ---- F1: open answers are not names ----------------------------------------------------------------------------------------------------------------

describe("F1: open answers are not names", () => {
  const ANSWERS = [
    "id,notes",
    "1,I felt tired at first but then it got easier every week",
    "2,My mother kept asking why I went to sleep so early",
    "3,We talked about it at lunch with our friends a lot",
    "4,The first week was hard and the second was better"
  ].join("\n");

  it("a column of open answers is not flagged as names, and is listed as long text (no list)", async () => {
    h.vault = "off";
    await load(ANSWERS);
    expect(getLab("p1").scan!.found).toEqual([]);
    expect(tid("pd-found")).toBeNull();
    expect(text("pd-none")).toBe(E.stats_pd_none);
    expect(text("pd-scope")).toContain(fill(E.stats_pd_long!, { cols: "notes" }));
  });

  it("and with a list: no name flag, no choice, notes still listed as long text, and Apply is not offered for it", async () => {
    h.store.participants = MOCK_LIST();
    h.store.design_ec = { idMode: "codes" };
    await load(ANSWERS);
    expect(getLab("p1").scan!.found).toEqual([]);
    expect(tid("pd-sel-1")).toBeNull();
    expect(text("pd-scope")).toContain(fill(E.stats_pd_long!, { cols: "notes" }));
    expect(text("pd-box")).not.toMatch(/\bsafe\b/i);
  });
});

// ---- Explain in plain language: a listed group label is masked as its code -----------------------------------------------------------------------------

describe("Explain in plain language", () => {
  const NAMED = "name,score\nPriya Sharma,7\nPriya Sharma,8\nSita Gupta,5\nSita Gupta,6\nKavya Nair,9\nKavya Nair,10";

  it("masks a flagged value that is on the list as that person's code, and the others as [name n]; the question is asked once", async () => {
    h.store.participants = LIST([P(1, "Priya Sharma"), P(2, "Kavya Nair", { pseudonym: "Meera" })]);
    h.store.design_ec = { idMode: "codes" };
    await load(NAMED);
    await choose("stats-test", "anova1");
    await choose("stats-field-dv", "1");
    await choose("stats-field-iv", "0");
    await click("stats-run-btn");
    await click("stats-explain");
    await until(() => h.prompts.length === 1);
    expect(h.askPd).toHaveBeenCalledTimes(1);
    const prompt = h.prompts[0]!;
    expect(prompt).toContain("P001");
    expect(prompt).toContain("[name 1]"); // Sita is not on the list
    expect(prompt).not.toContain("[name 2]");
    for (const n of ["Priya", "Sharma", "Kavya", "Sita", "Gupta"]) expect(prompt).not.toContain(n);
    expect(prompt).toContain("P002");
    // callAI's own check for names is told which values this step asked about, in normal form, so it does not ask about the same names again (Task 11).
    expect((h.opts[0] as { namesAsked: string[] }).namesAsked.slice().sort()).toEqual(["kavya nair", "priya sharma", "sita gupta"]);
  });
});

describe("what Explain masks a listed name as", () => {
  const data = statsParseText("name,score\nPriya Sharma,7\nSita Gupta,5\nKavya Nair,9\nPriya Sharma,8")!;
  const scan = { found: [{ index: 0, name: "name", kind: "name" as const, why: "heading" as const }], freeText: [] };
  const list = LIST([P(1, "Priya Sharma", { spellings: ["Priya"] }), P(3, "Kavya Nair", { pseudonym: "Meera Patel" })]);

  it("a flagged value on the list is its code; the others are numbered without a gap", () => {
    const found = flaggedInText(data, scan, ["Priya Sharma 7.5 Sita Gupta 5 Kavya Nair 9"]);
    const codes = codesFor(found, listedMasks(list, false));
    expect([...codes.entries()].sort()).toEqual([["Kavya Nair", "P003"], ["Priya Sharma", "P001"], ["Sita Gupta", "[name 1]"]]);
  });

  it("in made-up names mode it is the person's made-up name, and the code for a person who has none", () => {
    const found = flaggedInText(data, scan, ["Priya Sharma Sita Gupta Kavya Nair"]);
    const codes = codesFor(found, listedMasks(list, true));
    expect(codes.get("Kavya Nair")).toBe("Meera Patel");
    expect(codes.get("Priya Sharma")).toBe("P001");
  });

  it("a spelling two people share is not claimed: it stays [name n]", () => {
    const shared = LIST([P(1, "Sam Rao", { spellings: ["Sam"] }), P(2, "Sam Iyer", { spellings: ["Sam"] })]);
    const d = statsParseText("name,score\nSam,1\nSam,2\nSam,3")!;
    const sc = { found: [{ index: 0, name: "name", kind: "name" as const, why: "heading" as const }], freeText: [] };
    const found = flaggedInText(d, sc, ["Sam 2"]);
    expect(codesFor(found, listedMasks(shared, false)).get("Sam")).toBe("[name 1]");
  });

  it("with no list, or a list nobody is on, nothing changes: [name n] as before", () => {
    const found = flaggedInText(data, scan, ["Priya Sharma Sita Gupta"]);
    expect(codesFor(found).get("Priya Sharma")).toBe("[name 1]");
    expect(codesFor(found, listedMasks(null, false)).get("Priya Sharma")).toBe("[name 1]");
    expect(codesFor(found, listedMasks(LIST([]), false)).get("Priya Sharma")).toBe("[name 1]");
  });
});

// ---- Apply waits for the list (R37), and only a saved list is coded against (R38) ---------------------------------------------------------------------

describe("Apply waits for the list to save", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });
  /** A save that takes a while: the participants flush waits until the returned function is called. */
  const gated = () => { let open!: () => void; h.gate = new Promise<void>((r) => { open = r; }); return () => open(); };

  it("holds the page meanwhile: Parse, Upload, Clear and the box are off, and the status says what is happening", async () => {
    await load(MOCK);
    const release = gated();
    await click("pd-apply");
    expect(text("stats-status")).toBe(E.stats_data_adding);
    for (const id of ["stats-parse", "stats-upload", "stats-clear", "pd-apply"]) expect((tid(id) as HTMLButtonElement).disabled, id).toBe(true);
    // A select inside the box's disabled fieldset is disabled by it (the property only reflects its own attribute).
    expect(sel("pd-sel-0").matches(":disabled")).toBe(true);
    expect(sel("pd-maybe-sel-2-0").matches(":disabled")).toBe(true);
    await act(async () => { release(); });
    await until(() => tid("pd-result") !== null);
    expect(text("stats-status")).toBe(E.stats_data_parsed);
    expect((tid("stats-parse") as HTMLButtonElement).disabled).toBe(false);
    expect(getLab("p1").busy).toBe(false);
  });

  it("a table parsed again meanwhile is kept: the people are added, the new table is not written over, and the box says so", async () => {
    await load(MOCK);
    const release = gated();
    await click("pd-apply");
    setText("p1", "a,b\n1,2");
    await act(async () => { await parse("p1"); });
    await act(async () => { release(); });
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_changed_added);
    expect(text("pd-result")).toBe("The people were added to your list. Your table changed meanwhile, so it was not changed.");
    expect(getData("p1")!.rows).toEqual([["1", "2"]]);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe("a,b\n1,2");
    expect(savedList().people.map((p) => p.name)).toContain("Sunita Devi");
    expect(h.download).not.toHaveBeenCalled();
  });

  it("text typed into the paste box meanwhile is not written over either", async () => {
    await load(MOCK);
    const release = gated();
    await click("pd-apply");
    await type("stats-paste", MOCK + "\nZed Zee,Kharghar,Fine,3");
    await act(async () => { release(); });
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_changed_added);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(MOCK + "\nZed Zee,Kharghar,Fine,3");
  });

  it("a project switch meanwhile writes nothing into the other project's lab", async () => {
    const root = await mount();
    await type("stats-paste", MOCK);
    await click("stats-parse");
    const release = gated();
    await click("pd-apply");
    await act(async () => { root.render(<Panel tab="data" projectId="p2" />); });
    await act(async () => { release(); });
    await until(() => getLab("p1").pdResult !== null);
    const other = getLab("p2");
    expect([other.text, other.data, other.pdResult, other.names, other.busy, other.status.kind]).toEqual(["", null, null, null, false, "none"]);
    // Nor did the first project's lab take the list back: the tab that held it is gone.
    expect(getLab("p1").ctx.list).toBeNull();
  });
});

describe("only a saved list is coded against", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); h.store.design_ec = { idMode: "codes" }; });

  it("after a save that failed the held list is not used: Apply said so, the box says the list has unsaved changes, and a second Apply changes nothing", async () => {
    h.flushOk = false;
    await load(MOCK);
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe("Could not add them to your list, so nothing was changed.");
    await until(() => tid("pd-apply") === null);
    expect(text("pd-why")).toBe(E.stats_pd_why_unsaved);
    expect(tid("pd-found")).toBeNull();
    expect(await applyPd("p1")).toBeNull();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(MOCK);
    expect(h.download).not.toHaveBeenCalled();
  });

  it("Try again saves it; the box is the list's again and codes against what was saved", async () => {
    h.flushOk = false;
    await load(MOCK);
    await click("pd-apply");
    await until(() => tid("pd-retry") !== null);
    h.flushOk = true;
    await click("pd-retry");
    await until(() => tid("pd-apply") !== null);
    expect(tid("pd-why")).toBeNull();
    // Sunita is on the saved list now: listed, not added again.
    expect(tid("pd-will-add")).toBeNull();
    await applyAndWait();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("P006,The morning walk was hard,10");
    expect(savedList().people.filter((p) => p.name === "Sunita Devi")).toHaveLength(1);
  });

  it("Apply saves the list first even when nobody is to be added, so what it codes against is what was saved", async () => {
    await load(MOCK);
    await choose("pd-unlisted-sel-0", "keep");
    await applyAndWait();
    expect(h.writes.filter((w) => w.kind === "participants")).toHaveLength(1);
    expect(listPeople()).toBe(5);
  });

  it("and says what could not be saved: the words answered Not a name, or just the list", async () => {
    h.flushOk = false;
    await load(MOCK);
    await choose("pd-unlisted-sel-0", "keep");
    await choose("pd-maybe-sel-2-0", "keep");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_not_words);
  });

  it("nothing to add and no words: the list could not be saved just now", async () => {
    h.flushOk = false;
    await load(MOCK);
    await choose("pd-unlisted-sel-0", "keep");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_not_saved);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(MOCK);
  });
});

describe("the lab with the list (R39)", () => {
  const ready = () => ({ list: MOCK_LIST(), state: "ready" as const, mode: "codes" as const, saveFailed: false });
  const today = () => "2026-10-24";

  it("a list in use whose scan is of an older list is not v1's: Apply does nothing, no fresh codes", async () => {
    const ctx = ready();
    setPdContext("p1", ctx);
    setText("p1", MOCK);
    await parse("p1");
    expect(getLab("p1").names).not.toBeNull();
    // A newer list object arrives; its scan is not made yet.
    setPdContext("p1", { ...ctx, list: { ...ctx.list } });
    expect(await applyPd("p1", {}, { saveNow: async (u) => u(ctx.list), today })).toBeNull();
    expect(getLab("p1").pdResult).toBeNull();
    expect(getLab("p1").text).toBe(MOCK);
  });

  it("a table that cannot be written after the list took the people says so, and changes nothing", async () => {
    const ctx = ready();
    setPdContext("p1", ctx);
    setText("p1", MOCK);
    await parse("p1");
    // A save that answers with the list as it was: Sunita is not on it, so the table cannot be coded.
    expect(await applyPd("p1", {}, { saveNow: async () => ctx.list, today })).toBeNull();
    expect(getLab("p1").pdResult).toEqual({ failed: "table", added: true });
    expect(getLab("p1").text).toBe(MOCK);
  });
});

describe("under an anonymous plan (R39)", () => {
  beforeEach(() => { h.store.participants = MOCK_LIST(); });

  it("no suggestion can add a person, even one chosen before the plan said so, and nothing says Apply will add", async () => {
    h.store.design_ec = { idMode: "codes" };
    await load(MOCK);
    await choose("pd-maybe-sel-2-0", "add");
    expect(text("pd-will-add")).toContain("Meena");
    h.store.design_ec = { idMode: "anonymous" };
    await rerender();
    expect(tid("pd-will-add")).toBeNull();
    expect([...sel("pd-maybe-sel-2-0").options].map((o) => o.value)).toEqual(["", "name", "keep"]);
    expect(sel("pd-maybe-sel-2-0").value).toBe("");
    await applyAndWait();
    expect(listPeople()).toBe(5);
    // She stays as typed: not replaced by a code of a person who was never added.
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("Meena didi helped me a lot");
    expect(savedList().people.map((p) => p.name)).not.toContain("Meena");
  });

  it("the line does not tell a student whose plan is anonymous to set up a vault or add participants", async () => {
    h.vault = "off";
    h.store.design_ec = { idMode: "anonymous" };
    await load(PEOPLE);
    expect(tid("pd-why")).toBeNull();
    expect(sel("pd-sel-0").value).toBe("remove");
  });

  it("a locked list is still said, without advice about codes", async () => {
    h.vault = "locked";
    h.listing = ["participants"];
    h.store.design_ec = { idMode: "anonymous" };
    await load(PEOPLE);
    expect(text("pd-why")).toBe(E.stats_pd_why_locked_anon);
  });
});

// ---- The words --------------------------------------------------------------------------------------------------------------------------------------

describe("the words", () => {
  // The box's own keys that v1's box did not have (those are the first lines of the box's block in stats.en.json).
  const V1 = new Set(["title", "intro", "remove", "code", "keep", "apply", "select_aria", "label_name", "label_phone", "label_email", "label_roll", "label_dob", "label_address", "label_govid", "pseudo", "scope", "long", "none", "unchanged", "done", "removed", "coded", "keyed"].map((k) => "stats_pd_" + k));
  const NEW = Object.keys(statsEn).filter((k) => k.startsWith("stats_pd_") && !V1.has(k));
  it("every new English key has a Hindi draft with the same placeholders, and none has an em dash or an emoji", () => {
    expect(NEW.length).toBeGreaterThan(30);
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of NEW) {
      const v = (statsEn as Record<string, string>)[k]!;
      expect(HI[k], k).toBeTruthy();
      expect(vars(HI[k]!), k).toBe(vars(v));
      expect(v, k).not.toMatch(/—/);
      expect(HI[k], k).not.toMatch(/—/);
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(HI.$draft).toMatch(/DRAFT/);
  });
  it("none of the box's lines calls the data safe (rule 8)", () => {
    for (const k of NEW) expect((statsEn as Record<string, string>)[k], k).not.toMatch(/\bsafe\b|\bno personal data\b/i);
  });
});
