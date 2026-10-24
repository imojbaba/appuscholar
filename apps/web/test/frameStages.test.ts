import { describe, expect, it } from "vitest";
import { BLOB_KINDS } from "@/lib/blobs/kinds";
import { KIND_STAGE, stageOfKind, stageStates, type StageWork } from "@/lib/frame/stages";

const work = (w: Partial<StageWork> = {}): StageWork => ({ blobs: [], draftWords: 0, draftEditedAt: null, stageMarks: {}, ...w });
const at = "2026-10-21T10:00:00.000Z";

describe("the kind-to-stage map", () => {
  it("every blob kind the api allows has a stage", () => {
    for (const k of BLOB_KINDS) expect(KIND_STAGE[k]).toBeDefined();
    expect(stageOfKind("shelf_paper:p1")).toEqual({ stage: "lit", work: true });
  });

  it("every new kind maps to its stage in KIND_STAGE", () => {
    // Task G3: one kind per v1 key group of the stage 3 to 6 tools; the *_prefs kinds are not work.
    const want = {
      design_reg: ["design", true], design_proto: ["design", true], design_ec: ["design", true], design_ctri: ["design", true], design_pi: ["design", true], design_budget: ["design", true],
      stats_sets: ["collect", true], stats_runs: ["collect", true], stats_prefs: ["collect", false], qual_codes: ["collect", true], qual_prefs: ["collect", false],
      style_profile: ["writing", true], style_samples: ["writing", true], style_meta: ["writing", true], words_bank: ["writing", true], words_prefs: ["writing", false],
      close_prefs: ["review", false], viva_log: ["review", true], participants: ["collect", true]
    } as const;
    for (const [k, [stage, w]] of Object.entries(want)) {
      expect(BLOB_KINDS, k).toContain(k);
      expect(stageOfKind(k), k).toEqual({ stage, work: w });
    }
    expect(BLOB_KINDS.slice(9)).toEqual(Object.keys(want));
  });

  it("idea_intake is Idea work; citations, shelf_index and ap_notes are Literature work; caches and preferences are Literature, not work", () => {
    expect(stageOfKind("idea_intake")).toEqual({ stage: "idea", work: true });
    for (const k of ["citations", "shelf_index", "ap_notes"]) expect(stageOfKind(k)).toEqual({ stage: "lit", work: true });
    for (const k of ["retraction_cache", "refcheck_cache", "rs_prefs", "ap_cols", "shelf_cols"]) expect(stageOfKind(k)).toEqual({ stage: "lit", work: false });
  });

  it("an unknown kind from a newer build is ignored", () => {
    expect(stageOfKind("design_plan")).toBeNull();
    expect(stageOfKind("toString")).toBeNull();
    const s = stageStates(work({ blobs: [{ kind: "design_plan", updatedAt: at }] }));
    expect(Object.values(s).every((v) => v === "not-started")).toBe(true);
  });
});

describe("stageStates", () => {
  it("a project with no work has every stage not started", () => {
    expect(stageStates(work())).toEqual({ idea: "not-started", lit: "not-started", design: "not-started", collect: "not-started", writing: "not-started", review: "not-started" });
  });

  it("caches are not work: a project with only refcheck_cache has Literature not started", () => {
    expect(stageStates(work({ blobs: [{ kind: "refcheck_cache", updatedAt: at }, { kind: "rs_prefs", updatedAt: at }] })).lit).toBe("not-started");
  });

  it("saving design_reg turns Design and ethics In progress; a prefs kind does not", () => {
    const before = [{ kind: "idea_intake", updatedAt: at }, { kind: "citations", updatedAt: at }];
    expect(stageStates(work({ blobs: before })).design).toBe("not-started");
    expect(stageStates(work({ blobs: [...before, { kind: "design_reg", updatedAt: at }] })).design).toBe("in-progress");
    // Preferences are not work: the stage they belong to stays as it was.
    const prefs = stageStates(work({ blobs: [...before, ...["stats_prefs", "qual_prefs", "words_prefs", "close_prefs"].map((kind) => ({ kind, updatedAt: at }))] }));
    expect([prefs.collect, prefs.writing, prefs.review]).toEqual(["not-started", "not-started", "not-started"]);
    // A tool's work counts for its own stage: the viva log for Review, the word bank for Writing.
    const s = stageStates(work({ blobs: [...before, { kind: "viva_log", updatedAt: at }, { kind: "words_bank", updatedAt: at }] }));
    expect([s.review, s.writing]).toEqual(["started-early", "in-progress"]);
  });

  it("Literature with work while Idea has none is started early", () => {
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: at }] })).lit).toBe("started-early");
    expect(stageStates(work({ blobs: [{ kind: "shelf_paper:p1", updatedAt: at }] })).lit).toBe("started-early");
  });

  it("a stage with work whose earlier stages all have work or a mark is in progress", () => {
    const s = stageStates(work({ blobs: [{ kind: "idea_intake", updatedAt: at }, { kind: "ap_notes", updatedAt: at }] }));
    expect(s.idea).toBe("in-progress");
    expect(s.lit).toBe("in-progress");
    // Idea marked Ready with no work of its own still counts as started for Literature
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: at }], stageMarks: { idea: { readyAt: at } } })).lit).toBe("in-progress");
  });

  it("Writing with words is in progress even when Collection is empty", () => {
    const s = stageStates(work({ draftWords: 423, draftEditedAt: at }));
    expect(s.writing).toBe("in-progress");
    expect(s.collect).toBe("not-started");
  });

  it("Writing with no words is not started, whatever its edit date", () => {
    expect(stageStates(work({ draftWords: 0, draftEditedAt: at })).writing).toBe("not-started");
  });

  it("a mark with no later work is ready, even with no work at all", () => {
    expect(stageStates(work({ stageMarks: { design: { readyAt: at } } })).design).toBe("ready");
  });

  it("a change after Ready reopens; a change before it does not (Review Focus 5)", () => {
    const marks = { lit: { readyAt: at }, writing: { readyAt: at } };
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: "2026-10-21T10:00:01.000Z" }], stageMarks: marks })).lit).toBe("reopened");
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: "2026-10-21T09:59:59.000Z" }], stageMarks: marks })).lit).toBe("ready");
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: at }], stageMarks: marks })).lit).toBe("ready");
    // a cache written after Ready is not a change
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: "2026-10-21T09:00:00.000Z" }, { kind: "refcheck_cache", updatedAt: "2026-10-21T11:00:00.000Z" }], stageMarks: marks })).lit).toBe("ready");
    // the document: an edit after Ready reopens Writing
    expect(stageStates(work({ draftWords: 10, draftEditedAt: "2026-10-21T11:00:00.000Z", stageMarks: marks })).writing).toBe("reopened");
    expect(stageStates(work({ draftWords: 10, draftEditedAt: "2026-10-21T09:00:00.000Z", stageMarks: marks })).writing).toBe("ready");
  });

  it("times are compared as instants, not as strings of different formats", () => {
    const marks = { lit: { readyAt: at } };
    // 15:00 at +05:30 is 09:30Z: before Ready, though it sorts after it as a string
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: "2026-10-21T15:00:00+05:30" }], stageMarks: marks })).lit).toBe("ready");
    // the same instant without milliseconds is not after Ready, though "…00Z" sorts after "…00.000Z" as a string
    expect(stageStates(work({ blobs: [{ kind: "citations", updatedAt: "2026-10-21T10:00:00Z" }], stageMarks: marks })).lit).toBe("ready");
    // 11:00 at +02:00 is 09:00Z for the document too
    expect(stageStates(work({ draftWords: 5, draftEditedAt: "2026-10-21T11:00:00+02:00", stageMarks: { writing: { readyAt: at } } })).writing).toBe("ready");
  });

  it("the newest work blob decides lastWork", () => {
    const s = stageStates(work({
      blobs: [{ kind: "citations", updatedAt: "2026-10-21T09:00:00.000Z" }, { kind: "ap_notes", updatedAt: "2026-10-21T12:00:00.000Z" }, { kind: "shelf_index", updatedAt: "2026-10-21T08:00:00.000Z" }],
      stageMarks: { lit: { readyAt: at } }
    }));
    expect(s.lit).toBe("reopened");
  });
});
