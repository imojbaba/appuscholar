import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readProviderLog } from "../../qa/support/providerLog";

const dir = mkdtempSync(path.join(tmpdir(), "qa-provider-log-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const line = (key: string) => JSON.stringify({ t: 1, key, mode: "ok", host: "api.groq.com", kind: null, prompt: "p", outcome: "answered" }) + "\n";

describe("readProviderLog", () => {
  it("reads every line of a file that ends cleanly", () => {
    const f = path.join(dir, "clean.jsonl");
    writeFileSync(f, line("a") + line("b"));
    expect(readProviderLog(f).map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("leaves out a last line that is still being written, and reads it once it is whole", () => {
    const f = path.join(dir, "partial.jsonl");
    const third = line("c");
    writeFileSync(f, line("a") + line("b") + third.slice(0, 40));
    expect(readProviderLog(f).map((e) => e.key)).toEqual(["a", "b"]);
    appendFileSync(f, third.slice(40));
    expect(readProviderLog(f).map((e) => e.key)).toEqual(["a", "b", "c"]);
  });

  it("reads nothing from a first line that is not finished, an empty file or a missing one", () => {
    const f = path.join(dir, "first.jsonl");
    writeFileSync(f, line("a").slice(0, 10));
    expect(readProviderLog(f)).toEqual([]);
    writeFileSync(f, "");
    expect(readProviderLog(f)).toEqual([]);
    expect(readProviderLog(path.join(dir, "missing.jsonl"))).toEqual([]);
  });

  it("does not hide a file it cannot read", () => {
    expect(() => readProviderLog(dir)).toThrow();
  });
});
