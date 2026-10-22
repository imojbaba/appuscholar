// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clCompare, clReportText, type ClResult, type ClSource } from "@appuscholar/core";
import { CL_COLS, CLOSE_FILE, closeReport, markedPieces } from "../lib/tools/close/report";
import { gatherSources, otherDocuments } from "../lib/tools/close/sources";
import { createRunner } from "../lib/tools/close/runner";
import { answer } from "../lib/tools/close/worker";

/*
 * The Closeness tab's own code (Task E2): the report it saves, the marked text, the sources it gathers, and the runner that keeps the comparison off the page's thread. The engine's
 * numbers are Task 1's goldens (packages/core/test/golden/closeness/cases.json, captured from v1); here they are replayed through the panel's own paths.
 */
type Case = { id: string; studentText: string; sources: ClSource[]; k: number; minRun: number; date: string; result: ClResult; report: string };
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/closeness/cases.json"), "utf8")) as { cases: Case[] };

afterEach(() => { vi.unstubAllGlobals(); });

describe("the report the Download button saves", () => {
  it("is named closeness-check.txt", () => { expect(CLOSE_FILE).toBe("closeness-check.txt"); });
  it("is v1's report text for every golden case, the date injected", () => {
    for (const c of FX.cases) {
      expect(closeReport(clCompare(c.studentText, c.sources, c.k, c.minRun), new Date(c.date)), c.id).toBe(c.report);
    }
  });
  it("is the engine's clReportText with the date's first ten characters", () => {
    const c = FX.cases.find((x) => x.id === "second-date")!;
    expect(closeReport(c.result, new Date(c.date))).toBe(clReportText(c.result, c.date.slice(0, 10)));
  });
});

describe("the marked text", () => {
  it("cuts the text at each run: plain text before, the run, the rest, tagged [source.n] as v1 tagged them", () => {
    const c = FX.cases.find((x) => x.id === "three-sources")!;
    const r = clCompare(c.studentText, c.sources, c.k, c.minRun);
    const pieces = markedPieces(c.studentText, r.runs);
    expect(pieces.map((p) => p.text).join("")).toBe(c.studentText);
    const marked = pieces.filter((p) => p.run);
    expect(marked.map((p) => p.run!.tag)).toEqual(r.runs.map((x, n) => "[" + (x.src + 1) + "." + (n + 1) + "]"));
    marked.forEach((p, n) => expect(p.text).toBe(c.studentText.slice(r.runs[n]!.cs, r.runs[n]!.ce)));
  });
  it("is one plain piece when nothing matched", () => {
    expect(markedPieces("hello world", [])).toEqual([{ text: "hello world" }]);
  });
  it("has v1's five colours, one for each source in turn", () => {
    expect(CL_COLS).toHaveLength(5);
  });
});

describe("the sources", () => {
  const docs = [
    { id: "a", title: "Open one", text: "x", html: "<p>" + "a".repeat(300) + "</p>" },
    { id: "b", title: "Other", text: "y", html: "<p>" + "b".repeat(300) + "</p>" },
    { id: "c", title: "Short", text: "z", html: "<p>tiny</p>" }
  ];
  it("lists other documents as v1 did: not the open one, only a body longer than 200 characters", () => {
    expect(otherDocuments(docs, "a", "").map((d) => d.id)).toEqual(["b"]);
  });
  it("with no open document known (a pop-out), leaves out the one whose text is the open text", () => {
    expect(otherDocuments(docs, null, "x").map((d) => d.id)).toEqual(["b"]);
  });
  it("gathers ticked papers by loading each one's pages, ticked documents and the paste, in v1's order and kinds", async () => {
    const loadPaper = vi.fn(async (id: string) => (id === "p1" ? { pages: ["one", "two"], notes: [], cells: {} } : null));
    const index = [{ id: "p1", title: "Paper one", file: "p1.pdf", size: 1, added: "", total: 2, kept: 2 }, { id: "p2", title: "Paper two", file: "p2.pdf", size: 1, added: "", total: 1, kept: 1 }];
    const g = await gatherSources({ picked: ["s:p1", "s:p2", "d:b"], index, loadPaper, docs: otherDocuments(docs, "a", ""), pasted: "  pasted words  " });
    expect(g.sources.map((s) => [s.name, s.kind])).toEqual([["Paper one", "Reading shelf"], ["Other", "your document"], ["Pasted passage", "pasted"]]);
    expect(g.sources[0]!.pageStarts).toEqual([0, 4]);
    expect(g.unreadable).toBe(1);
  });
});

describe("the runner", () => {
  const job = () => { const c = FX.cases.find((x) => x.id === "chunks-k6-min10")!; return c; };
  it("without a Worker (jsdom, tests) compares on the main thread and gives v1's result for every golden case", async () => {
    expect(typeof Worker).toBe("undefined");
    const run = createRunner();
    for (const c of FX.cases) {
      const r = await run.run(c.studentText, c.sources, c.k, c.minRun);
      expect(r, c.id).toEqual(c.result);
    }
    run.dispose();
  });
  it("with a Worker, posts the job and answers with the worker's result", async () => {
    const posted: unknown[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      static made = 0;
      constructor() { FakeWorker.made++; }
      postMessage(m: Parameters<typeof answer>[0]) { posted.push(m); const reply = answer(m); queueMicrotask(() => this.onmessage?.({ data: reply })); }
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);
    const c = job();
    const run = createRunner();
    const r = await run.run(c.studentText, c.sources, c.k, c.minRun);
    expect(r).toEqual(c.result);
    expect(posted).toHaveLength(1);
    expect(FakeWorker.made).toBe(1);
    await run.run(c.studentText, c.sources, c.k, c.minRun);
    expect(FakeWorker.made).toBe(1);
    run.dispose();
  });
  it("falls back to the main thread when the worker fails", async () => {
    class BadWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      postMessage() { queueMicrotask(() => this.onerror?.(new Error("blocked"))); }
      terminate() {}
    }
    vi.stubGlobal("Worker", BadWorker);
    const c = job();
    const run = createRunner();
    expect(await run.run(c.studentText, c.sources, c.k, c.minRun)).toEqual(c.result);
    run.dispose();
  });
  it("falls back to the main thread when the worker's reply cannot be read (messageerror)", async () => {
    class DeafWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onmessageerror: ((e: unknown) => void) | null = null;
      postMessage() { queueMicrotask(() => this.onmessageerror?.(new Error("unclonable"))); }
      terminate() {}
    }
    vi.stubGlobal("Worker", DeafWorker);
    const c = job();
    const run = createRunner();
    expect(await run.run(c.studentText, c.sources, c.k, c.minRun)).toEqual(c.result);
    run.dispose();
  });
  it("falls back when a Worker cannot be made", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("no worker"); } });
    const c = job();
    const run = createRunner();
    expect(await run.run(c.studentText, c.sources, c.k, c.minRun)).toEqual(c.result);
    run.dispose();
  });
  it("the worker's answer to a job is the engine's result, and an error is an answer, not a throw", () => {
    const c = job();
    expect(answer({ id: 7, text: c.studentText, sources: c.sources, k: c.k, minRun: c.minRun })).toEqual({ id: 7, result: c.result });
    const bad = answer({ id: 8, text: "x", sources: null as unknown as ClSource[], k: 6, minRun: 8 });
    expect(bad.id).toBe(8);
    expect(typeof bad.error).toBe("string");
  });
});
