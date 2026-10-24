import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETS, SET_NAMES } from "@appuscholar/quality/sets";
import { qualityCli, viaGateway, withTimeout, writeReportFile, type QualityCliDeps } from "../scripts/quality";
import { AiError, type CompleteInput, type CompleteOutput } from "../src/ai/types";

/** A stub key. The CLI must never print it, log it, write it to a report or put it in an error message. */
const KEY = "gsk_TEST_KEY_do_not_print_0123456789abcdef";

const SUMMARY = [
  "Aim: To see how sleep relates to marks in students.",
  "Method: A cross-sectional questionnaire completed by 201 female students at one university.",
  "Key findings: Poorer sleep went with a lower GPA (p = 0.0047).",
  "Limitations: The design is cross-sectional. GPA was self-reported. Only female students from a single university took part."
].join("\n");

type Harness = ReturnType<typeof harness>;
/** The CLI's dependencies, all stubbed: a provider that answers `reply(input, n)`, a file writer that keeps files in a map, a fixed clock, a sleep that only counts. */
function harness(o: { env?: Record<string, string | undefined>; reply?: (input: CompleteInput, n: number) => string | Promise<string> } = {}) {
  const files = new Map<string, string>();
  const out: string[] = [];
  const err: string[] = [];
  const sleeps: number[] = [];
  const calls: CompleteInput[] = [];
  const deps: QualityCliDeps = {
    env: "env" in o ? o.env! : { QUALITY_API_KEY: KEY },
    complete: async (input): Promise<CompleteOutput> => { calls.push(input); return { text: await (o.reply ?? (() => SUMMARY))(input, calls.length - 1), model: "openai/gpt-oss-120b" }; },
    writeFile: async (path, text) => { files.set(path, text); },
    now: () => new Date(2026, 9, 24, 12, 0, 0), // local noon, so the local date is the 24th in every time zone
    sleep: async (ms) => { sleeps.push(ms); },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    reportsDir: join("/repo", "reports")
  };
  return { deps, files, out, err, sleeps, calls };
}
const run = (h: Harness, ...argv: string[]) => qualityCli(argv, h.deps);
/** Everything the CLI could have shown or kept: its lines, the paths and the texts of the files. */
const everything = (h: Harness): string => [...h.out, ...h.err, ...h.files.keys(), ...h.files.values()].join("\n");

describe("the quality CLI", () => {
  it("runs a set against the provider with the key from the environment and writes <set>-<provider>-<date>.md into the reports folder", async () => {
    const h = harness();
    const code = await run(h, "--set", "summary", "--provider", "groq", "--repeats", "2");
    expect(code).toBe(0);
    // Four summary papers, two repeats each; every call carries the provider, the key, the builder's prompt and its options.
    expect(h.calls).toHaveLength(8);
    expect(h.calls.every((c) => c.provider === "groq" && c.apiKey === KEY)).toBe(true);
    expect(h.calls[0]).toMatchObject({ temperature: 0.2, maxTokens: 1000 });
    expect(h.calls[0]!.prompt).toContain("PAPER TEXT");
    // One report, named for the set, the provider and the day.
    expect([...h.files.keys()]).toEqual([join("/repo", "reports", "summary-groq-2026-10-24.md")]);
    const md = [...h.files.values()][0]!;
    for (const line of ["# Quality report: summary", "- Repeats: 2", "- Provider: groq", "- Model: openai/gpt-oss-120b", "- Date: 2026-10-24"]) expect(md).toContain(line);
    expect(md).toContain("| Item | Replies | Limitations |");
    expect(h.out.join("\n")).toContain("summary-groq-2026-10-24.md");
  });

  it("writes the reports into the folder --out names", async () => {
    const h = harness();
    await run(h, "--set", "idea", "--provider", "groq", "--repeats", "1", "--out", join("/somewhere", "else"));
    expect([...h.files.keys()]).toEqual([join("/somewhere", "else", "idea-groq-2026-10-24.md")]);
  });

  it("runs the six sets for --set all, one report each", async () => {
    const h = harness();
    expect(await run(h, "--set", "all", "--provider", "gemini", "--repeats", "1")).toBe(0);
    expect([...h.files.keys()].map((p) => p.split(/[\\/]/).pop())).toEqual(SET_NAMES.map((n) => `${n}-gemini-2026-10-24.md`));
    // idea 5, summary 4, gap 3, litreview 3, ask 3 papers x 2 questions, walk 4.
    expect(SET_NAMES.reduce((n, s) => n + SETS[s].items.length, 0)).toBe(5 + 4 + 3 + 3 + 3 + 4);
    expect(h.calls).toHaveLength(5 + 4 + 3 + 3 + 6 + 4);
  });

  it("sends 3 repeats when --repeats is not given", async () => {
    const h = harness();
    await run(h, "--set", "gap", "--provider", "groq");
    expect(h.calls).toHaveLength(3 * 3);
  });

  describe("the key", () => {
    it("is nowhere in what the CLI prints or writes: not in a reply that repeats it, not in the detail of a provider's error, not in the report", async () => {
      const h = harness({
        reply: (_i, n) => {
          if (n === 0) throw new AiError("model-gone", `HTTP 404: Incorrect API key provided: ${KEY}`);
          if (n === 1) throw new AiError("provider-error", `HTTP 502: upstream said ${KEY}`);
          if (n === 2) throw new Error(`fetch failed for key ${KEY}`);
          return n === 3 ? `My key is ${KEY}.\n${SUMMARY}` : SUMMARY;
        }
      });
      const code = await run(h, "--set", "summary", "--provider", "groq", "--repeats", "2");
      expect(code).toBe(0);
      expect(everything(h)).not.toContain(KEY);
      expect(everything(h)).not.toContain("Incorrect API key");
      expect(everything(h)).not.toContain("upstream said");
      // The failed calls are in the report as their class and status, nothing more.
      const md = [...h.files.values()][0]!;
      expect(md).toContain("No reply (model-gone (HTTP 404)). Nothing to grade.");
      expect(md).toContain("No reply (provider-error (HTTP 502)). Nothing to grade.");
      expect(md).toContain("No reply (unexpected error). Nothing to grade.");
      expect(md).toContain("[key removed]");
    });

    it("stops with a plain sentence naming QUALITY_API_KEY when it is not set, or is only spaces, and calls nothing", async () => {
      for (const env of [{}, { QUALITY_API_KEY: "" }, { QUALITY_API_KEY: "   " }]) {
        const h = harness({ env });
        expect(await run(h, "--set", "summary", "--provider", "groq")).toBe(1);
        expect(h.err.join("\n")).toMatch(/QUALITY_API_KEY is not set/);
        expect(h.calls).toHaveLength(0);
        expect(h.files.size).toBe(0);
      }
    });

    it("stops at once, with no report, when the provider rejects the key", async () => {
      const h = harness({ reply: () => { throw new AiError("key-rejected", `HTTP 401: Incorrect API key provided: ${KEY}`); } });
      expect(await run(h, "--set", "all", "--provider", "groq", "--repeats", "3")).toBe(1);
      expect(h.err.join("\n")).toMatch(/groq rejected the key/);
      expect(h.err.join("\n")).toContain("QUALITY_API_KEY");
      expect(h.calls).toHaveLength(1); // nothing else is sent once the key is known to be bad
      expect(h.files.size).toBe(0);
      expect(everything(h)).not.toContain(KEY);
    });
  });

  describe("the arguments", () => {
    it("turn away a missing or unknown set, a missing or unknown provider and a bad repeats, with the choices in the message and nothing called", async () => {
      const bad: string[][] = [
        [], ["--provider", "groq"], ["--set", "summary"],
        ["--set", "nope", "--provider", "groq"], ["--set", "summary", "--provider", "nope"],
        ["--set", "summary", "--provider", "groq", "--repeats", "0"], ["--set", "summary", "--provider", "groq", "--repeats", "11"],
        ["--set", "summary", "--provider", "groq", "--repeats", "two"], ["--set", "summary", "--provider", "groq", "--repeats", "1.5"],
        ["--set", "summary", "--provider", "groq", "--stub"], ["--set", "summary", "--provider", "groq", "extra"]
      ];
      for (const argv of bad) {
        const h = harness();
        expect(await run(h, ...argv), argv.join(" ")).toBe(2);
        expect(h.err.join("\n"), argv.join(" ")).toContain("Usage:");
        expect(h.calls).toHaveLength(0);
        expect(h.files.size).toBe(0);
      }
      const h = harness();
      await run(h, "--set", "nope", "--provider", "groq");
      expect(h.err.join("\n")).toMatch(/idea, summary, gap, litreview, ask, walk, all/);
      const p = harness();
      await run(p, "--set", "idea", "--provider", "nope");
      expect(p.err.join("\n")).toMatch(/gemini, groq, deepseek, openrouter, openai, claude/);
    });

    it("check the arguments before the key, so a typo costs nothing", async () => {
      const h = harness({ env: {} });
      expect(await run(h, "--set", "nope", "--provider", "groq")).toBe(2);
    });
  });

  describe("a call that fails", () => {
    it("is recorded in the report as its class and status, and the run goes on and says how many failed", async () => {
      const h = harness({ reply: (_i, n) => { if (n === 1) throw new AiError("provider-error", "HTTP 502: <html>bad gateway</html>"); return SUMMARY; } });
      expect(await run(h, "--set", "summary", "--provider", "groq", "--repeats", "1")).toBe(0);
      expect(h.calls).toHaveLength(4);
      const md = [...h.files.values()][0]!;
      expect(md).toContain("No reply (provider-error (HTTP 502)). Nothing to grade.");
      expect(md).not.toContain("bad gateway");
      expect(h.out.join("\n")).toMatch(/summary: 3 replies, 1 failed/);
    });

    it("waits and tries again on a rate limit, up to three times, and records the failure when it lasts", async () => {
      const once = harness({ reply: (_i, n) => { if (n === 0) throw new AiError("rate-limit", "HTTP 429: slow down"); return SUMMARY; } });
      await run(once, "--set", "summary", "--provider", "groq", "--repeats", "1");
      expect(once.sleeps).toEqual([20_000]);
      expect(once.calls).toHaveLength(5); // the first call twice, then the other three
      expect([...once.files.values()][0]).not.toContain("No reply");

      const always = harness({ reply: () => { throw new AiError("rate-limit", "HTTP 429: slow down"); } });
      expect(await run(always, "--set", "idea", "--provider", "groq", "--repeats", "1")).toBe(1); // no reply came back at all
      expect(always.calls).toHaveLength(5 * 4); // each of the five prompts: the call and three tries more
      expect(always.sleeps).toEqual(Array.from({ length: 5 }, () => [20_000, 40_000, 60_000]).flat());
      expect([...always.files.values()][0]).toContain("No reply (rate-limit (HTTP 429)). Nothing to grade.");
      expect(always.err.join("\n")).toMatch(/No reply came back for idea/);
    });
  });

  it("shows where the run is, one line for each call, without the prompt or the key", async () => {
    const h = harness();
    await run(h, "--set", "idea", "--provider", "groq", "--repeats", "2");
    expect(h.out.filter((l) => l.includes("idea-vague-social-media"))).toEqual(["  idea-vague-social-media 1/2", "  idea-vague-social-media 2/2"]);
    expect(everything(h)).not.toContain("You are an experienced research-methods advisor");
  });

  it("goes through the gateway: a Groq call has the bearer key, the builder's prompt and its options", async () => {
    const seen: Array<{ url: string; auth: string; body: { model: string; messages: Array<{ content: string }>; temperature: number; max_tokens: number } }> = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization!, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ choices: [{ message: { content: SUMMARY } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const h = harness();
    h.deps.complete = viaGateway(fetchStub);
    expect(await run(h, "--set", "summary", "--provider", "groq", "--repeats", "1")).toBe(0);
    expect(seen).toHaveLength(4);
    expect(seen[0]).toMatchObject({ url: "https://api.groq.com/openai/v1/chat/completions", auth: "Bearer " + KEY, body: { model: "openai/gpt-oss-120b", temperature: 0.2, max_tokens: 1000 } });
    expect(seen[0]!.body.messages[0]!.content).toContain("PAPER TEXT");
    expect([...h.files.values()][0]).toContain("- Model: openai/gpt-oss-120b");
    expect(everything(h)).not.toContain(KEY);
  });

  it("withTimeout gives a provider call a time limit, so a stalled one ends instead of hanging the run", async () => {
    const stalls = ((_url: string, init: RequestInit) => new Promise((_done, reject) => { init.signal!.addEventListener("abort", () => reject(new Error("aborted"))); })) as unknown as typeof fetch;
    await expect(withTimeout(stalls, 20)("https://example.test/")).rejects.toThrow("aborted");
    const quick = (async () => new Response("ok")) as unknown as typeof fetch;
    expect(await (await withTimeout(quick, 20)("https://example.test/")).text()).toBe("ok");
  });

  it("writeReportFile makes the folder and writes the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quality-cli-"));
    try {
      const path = join(dir, "a", "b", "summary-groq-2026-10-24.md");
      await writeReportFile(path, "# report\n");
      expect(await readFile(path, "utf8")).toBe("# report\n");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
