/* The AI-quality CLI (wave B, Task Q2): runs the test sets of packages/quality against a real provider, with a test key, and writes one markdown report for each set.
     pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set summary --provider groq --repeats 3
   It costs money and needs a key, so CI never runs it. The key comes from the environment variable QUALITY_API_KEY and is used for the provider's calls only: it is not printed, logged, written to a
   report or put in an error message. A failed call is recorded in the report as its class and HTTP status (never the provider's answer, which may quote the key). The logic is in `qualityCli`, which takes
   its dependencies, so a test can run it with a stub provider and a temp folder; `main` (at the foot) wires the real ones. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PROV_ORDER } from "@appuscholar/core";
import type { ProviderId } from "@appuscholar/core";
import { runSet, type CompleteFn } from "@appuscholar/quality/run";
import { SETS, SET_NAMES, type SetName } from "@appuscholar/quality/sets";
import { complete as gatewayComplete } from "../src/ai/gateway";
import { AiError, type CompleteInput, type CompleteOutput } from "../src/ai/types";

export interface QualityCliDeps {
  env: Record<string, string | undefined>;
  /** The gateway's `complete`, with its fetch. */
  complete(input: CompleteInput): Promise<CompleteOutput>;
  writeFile(path: string, text: string): Promise<void>;
  now(): Date;
  sleep(ms: number): Promise<void>;
  /** A line for the person running it (stdout) and a line that says why it stopped (stderr). */
  out(line: string): void;
  err(line: string): void;
  /** Where the reports go when --out is not given. */
  reportsDir: string;
}

/** The environment variable that holds the key. */
export const KEY_VARIABLE = "QUALITY_API_KEY";
const DEFAULT_REPEATS = 3;
const MAX_REPEATS = 10;
/** How long a rate-limited call waits before it is tried again, one wait for each new try (a provider's limit is for a minute). After the last it is recorded as failed. */
const RATE_LIMIT_WAITS_MS: readonly number[] = [20_000, 40_000, 60_000];

const USAGE = [
  "Usage: pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set <set> --provider <provider> [--repeats <n>] [--out <folder>]",
  `  --set       ${[...SET_NAMES, "all"].join(", ")}`,
  `  --provider  ${PROV_ORDER.join(", ")}`,
  `  --repeats   how many times each prompt is sent, 1 to ${MAX_REPEATS} (default ${DEFAULT_REPEATS})`,
  "  --out       the folder for the reports (default packages/quality/reports; a relative folder is relative to the current one)",
  `The key is read from the environment variable ${KEY_VARIABLE}. Use a capped test key: every prompt is sent once for each repeat, and it costs.`
];

/** The local calendar day, YYYY-MM-DD (the day the person running it is in). */
const dayOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** What may be said about a failed call: the gateway's error class and the HTTP status at the start of its detail. The rest of the detail is a provider's answer, which can quote the key. */
function safeError(e: unknown): string {
  if (!(e instanceof AiError)) return "unexpected error";
  const status = /^HTTP (\d{3})\b/.exec(e.detail)?.[1];
  return status ? `${e.code} (HTTP ${status})` : e.code;
}

/** Gives the sets runner a `complete`: the gateway with this provider and key, a wait and another try on a rate limit, and only safe text in the errors it throws.
 *  `state.rejected` is set when the provider turns the key away; the calls after that are refused here, so the run ends quickly. */
function wire(deps: QualityCliDeps, provider: ProviderId, key: string, state: { models: Set<string>; rejected: boolean }): CompleteFn {
  return async (prompt, o) => {
    if (state.rejected) throw new Error("key-rejected");
    for (let tries = 0; ; tries++) {
      try {
        const r = await deps.complete({ provider, apiKey: key, prompt, temperature: o.temperature, maxTokens: o.maxTokens });
        state.models.add(r.model);
        return r.text;
      } catch (e) {
        if (e instanceof AiError && e.code === "rate-limit" && tries < RATE_LIMIT_WAITS_MS.length) {
          const wait = RATE_LIMIT_WAITS_MS[tries]!;
          deps.out(`  rate limit: waiting ${wait / 1000} seconds`);
          await deps.sleep(wait);
          continue;
        }
        if (e instanceof AiError && e.code === "key-rejected") state.rejected = true;
        throw new Error(safeError(e));
      }
    }
  };
}

/** Runs the CLI. Returns the exit code: 0 when the reports were written, 1 when it could not run (no key, the key rejected) or no reply came back, 2 for arguments it does not accept. */
export async function qualityCli(argv: string[], deps: QualityCliDeps): Promise<number> {
  const usage = (why: string): number => { deps.err(why); USAGE.forEach((l) => deps.err(l)); return 2; };
  let values: { set?: string; provider?: string; repeats?: string; out?: string };
  try {
    values = parseArgs({ args: argv, options: { set: { type: "string" }, provider: { type: "string" }, repeats: { type: "string" }, out: { type: "string" } }, allowPositionals: false, strict: true }).values;
  } catch (e) {
    return usage((e instanceof Error ? e.message : "The arguments are not right.").replace(/\s*To specify.*$/s, ""));
  }
  if (!values.set || ![...SET_NAMES, "all"].includes(values.set)) return usage(`--set must be one of: ${[...SET_NAMES, "all"].join(", ")}.`);
  if (!values.provider || !(PROV_ORDER as readonly string[]).includes(values.provider)) return usage(`--provider must be one of: ${PROV_ORDER.join(", ")}.`);
  if (values.repeats !== undefined && !(/^\d+$/.test(values.repeats) && +values.repeats >= 1 && +values.repeats <= MAX_REPEATS)) return usage(`--repeats must be a whole number from 1 to ${MAX_REPEATS}.`);
  const sets: SetName[] = values.set === "all" ? [...SET_NAMES] : [values.set as SetName];
  const provider = values.provider as ProviderId;
  const repeats = values.repeats === undefined ? DEFAULT_REPEATS : +values.repeats;

  const key = (deps.env[KEY_VARIABLE] ?? "").trim();
  if (!key) { deps.err(`${KEY_VARIABLE} is not set. Put a capped test key for ${provider} in that environment variable and run again.`); return 1; }
  /** Nothing the report says needs the key; if a reply repeated it, it is taken out before the report is written. */
  const redact = (text: string): string => text.split(key).join("[key removed]");

  const date = dayOf(deps.now());
  const outDir = values.out ? resolve(values.out) : deps.reportsDir;
  for (const name of sets) {
    const state = { models: new Set<string>(), rejected: false };
    const total = SETS[name].items.length;
    deps.out(`${name}: ${total} item${total === 1 ? "" : "s"}, ${repeats} repeat${repeats === 1 ? "" : "s"} each, on ${provider}`);
    const report = await runSet(SETS[name], wire(deps, provider, key, state), {
      repeats, provider, date,
      model: () => (state.models.size ? [...state.models].join(", ") : undefined),
      onCall: (c) => deps.out(`  ${c.id}${c.part ? ` question ${c.part}` : ""} ${c.repeat}/${c.of}${c.ok ? "" : " (no reply)"}`)
    });
    if (state.rejected) {
      deps.err(`${provider} rejected the key. Check that ${KEY_VARIABLE} holds a key for ${provider} that has not been revoked. No report was written for ${name}.`);
      return 1;
    }
    const path = join(outDir, `${name}-${provider}-${date}.md`);
    await deps.writeFile(path, redact(report.markdown));
    const replies = report.items.flatMap((i) => i.replies);
    const got = replies.filter((r) => r.text !== undefined).length;
    deps.out(`${name}: ${got} ${got === 1 ? "reply" : "replies"}, ${replies.length - got} failed. Wrote ${path}`);
    if (replies.length > 0 && got === 0) { deps.err(`No reply came back for ${name}. The report says why each call failed.`); return 1; }
  }
  return 0;
}

/** The gateway's `complete` with the given fetch. */
export const viaGateway = (fetchImpl: typeof fetch): QualityCliDeps["complete"] => (input) => gatewayComplete(input, { fetch: fetchImpl });

/** A fetch that gives up on a call after `ms`, so a provider that stalls does not hang the run (the gateway reads a failed fetch as a network error). */
export const withTimeout = (fetchImpl: typeof fetch, ms: number): typeof fetch => (input, init) => fetchImpl(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(ms) });

/** A call that has had this long without an answer is given up (a summary prompt of 19,000 characters can take a while on a busy provider). */
const CALL_TIMEOUT_MS = 180_000;

/** Writes a report, making its folder first. */
export async function writeReportFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

/** The real dependencies: the process's environment, real fetch, the real file system and clock; the reports go to packages/quality/reports. */
export function realDeps(): QualityCliDeps {
  return {
    env: process.env,
    complete: viaGateway(withTimeout(fetch, CALL_TIMEOUT_MS)),
    writeFile: writeReportFile,
    now: () => new Date(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    out: (l) => console.log(l),
    err: (l) => console.error(l),
    reportsDir: fileURLToPath(new URL("../../../packages/quality/reports/", import.meta.url))
  };
}

// Run only when started as a script, not when a test imports this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  qualityCli(process.argv.slice(2), realDeps()).then((code) => { process.exitCode = code; }, (e) => {
    console.error("The run stopped: " + (e instanceof Error ? e.name : "unknown error"));
    process.exitCode = 1;
  });
}
