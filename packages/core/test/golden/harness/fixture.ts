import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { V1 } from "./v1";

/**
 * Every fixture opens with this header. `node` is the Node version that ran the capture (process.version): a number computed through Math.exp or Math.log is exact only on the platform that
 * computed it, so the golden tests hold computed numbers within a relative 1e-12 (harness/compare.ts, register row D-W1-16), and the header records which Node computed the fixture's digits.
 */
export type FixtureHeader = { engine: string; captured: string; node: string; v1: { build: string; sha256: string; lines: number } };
export type Fixture<T> = FixtureHeader & T;
export type FixtureStatus = "written" | "same" | "differs";

const PACKAGE_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const GOLDEN_DIR = resolve(PACKAGE_DIR, "test/golden");
const DATA_DIR = resolve(PACKAGE_DIR, "src/data");
const HEADER_KEYS = ["engine", "captured", "node", "v1"];

/**
 * A plain object from either realm: its prototype is null or a realm's Object.prototype
 * (v1's objects come from the jsdom window, so `instanceof Object` or `=== Object.prototype` would be false).
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (Object.prototype.toString.call(v) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === null || Object.getPrototypeOf(proto) === null;
}

function kindOf(v: object): string {
  if (typeof v === "function") return "function";
  const tag = Object.prototype.toString.call(v).slice(8, -1);
  return tag === "Object" ? `instance of ${(Object.getPrototypeOf(v) as { constructor?: { name?: string } }).constructor?.name || "a class"}` : tag;
}

function encodeAt(v: unknown, path: string): unknown {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return { $n: "NaN" };
    if (v === Infinity) return { $n: "Infinity" };
    if (v === -Infinity) return { $n: "-Infinity" };
    if (Object.is(v, -0)) return { $n: "-0" };
    return v;
  }
  if (Array.isArray(v)) return Array.from(v, (x, i) => encodeAt(x, `${path}[${i}]`));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encodeAt(x, `${path}.${k}`);
    return out;
  }
  // JSON.stringify would silently turn these into {} or a string (an un-awaited Promise, a Map, a Date, a DOM node).
  if ((typeof v === "object" && v !== null) || typeof v === "function")
    throw new Error(`encodeSpecial: ${path} is not JSON data (${kindOf(v)}); record a plain value instead (await the Promise, convert the Date or Map)`);
  return v;
}

/**
 * NaN, ±Infinity and −0 become `{"$n": …}`, recursively; `undefined` properties are dropped.
 * Anything that is not null, a primitive, an array or a plain object throws, naming its JSON path.
 */
export function encodeSpecial(v: unknown): unknown {
  return encodeAt(v, "$");
}

function specialNumber(s: unknown): number | undefined {
  switch (s) {
    case "NaN": return NaN;
    case "Infinity": return Infinity;
    case "-Infinity": return -Infinity;
    case "-0": return -0;
    default: return undefined;
  }
}

export function decodeSpecial(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeSpecial);
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "$n") {
      const n = specialNumber(v.$n);
      if (n !== undefined) return n;
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = decodeSpecial(x);
    return out;
  }
  return v;
}

const fixturePath = (engine: string, file: string) => resolve(GOLDEN_DIR, engine, `${file}.json`);
const shown = (path: string) => relative(PACKAGE_DIR, path);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fixtureText(engine: string, captured: string, v1: V1, body: object): string {
  const header: FixtureHeader = { engine, captured, node: process.version, v1: { build: v1.build, sha256: v1.sha256, lines: v1.lines } };
  return JSON.stringify(encodeSpecial({ ...header, ...body }), null, 1) + "\n";
}

/** The capture date on disk, kept while nothing else changes, so a re-capture on a later day is still "same". */
function capturedOn(text: string | null): string | undefined {
  if (text === null) return undefined;
  try {
    const c = (JSON.parse(text) as { captured?: unknown }).captured;
    return typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : undefined;
  } catch {
    return undefined;
  }
}

type Diff = { path: string; was: unknown; now: unknown };

function firstDiff(was: unknown, now: unknown, path: string): Diff | null {
  if (Array.isArray(was) && Array.isArray(now)) {
    for (let i = 0; i < Math.max(was.length, now.length); i++) {
      const d = firstDiff(was[i], now[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (isPlainObject(was) && isPlainObject(now)) {
    for (const k of new Set([...Object.keys(now), ...Object.keys(was)])) {
      const d = firstDiff(was[k], now[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return Object.is(was, now) ? null : { path, was, now };
}

const preview = (v: unknown) => (v === undefined ? "(absent)" : JSON.stringify(v).slice(0, 120));

function describeDiff(onDisk: string | null, text: string): string {
  if (onDisk === null) return "(no fixture on disk)";
  let was: unknown;
  try {
    was = JSON.parse(onDisk);
  } catch {
    return "(the fixture on disk is not valid JSON)";
  }
  const d = firstDiff(was, JSON.parse(text), "$");
  if (d) return `at ${d.path}: fixture ${preview(d.was)}, v1 now ${preview(d.now)}`;
  // Equal values, different text (a digit past double precision, spacing, key order): name the first differing line.
  const a = onDisk.split("\n"), b = text.split("\n");
  let line = 0;
  while (a[line] === b[line]) line++;
  return `at line ${line + 1} (same values, different text): fixture ${JSON.stringify(a[line] ?? "")}, v1 now ${JSON.stringify(b[line] ?? "")}`;
}

/** Writes `test/golden/<engine>/<file>.json` when its content changed. Under `check` it never writes: it compares and prints the first differing JSON path. */
export function writeFixture(engine: string, file: string, body: object, v1: V1, check: boolean): FixtureStatus {
  for (const k of HEADER_KEYS) if (k in body) throw new Error(`${engine}/${file}: the body must not have a "${k}" key, the fixture header owns it`);
  const path = fixturePath(engine, file);
  const onDisk = existsSync(path) ? readFileSync(path, "utf8") : null;
  const keptDate = fixtureText(engine, capturedOn(onDisk) ?? today(), v1, body);
  if (keptDate === onDisk) {
    console.log(`${shown(path)} same`);
    return "same";
  }
  if (check) {
    console.log(`${shown(path)} differs ${describeDiff(onDisk, keptDate)}`);
    return "differs";
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, fixtureText(engine, today(), v1, body));
  console.log(`${shown(path)} written`);
  return "written";
}

export function readFixture<T>(engine: string, file: string): Fixture<T> {
  const path = fixturePath(engine, file);
  if (!existsSync(path)) throw new Error(`No golden fixture ${shown(path)}. Capture it where v1 is checked out: pnpm --filter @appuscholar/core golden:capture ${engine}`);
  return decodeSpecial(JSON.parse(readFileSync(path, "utf8"))) as Fixture<T>;
}

/**
 * Content tables copied from v1, never retyped: `tables.json` always goes through writeFixture (so `--check` covers it);
 * `src/data/<target>.ts` is generated only under `emit`, never under `check`.
 */
export function emitTables(v1: V1, engine: string, target: string, tables: Record<string, unknown>, opts: { check: boolean; emit: boolean }): FixtureStatus {
  const status = writeFixture(engine, "tables", { tables }, v1, opts.check);
  if (opts.emit && !opts.check) {
    const path = resolve(DATA_DIR, `${target}.ts`);
    const source = [
      `// Generated from v1 index.html build ${v1.build} (${v1.sha256.slice(0, 12)}) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture ${engine} --emit`,
      ...Object.entries(tables).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;`),
    ].join("\n") + "\n";
    if (existsSync(path) && readFileSync(path, "utf8") === source) console.log(`${shown(path)} same`);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
      console.log(`${shown(path)} written`);
    }
  }
  return status;
}
