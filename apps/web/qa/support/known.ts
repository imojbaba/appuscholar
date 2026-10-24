import { readFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./qa";

/**
 * The faults and decisions the QA layer knows about, from `qa/known.json`: the F and O ids of the 2026-10-23 walk (spec section 9) and the Q ids that runs add.
 *
 * - `known`: it fails as recorded, waiting for a fix. The case's mark is KNOWN FAULT and CI stays green.
 * - `awaiting`: the right outcome is OJ's or Dr. Sharma's call; the case records what happens (AWAITING DECISION).
 * - `fixed`: it was fixed. A check that still names it and fails is a regression, so it fails the case; one that passes is a pass.
 *
 * `match` lets a finding be recognised without its case naming the id: the layout rules and the watcher match by `rule` (for example "small-target", "console") and by
 * a substring of `text`. An entry with both needs both; an entry with neither never matches (it is found by its id only). `text` names the fault narrowly: the control's target
 * and, for a rule with many findings on one control (axe), the rule id, never a fragment other controls share. A fault that sits in several controls lists each target in a
 * list of texts; the finding fits when it contains any one of them.
 */
export type KnownEntry = { id: string; title: string; status: "known" | "awaiting" | "fixed"; owner?: "OJ" | "Dr. Sharma"; match?: { rule?: string; text?: string | string[] } };

const STATUSES: ReadonlyArray<KnownEntry["status"]> = ["known", "awaiting", "fixed"];
const OWNERS: ReadonlyArray<NonNullable<KnownEntry["owner"]>> = ["OJ", "Dr. Sharma"];
const KNOWN_FILE = path.resolve(__dirname, "..", "known.json");

/** Checks the shape of known.json's content, and says which entry is wrong. A malformed file must stop the run: a lost entry would turn a recorded fault into a red build, a bad status into a hidden one. */
export function parseKnown(data: unknown): KnownEntry[] {
  const bad = (what: string): never => {
    throw new Error(`QA known.json: ${what}`);
  };
  if (!Array.isArray(data)) return bad("the file must hold a list of entries");
  const seen = new Set<string>();
  return data.map((raw: unknown, i) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad(`entry ${i + 1} is not an object`);
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) return bad(`entry ${i + 1} has no id`);
    const where = `entry ${e.id}`;
    if (seen.has(e.id)) return bad(`${where} appears twice`);
    seen.add(e.id);
    if (typeof e.title !== "string" || !e.title) return bad(`${where} has no title`);
    if (!STATUSES.includes(e.status as KnownEntry["status"])) return bad(`${where} has status ${JSON.stringify(e.status)}; it must be one of ${STATUSES.join(", ")}`);
    if (e.owner !== undefined && !OWNERS.includes(e.owner as NonNullable<KnownEntry["owner"]>)) return bad(`${where} has owner ${JSON.stringify(e.owner)}; it must be one of ${OWNERS.join(", ")}`);
    let match: KnownEntry["match"];
    if (e.match !== undefined) {
      if (typeof e.match !== "object" || e.match === null || Array.isArray(e.match)) return bad(`${where} has a match that is not an object`);
      const m = e.match as Record<string, unknown>;
      if (m.rule !== undefined && (typeof m.rule !== "string" || !m.rule)) return bad(`${where} has a match rule that is not text`);
      const texts = Array.isArray(m.text) ? m.text : [m.text];
      if (m.text !== undefined && (texts.length === 0 || texts.some((t) => typeof t !== "string" || !t))) return bad(`${where} has a match text that is not text, or a list of texts with one that is not`);
      match = { ...(m.rule !== undefined ? { rule: m.rule as string } : {}), ...(m.text !== undefined ? { text: m.text as string | string[] } : {}) };
    }
    return { id: e.id, title: e.title, status: e.status as KnownEntry["status"], ...(e.owner !== undefined ? { owner: e.owner as KnownEntry["owner"] } : {}), ...(match ? { match } : {}) };
  });
}

/** Reads `qa/known.json` (or another file, for a test). */
export function loadKnown(file: string = KNOWN_FILE): KnownEntry[] {
  return parseKnown(JSON.parse(readFileSync(file, "utf8")));
}

export function findKnown(id: string, known: KnownEntry[]): KnownEntry | undefined {
  return known.find((e) => e.id === id);
}

/**
 * The first entry whose `match` the finding fits: its rule equals the entry's, and its text contains the entry's text (as written, not folded to lower case).
 * An entry says what it needs; a finding without it does not fit. The status is not looked at: a finding that fits a fixed entry is a regression, and the caller says so.
 */
export function matchKnown(f: { rule?: string; text?: string }, known: KnownEntry[]): KnownEntry | undefined {
  return known.find((e) => {
    const m = e.match;
    if (!m || (m.rule === undefined && m.text === undefined)) return false;
    if (m.rule !== undefined && m.rule !== f.rule) return false;
    if (m.text !== undefined && !(f.text !== undefined && (Array.isArray(m.text) ? m.text : [m.text]).some((t) => f.text!.includes(t)))) return false;
    return true;
  });
}

/**
 * Whether a check turns the case red: it failed, and it has no known id, or its id is not in known.json (it counts as none), or its entry is `fixed`.
 * A check that passed, or measured nothing (`ok: null`), never does. `known` and `awaiting` entries keep CI green.
 */
export function failsCase(c: CheckResult, known: KnownEntry[]): boolean {
  if (c.ok !== false) return false;
  const e = c.known ? findKnown(c.known, known) : undefined;
  return !e || e.status === "fixed";
}

/** Each id a check names that known.json lacks, once, in the order met. The reporter lists them as warnings: a typo would otherwise turn a recorded fault into a red build with no hint why. */
export function missingKnownIds(checks: CheckResult[], known: KnownEntry[]): string[] {
  const ids: string[] = [];
  for (const c of checks) if (c.known && !findKnown(c.known, known) && !ids.includes(c.known)) ids.push(c.known);
  return ids;
}
