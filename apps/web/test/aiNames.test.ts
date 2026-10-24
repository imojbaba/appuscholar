import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 11: names in AI requests (spec 2026-10-24-participants-design.md §8.3; calls C11 and C13; controller rulings R34 and R41). callAI looks for the names on the participant list and
 * for names that might be names before anything leaves the browser; the dialog's answer says which "might be" names stay as they are. The dialog itself is aiNamesDialog.test.tsx;
 * how the list and the plan are read for a request is aiNamesRead.test.ts. Here the request's names (CallCtx.names) are given, as useCallAI gives them.
 */

vi.mock("@/lib/api", () => {
  class ApiError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(`${status} ${code}`); } }
  return { apiFetch: vi.fn(), ApiError };
});
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });

import { apiFetch } from "@/lib/api";
import { callAI, resetPdMemo, type CallCtx, type PdChoice, type ScanResult } from "@/lib/ai/callAI";
import { asLiterature } from "@/lib/ai/literature";
import type { NamesCtx } from "@/lib/ai/names";
import { keyStore } from "@/lib/ai/keys";
import { emptyList, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { addPerson, destroyList, type NewPerson, withdraw } from "@/lib/tools/participants/list";

const mockFetch = vi.mocked(apiFetch);

/** A list of the people given, in order: P001, P002 ... Each is joined on the same day, with the spellings given. */
function listOf(...people: Array<Partial<NewPerson> & { name: string }>): ParticipantList {
  let l = emptyList();
  for (const p of people) l = addPerson(l, { spellings: [], joined: "2026-10-01", ...p }).list;
  return l;
}
const CLASS_9 = listOf({ name: "Priya Sharma", spellings: ["Priya"] }, { name: "Rahul Verma", spellings: ["Rahul"] });

type Setup = { names?: Partial<NamesCtx> | (() => Promise<NamesCtx>); choice?: PdChoice | ((sc: ScanResult) => PdChoice | Promise<PdChoice>); over?: Partial<CallCtx> };
/** A ctx whose dialog is answered by `choice` (Mask by default) and which records every scan it was shown. */
function setup(s: Setup = {}) {
  const shown: ScanResult[] = [];
  const names = typeof s.names === "function" ? s.names : async (): Promise<NamesCtx> => ({ list: null, mode: null, locked: false, ...s.names });
  const ctx: CallCtx = {
    provider: "gemini", blobs: {}, fallbackOn: true, contentLang: "en", projectId: "p1",
    askPassphrase: vi.fn(async () => null),
    askPd: vi.fn(async (sc: ScanResult) => {
      shown.push(sc);
      const c = s.choice ?? { answer: "mask" as const, leave: [] };
      return typeof c === "function" ? c(sc) : c;
    }),
    names: vi.fn(names),
    openSettings: vi.fn(), onFailover: vi.fn(), ...s.over
  };
  return { ctx, shown };
}
const sentBody = (call = 0) => JSON.parse(mockFetch.mock.calls[call]![1]!.body as string) as { prompt: string; pdAccepted: boolean };
const sent = (call = 0) => sentBody(call).prompt;

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({ text: "ok", model: "m" });
  store.clear();
  resetPdMemo();
  for (const p of ["gemini", "groq", "openrouter", "claude"] as const) keyStore.clear(p);
  keyStore.setSession("gemini", "AIza1");
});

describe("names on the participant list (§8.3)", () => {
  it("counts the listed name beside the email, and Mask sends the person's code and [email]", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Priya Sharma said she wrote to priya@example.com about sleep.", {}, ctx);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.names).toEqual({ listed: 1, maybe: [], locked: false });
    expect(shown[0]!.counts).toEqual({ "email address": 1 });
    expect(sent()).toBe("P001 said she wrote to [email] about sleep.");
    expect(sentBody().pdAccepted).toBe(false);
  });

  it("a name written inside an email address belongs to the address: counted once, masked once", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Write to priya.sharma@college.edu, and tell Priya.", {}, ctx);
    expect(shown[0]!.names).toEqual({ listed: 1, maybe: [], locked: false });
    expect(shown[0]!.counts).toEqual({ "email address": 1 });
    expect(sent()).toBe("Write to [email], and tell P001.");
    const only = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Write to priya@college.edu.", {}, only.ctx);
    expect(only.shown[0]!.names).toEqual({ listed: 0, maybe: [], locked: false });
  });

  it("a request with only a listed name opens the dialog too, and Mask is not a personal-data accept", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Rahul found the first week hard, and Priya's mother agreed.", {}, ctx);
    expect(shown[0]!.names).toEqual({ listed: 2, maybe: [], locked: false });
    expect(shown[0]!.total).toBe(0);
    expect(sent()).toBe("P002 found the first week hard, and P001's mother agreed.");
    expect(sentBody().pdAccepted).toBe(false);
  });

  it("names on the list are matched in every request, a literature one too", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Priya Sharma (2019) argued that sleep matters.", { literature: true }, ctx);
    expect(shown[0]!.names?.listed).toBe(1);
    expect(sent()).toBe("P001 (2019) argued that sleep matters.");
  });

  it("in made-up names mode Mask writes the made-up name, and the code for a person who has none", async () => {
    const list = listOf({ name: "Priya Sharma", spellings: ["Priya"], pseudonym: "Tara" }, { name: "Rahul Verma", spellings: ["Rahul"] });
    const { ctx } = setup({ names: { list, mode: "pseudonyms" } });
    await callAI("Priya and Rahul sat together.", {}, ctx);
    expect(sent()).toBe("Tara and P002 sat together.");
  });

  it("in codes mode the made-up name is not used", async () => {
    const list = listOf({ name: "Priya Sharma", spellings: ["Priya"], pseudonym: "Tara" });
    const { ctx } = setup({ names: { list, mode: "codes" } });
    await callAI("Priya sat alone.", {}, ctx);
    expect(sent()).toBe("P001 sat alone.");
  });

  it("a person who withdrew is still looked for, and a destroyed list looks for nobody", async () => {
    const withdrew = withdraw(CLASS_9, CLASS_9.people[0]!.id, "2026-10-15", "remove");
    const a = setup({ names: { list: withdrew, mode: "codes" } });
    await callAI("Priya left early.", {}, a.ctx);
    expect(sent(0)).toBe("P001 left early.");
    const b = setup({ names: { list: destroyList(CLASS_9, "2026-10-20"), mode: "anonymous" } });
    await callAI("Priya left early.", {}, b.ctx);
    expect(b.shown).toHaveLength(0);
    expect(sent(1)).toBe("Priya left early.");
  });

  it("Send as it is sends the names untouched and marks the request accepted", async () => {
    const { ctx } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Priya Sharma said hello.", {}, ctx);
    expect(sent()).toBe("Priya Sharma said hello.");
    expect(sentBody().pdAccepted).toBe(true);
  });

  it("Cancel sends nothing", async () => {
    const { ctx } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "cancel", leave: [] } });
    await expect(callAI("Priya Sharma said hello.", {}, ctx)).rejects.toThrow("Cancelled. Nothing was sent to the AI provider.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("without a names context (a window with no project) the check is as it was: emails, phones and ID numbers", async () => {
    const { ctx, shown } = setup({ over: { names: undefined } });
    await callAI("Priya Sharma said hello.", {}, ctx);
    expect(shown).toHaveLength(0);
    expect(sent()).toBe("Priya Sharma said hello.");
  });

  it("noScan skips the names too: nothing is read and nothing is asked", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Priya Sharma said hello.", { noScan: true }, ctx);
    expect(ctx.names).not.toHaveBeenCalled();
    expect(shown).toHaveLength(0);
    expect(sent()).toBe("Priya Sharma said hello.");
  });
});

describe("names that might be names (C13, R34)", () => {
  const MEENA = "Meena said the first week was hard.";

  it.each([
    ["a codes plan", { mode: "codes" as const, list: null }, true],
    ["a made-up names plan", { mode: "pseudonyms" as const, list: null }, true],
    ["an anonymous plan and no list", { mode: "anonymous" as const, list: null }, false],
    ["no plan answer and no list", { mode: null, list: null }, false],
    ["no plan answer but somebody on a list", { mode: null, list: CLASS_9 }, true],
    ["an anonymous plan but a list of people (matching runs while a list exists, C15)", { mode: "anonymous" as const, list: CLASS_9 }, true],
    ["a list nobody is on", { mode: null, list: emptyList() }, false]
  ])("%s: Meena is suggested = %s", async (_why, names, suggested) => {
    const { ctx, shown } = setup({ names });
    await callAI(MEENA, {}, ctx);
    if (suggested) {
      expect(shown).toHaveLength(1);
      expect(shown[0]!.names).toEqual({ listed: 0, maybe: ["Meena"], locked: false });
      expect(sent()).toBe("[name] said the first week was hard.");
    } else {
      expect(shown).toHaveLength(0);
      expect(sent()).toBe(MEENA);
    }
  });

  it("a literature request opens no dialog: Carl Rogers (1951) is not a participant", async () => {
    const { ctx, shown } = setup({ names: { mode: "codes", list: null } });
    await callAI("Carl Rogers (1951) described the client-centred approach.", { literature: true }, ctx);
    expect(shown).toHaveLength(0);
    expect(sent()).toBe("Carl Rogers (1951) described the client-centred approach.");
    // The same words as the student's own text are asked about.
    const own = setup({ names: { mode: "codes", list: null } });
    await callAI("Carl Rogers (1951) described the client-centred approach.", {}, own.ctx);
    expect(own.shown[0]!.names?.maybe).toEqual(["Carl"]);
  });

  it("a speaker label is one suggestion, and the first name inside it is not asked again", async () => {
    const { ctx, shown } = setup({ names: { mode: "codes", list: null } });
    await callAI("Interviewer: How was it?\nMeena Devi: Hard at first. Meena was not there.", {}, ctx);
    expect(shown[0]!.names?.maybe).toEqual(["Meena Devi", "Meena"]);
    expect(sent()).toBe("Interviewer: How was it?\n[name]: Hard at first. [name] was not there.");
  });

  it("each word is listed once, however often it is written, and every place becomes [name]", async () => {
    const { ctx, shown } = setup({ names: { mode: "codes", list: null } });
    await callAI("Meena came. Then Meena wrote to a@b.com. Meena left.", {}, ctx);
    expect(shown[0]!.names?.maybe).toEqual(["Meena"]);
    expect(sent()).toBe("[name] came. Then [name] wrote to [email]. [name] left.");
  });

  it("Leave on Meena sends her name and still masks what was left at Mask", async () => {
    const { ctx } = setup({ names: { mode: "codes", list: CLASS_9 }, choice: { answer: "mask", leave: ["Meena"] } });
    await callAI("Priya told Meena and Neha, and wrote to a@b.com.", {}, ctx);
    expect(sent()).toBe("P001 told Meena and [name], and wrote to [email].");
  });

  it("Leave is read in the normal form: any case", async () => {
    const { ctx } = setup({ names: { mode: "codes", list: null }, choice: { answer: "mask", leave: ["meena"] } });
    await callAI("Meena came.", {}, ctx);
    expect(sent()).toBe("Meena came.");
  });

  it("a name the student said is not a name is not suggested, and nor is a made-up name (R34)", async () => {
    const list: ParticipantList = { ...listOf({ name: "Priya Sharma", spellings: ["Priya"], pseudonym: "Neha" }), notNames: ["meena"] };
    const { ctx, shown } = setup({ names: { mode: "pseudonyms", list } });
    await callAI("Meena and Neha were there.", {}, ctx);
    expect(shown).toHaveLength(0);
    expect(sent()).toBe("Meena and Neha were there.");
  });

  it("a listed name that is also an everyday word is asked about: it is a 'might be', and Mask makes it the person's code", async () => {
    const list = listOf({ name: "Asha Kumari", spellings: ["Asha"] }, { name: "Priya Sharma", spellings: ["Priya"] });
    const { ctx, shown } = setup({ names: { mode: "codes", list } });
    await callAI("Asha said Priya was late.", {}, ctx);
    expect(shown[0]!.names).toEqual({ listed: 1, maybe: ["Asha"], locked: false });
    expect(sent()).toBe("P001 said P002 was late.");
    // Left at Leave, it stays.
    const left = setup({ names: { mode: "codes", list }, choice: { answer: "mask", leave: ["Asha"] } });
    await callAI("Asha said Priya was late.", {}, left.ctx);
    expect(sent(1)).toBe("Asha said P002 was late.");
  });

  it("a name two people share becomes [name], never the code of one of them", async () => {
    const list = listOf({ name: "Sam Rao", spellings: ["Sam"] }, { name: "Sam Dutta", spellings: ["Sam"] });
    const { ctx, shown } = setup({ names: { mode: "codes", list } });
    await callAI("Sam spoke first.", {}, ctx);
    expect(shown[0]!.names).toEqual({ listed: 0, maybe: ["Sam"], locked: false });
    expect(sent()).toBe("[name] spoke first.");
  });
});

describe("literature callers", () => {
  it("asLiterature adds literature: true to every request and keeps the rest of the options", async () => {
    const call = vi.fn(async (_prompt: string, _opts?: object) => "ok");
    const lit = asLiterature(call);
    await lit("a paper", { temp: 0.2, max: 900, noLang: true });
    await lit("another paper");
    expect(call.mock.calls).toEqual([["a paper", { temp: 0.2, max: 900, noLang: true, literature: true }], ["another paper", { literature: true }]]);
  });
});

describe("Send as it is is remembered, with the names in the signature", () => {
  it("the same names are not asked about twice; a new name asks again", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Priya said hello.", {}, ctx);
    await callAI("Priya said goodbye.", {}, ctx);
    expect(shown).toHaveLength(1);
    expect(sentBody(1).pdAccepted).toBe(true);
    await callAI("Priya and Rahul said goodbye.", {}, ctx);
    expect(shown).toHaveLength(2);
    // Another name in a "might be" place asks again as well.
    const m = setup({ names: { mode: "codes", list: null }, choice: { answer: "send", leave: [] } });
    await callAI("Meena came.", {}, m.ctx);
    await callAI("Meena came again.", {}, m.ctx);
    await callAI("Sunita came.", {}, m.ctx);
    expect(m.shown).toHaveLength(2);
  });

  it("the signature carries the names in the normal form, so 'priya' and 'Priya' are one", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Priya said hello.", {}, ctx);
    await callAI("PRIYA said hello.", {}, ctx);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.sig).toContain("priya");
  });

  it("the signature includes the project: a Send in project A never covers project B (R43)", async () => {
    const a = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] }, over: { projectId: "A" } });
    const b = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] }, over: { projectId: "B" } });
    await callAI("Priya said hello.", {}, a.ctx);
    await callAI("Priya said hello.", {}, a.ctx);
    expect(a.shown).toHaveLength(1);
    await callAI("Priya said hello.", {}, b.ctx);
    expect(b.shown).toHaveLength(1);
    expect(b.shown[0]!.sig).toContain("B");
    expect(a.shown[0]!.sig).not.toBe(b.shown[0]!.sig);
    // The locked line is the same: a project's own.
    const la = setup({ names: { list: null, mode: null, locked: true }, choice: { answer: "send", leave: [] }, over: { projectId: "A" } });
    const lb = setup({ names: { list: null, mode: null, locked: true }, choice: { answer: "send", leave: [] }, over: { projectId: "B" } });
    await callAI("Plain words.", {}, la.ctx);
    await callAI("Plain words.", {}, lb.ctx);
    expect(la.shown).toHaveLength(1);
    expect(lb.shown).toHaveLength(1);
  });

  it("an email address and a name together are one signature: a new name still asks", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Priya wrote to a@b.com.", {}, ctx);
    await callAI("Priya wrote to a@b.com.", {}, ctx);
    await callAI("Rahul wrote to a@b.com.", {}, ctx);
    expect(shown).toHaveLength(2);
  });
});

describe("a participant list that is locked (R41)", () => {
  const LOCKED = { list: null, mode: null, locked: true };

  it("opens the dialog with only the locked line when nothing else is found, and Send as it is goes on", async () => {
    const { ctx, shown } = setup({ names: LOCKED, choice: { answer: "send", leave: [] } });
    await callAI("Plain words with no personal details.", {}, ctx);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.names).toEqual({ listed: 0, maybe: [], locked: true });
    expect(shown[0]!.total).toBe(0);
    expect(sent()).toBe("Plain words with no personal details.");
    expect(sentBody().pdAccepted).toBe(true);
    // Asked once for this session's signature, not before every request.
    await callAI("More plain words.", {}, ctx);
    expect(shown).toHaveLength(1);
  });

  it("Cancel stops the request", async () => {
    const { ctx } = setup({ names: LOCKED, choice: { answer: "cancel", leave: [] } });
    await expect(callAI("Plain words.", {}, ctx)).rejects.toThrow("Cancelled");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("alongside an email it is the same dialog; Mask masks the email and says nothing of names", async () => {
    const { ctx, shown } = setup({ names: LOCKED });
    await callAI("Write to a@b.com about Priya.", {}, ctx);
    expect(shown[0]!.names?.locked).toBe(true);
    expect(shown[0]!.counts).toEqual({ "email address": 1 });
    expect(sent()).toBe("Write to [email] about Priya.");
  });

  it("no suggestions are made while the list is locked: its Not a name words and made-up names cannot be read", async () => {
    const { ctx, shown } = setup({ names: { ...LOCKED, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Meena came.", {}, ctx);
    expect(shown[0]!.names).toEqual({ listed: 0, maybe: [], locked: true });
  });

  it("Unlock opens the vault and the request is scanned again with the list", async () => {
    let unlocked = false;
    const unlock = vi.fn(async () => { unlocked = true; return true; });
    const { ctx, shown } = setup({
      names: async () => (unlocked ? { list: CLASS_9, mode: "codes", locked: false } : { list: null, mode: null, locked: true }),
      choice: (sc) => (sc.names?.locked ? { answer: "unlock", leave: [] } : { answer: "mask", leave: [] }),
      over: { unlock }
    });
    await callAI("Priya said hello.", {}, ctx);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(shown).toHaveLength(2);
    expect(shown[0]!.names?.locked).toBe(true);
    expect(shown[1]!.names).toEqual({ listed: 1, maybe: [], locked: false });
    expect(sent()).toBe("P001 said hello.");
  });

  it("Unlock that finds nothing to flag in the unlocked list carries on without asking again", async () => {
    let unlocked = false;
    const { ctx, shown } = setup({
      names: async () => (unlocked ? { list: CLASS_9, mode: "codes", locked: false } : { list: null, mode: null, locked: true }),
      choice: { answer: "unlock", leave: [] },
      over: { unlock: vi.fn(async () => { unlocked = true; return true; }) }
    });
    await callAI("Nobody is named here.", {}, ctx);
    expect(shown).toHaveLength(1);
    expect(sent()).toBe("Nobody is named here.");
  });

  it("Unlock that is cancelled asks again, still locked", async () => {
    const answers: PdChoice[] = [{ answer: "unlock", leave: [] }, { answer: "send", leave: [] }];
    const { ctx, shown } = setup({ names: LOCKED, choice: () => answers.shift()!, over: { unlock: vi.fn(async () => false) } });
    await callAI("Plain words.", {}, ctx);
    expect(shown).toHaveLength(2);
    expect(shown[1]!.names?.locked).toBe(true);
    expect(sent()).toBe("Plain words.");
  });
});

describe("Explain asks first about the table's names; callAI does not ask again (namesAsked)", () => {
  it("a name the step asked about is skipped, and another is still asked", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" }, choice: { answer: "send", leave: [] } });
    await callAI("Group Priya Sharma scored higher than group Rahul Verma.", { namesAsked: ["priya sharma"] }, ctx);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.names).toEqual({ listed: 1, maybe: [], locked: false });
    expect(shown[0]!.sig).not.toContain("priya sharma");
    const both = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Group Priya Sharma scored higher than group Rahul Verma.", { namesAsked: ["priya sharma", "rahul verma"] }, both.ctx);
    expect(both.shown).toHaveLength(0);
    expect(sent(1)).toBe("Group Priya Sharma scored higher than group Rahul Verma.");
  });

  it("is read in the normal form, and a suggestion is skipped like a listed name", async () => {
    const { ctx, shown } = setup({ names: { mode: "codes", list: null } });
    await callAI("Meena and Sunita.", { namesAsked: ["meena"] }, ctx);
    expect(shown[0]!.names?.maybe).toEqual(["Sunita"]);
    expect(sent()).toBe("Meena and [name].");
  });

  it("only the whole asked value is skipped: a lone first name elsewhere that belongs to another listed person is still found (R43)", async () => {
    const list = listOf({ name: "Priya Sharma" }, { name: "Priya Iyer", spellings: ["Priya"] });
    const { ctx, shown } = setup({ names: { mode: "codes", list }, choice: { answer: "mask", leave: [] } });
    await callAI("Priya Sharma met Priya at the door.", { namesAsked: ["priya sharma"] }, ctx);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.names).toEqual({ listed: 1, maybe: [], locked: false });
    expect(sent()).toBe("Priya Sharma met P002 at the door.");
  });

  it("a word inside the asked value's own place in the request is the same name: the first name in a group label", async () => {
    const a = setup({ names: { mode: "codes", list: null } });
    await callAI("Sara Khan scored higher than the others.", { namesAsked: ["sara khan"] }, a.ctx);
    expect(a.shown).toHaveLength(0);
    expect(sent(0)).toBe("Sara Khan scored higher than the others.");
    // Written another way (case, a dot, extra spaces) it is still the asked value's place.
    const b = setup({ names: { mode: "codes", list: null } });
    await callAI("SARA  khan scored higher; so did sara.", { namesAsked: ["sara khan"] }, b.ctx);
    expect(b.shown).toHaveLength(0);
    expect(sent(1)).toBe("SARA  khan scored higher; so did sara.");
    // A lone first name outside any place of it is another mention, and is asked about.
    const c = setup({ names: { mode: "codes", list: null } });
    await callAI("Sara Khan met Sara and Sunita.", { namesAsked: ["sara khan"] }, c.ctx);
    expect(c.shown[0]!.names?.maybe).toEqual(["Sara", "Sunita"]);
  });

  it("an email in the same request is still callAI's to ask about", async () => {
    const { ctx, shown } = setup({ names: { list: CLASS_9, mode: "codes" } });
    await callAI("Priya wrote to a@b.com.", { namesAsked: ["priya"] }, ctx);
    expect(shown[0]!.names).toEqual({ listed: 0, maybe: [], locked: false });
    expect(shown[0]!.counts).toEqual({ "email address": 1 });
    expect(sent()).toBe("Priya wrote to [email].");
  });
});
