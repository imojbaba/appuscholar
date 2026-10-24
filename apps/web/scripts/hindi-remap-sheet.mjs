// The Hindi re-map sheet for wave B (Task 39): what Dr. Sharma has to translate or re-check, with the counts her work is costed from.
//
// Usage (from apps/web):
//   pnpm --filter @appuscholar/web i18n:remap     refreshes the head snapshot from the live dictionaries, then rewrites the sheet (docs/i18n/wave-b-hindi-remap.md)
//   node scripts/hindi-remap-sheet.mjs --head-snapshot   only rewrites scripts/fixtures/wave-b-head.json from the live messages/ files
//   node scripts/hindi-remap-sheet.mjs --snapshot        rewrites scripts/fixtures/wave-b-base.json from `git show <base>:...` (needs the base commit in the history)
//   node scripts/hindi-remap-sheet.mjs --check           for CI: exits 1 if the live dictionaries differ from the head snapshot or the sheet is not what the snapshots produce
//
// The comparison is between the dictionaries at the wave B base commit (messages/en.json and hi.json) and the head ones, plus a second
// section for the tool message files (messages/tools/*.en.json and *.hi.json), which are all new since the base.
// The sheet is a snapshot: it is built from two PINNED files, not from the live dictionaries, so other sessions can keep editing
// messages/ without turning the byte-for-byte test red.
//   - scripts/fixtures/wave-b-base.json: the base (key -> [English, Hindi]). A shallow clone cannot run `git show <base>:`, hence the file;
//     test/hindiRemap.test.ts compares it with git whenever the base commit is reachable.
//   - scripts/fixtures/wave-b-head.json: the dictionaries the sheet was generated from (same shape, plus the tool files and the commit they were taken at).
// To refresh after the dictionaries change: run `pnpm --filter @appuscholar/web i18n:remap` (it rewrites the head snapshot and then the sheet),
// and commit wave-b-head.json and docs/i18n/wave-b-hindi-remap.md together. The sheet is built only from this repo's own dictionaries.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The wave B base: the last commit before wave B (2026-10-20). */
export const BASE_COMMIT = "af11810";

const SNAPSHOT_URL = new URL("./fixtures/wave-b-base.json", import.meta.url);
const HEAD_URL = new URL("./fixtures/wave-b-head.json", import.meta.url);
const SHEET_URL = new URL("../../../docs/i18n/wave-b-hindi-remap.md", import.meta.url);
const MESSAGES_URL = new URL("../messages/", import.meta.url);

export const STATUS = {
  COPY: "Hindi was an English copy",
  REDRAFTED: "Hindi re-drafted",
  STALE: "English changed, Hindi not updated",
  EMOJI: "emoji only",
  NEW: "new key",
  NEW_ENGLISH: "new key, Hindi is still English",
  NEW_MISSING: "new key, no Hindi yet",
};

const readJson = url => JSON.parse(readFileSync(url, "utf8"));
const sortedKeys = o => Object.keys(o).sort();

/** The text without emoji and pictographs (and the joiners and variation selectors that go with them), spaces tidied. */
export function stripEmoji(s) {
  return s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{FE0F}\u{200D}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/gu, "").replace(/\s+/g, " ").trim();
}

/** The base dictionaries, read with `git show <base>:apps/web/messages/{en,hi}.json`, as { base, keys: { key: [en, hi] } } sorted by key. */
export function readBaseFromGit(base = BASE_COMMIT) {
  const show = f => JSON.parse(execFileSync("git", ["show", `${base}:apps/web/messages/${f}`], { maxBuffer: 1 << 28, encoding: "utf8", cwd: fileURLToPath(new URL("./", import.meta.url)) }));
  const [en, hi] = [show("en.json"), show("hi.json")];
  const keys = {};
  for (const k of sortedKeys(en)) keys[k] = [en[k], hi[k] ?? ""];
  return { base, keys };
}

/** One key per line, so a change to the snapshot is readable in a diff. */
export function serializeSnapshot(snap) {
  const lines = Object.keys(snap.keys).map(k => `${JSON.stringify(k)}: ${JSON.stringify(snap.keys[k])}`);
  return `{\n"base": ${JSON.stringify(snap.base)},\n"keys": {\n${lines.join(",\n")}\n}\n}\n`;
}

/** The tool message files: { file: { en: {key: text}, hi: {key: text} } }, `$`-prefixed keys (the DRAFT marker) left out. */
export function readToolFiles() {
  const dir = new URL("tools/", MESSAGES_URL);
  const names = readdirSync(dir).filter(f => f.endsWith(".en.json")).map(f => f.slice(0, -".en.json".length)).sort();
  const strip = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("$")));
  return Object.fromEntries(names.map(n => [n, { en: strip(readJson(new URL(`${n}.en.json`, dir))), hi: strip(readJson(new URL(`${n}.hi.json`, dir))) }]));
}

/** The live dictionaries as a head snapshot: { head, keys: { key: [en, hi|null] }, tools: { file: { key: [en, hi|null] } } }. `head` is the commit they were taken at. */
export function readHeadFromRepo(head) {
  const en = readJson(new URL("en.json", MESSAGES_URL)), hi = readJson(new URL("hi.json", MESSAGES_URL));
  const keys = {};
  for (const k of sortedKeys(en)) keys[k] = [en[k], hi[k] ?? null];
  const tools = {};
  for (const [file, { en: te, hi: th }] of Object.entries(readToolFiles())) {
    tools[file] = {};
    for (const k of sortedKeys(te)) tools[file][k] = [te[k], th[k] ?? null];
  }
  return { head: head ?? gitHeadShort(), keys, tools };
}

function gitHeadShort() {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: fileURLToPath(new URL("./", import.meta.url)) }).trim();
}

/** One key per line, so a change to the snapshot is readable in a diff. */
export function serializeHead(snap) {
  const line = (k, v) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  const files = Object.keys(snap.tools).map(f => `${JSON.stringify(f)}: {\n${Object.keys(snap.tools[f]).map(k => line(k, snap.tools[f][k])).join(",\n")}\n}`);
  return `{\n"head": ${JSON.stringify(snap.head)},\n"keys": {\n${Object.keys(snap.keys).map(k => line(k, snap.keys[k])).join(",\n")}\n},\n"tools": {\n${files.join(",\n")}\n}\n}\n`;
}

/** A head snapshot as the inputs of renderSheet (a null Hindi means the Hindi file has no such key). */
function headInputs(snap) {
  const en = {}, hi = {};
  for (const [k, [e, h]] of Object.entries(snap.keys)) { en[k] = e; if (h !== null) hi[k] = h; }
  const tools = {};
  for (const [f, entries] of Object.entries(snap.tools)) {
    tools[f] = { en: {}, hi: {} };
    for (const [k, [e, h]] of Object.entries(entries)) { tools[f].en[k] = e; if (h !== null) tools[f].hi[k] = h; }
  }
  return { head: snap.head, en, hi, tools };
}

function fmt(n) { return n.toLocaleString("en-US"); }

/** A markdown inline-code cell: verbatim text, pipes escaped, line breaks as <br>. */
function cell(s) {
  if (s === undefined || s === null) return "none";   // absent: plain word, so it is not mistaken for a string
  if (s === "") return "empty";
  const text = String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " <br> ");
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(r => r.length));
  const fence = "`".repeat(longest + 1);
  return text.startsWith("`") || text.endsWith("`") ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** The sheet as a string. All inputs are passed in, so the function is pure. */
export function renderSheet({ base, head, baseKeys, en, hi, tools }) {
  const rows = [];
  let removed = 0;
  for (const k of Object.keys(baseKeys)) if (!(k in en)) removed++;
  let changed = 0, added = 0, emojiOnly = 0;
  for (const k of sortedKeys(en)) {
    const newEn = en[k], newHi = hi[k];
    if (!(k in baseKeys)) {
      added++;
      const status = newHi === undefined ? STATUS.NEW_MISSING : newHi === newEn ? STATUS.NEW_ENGLISH : STATUS.NEW;
      rows.push([k, null, newEn, null, newHi, status]);
      continue;
    }
    const [oldEn, oldHi] = baseKeys[k];
    if (oldEn === newEn) continue;
    changed++;
    let status;
    if (stripEmoji(oldEn) === stripEmoji(newEn)) { status = STATUS.EMOJI; emojiOnly++; }
    else if (oldHi === oldEn) status = STATUS.COPY;
    else if (newHi !== oldHi) status = STATUS.REDRAFTED;
    else status = STATUS.STALE;
    rows.push([k, oldEn, newEn, oldHi, newHi, status]);
  }
  const baseCopies = Object.values(baseKeys).filter(([e, h]) => e === h).length;
  const nowCopies = Object.keys(en).filter(k => hi[k] === en[k]).length;
  const toolRows = [];
  let toolCopies = 0, toolMissing = 0;
  for (const [file, { en: te, hi: th }] of Object.entries(tools)) {
    for (const k of sortedKeys(te)) {
      const status = !(k in th) ? STATUS.NEW_MISSING : th[k] === te[k] ? STATUS.NEW_ENGLISH : STATUS.NEW;
      if (status === STATUS.NEW_ENGLISH) toolCopies++;
      if (status === STATUS.NEW_MISSING) toolMissing++;
      toolRows.push([file, k, te[k], th[k], status]);
    }
  }
  const out = [];
  out.push("# Wave B Hindi re-map sheet", "");
  out.push(`Generated by \`apps/web/scripts/hindi-remap-sheet.mjs\` from two pinned snapshots: the dictionaries at the base commit \`${base}\` (apps/web/scripts/fixtures/wave-b-base.json) and the dictionaries \`apps/web/messages/en.json\`, \`hi.json\` and \`tools/*.json\` as they stood at commit \`${head}\` (apps/web/scripts/fixtures/wave-b-head.json).`, "");
  out.push("This sheet is a snapshot at that commit, not a live view: the dictionaries keep changing after it was generated. To refresh it, run \`pnpm --filter @appuscholar/web i18n:remap\` (it rewrites the head snapshot and then this sheet) and commit both files together. Do not edit by hand.", "");
  out.push("All Hindi in this sheet is DRAFT, for Dr. Sharma's review. Quoted English and Hindi are verbatim, including any emoji in the old strings.", "");
  out.push("## Counts", "");
  out.push(`- Keys at the base: ${fmt(Object.keys(baseKeys).length)}`);
  out.push(`- Hindi values that were English copies at the base: ${fmt(baseCopies)}`);
  out.push(`- Keys now: ${fmt(Object.keys(en).length)}`);
  out.push(`- Keys changed since the base (English text differs): ${fmt(changed)}`);
  out.push(`- Keys added since the base: ${fmt(added)}`);
  out.push(`- Keys removed since the base (not listed as rows): ${fmt(removed)}`);
  out.push(`- Keys whose only change is the emoji: ${fmt(emojiOnly)}`);
  out.push(`- Hindi values still English now, main dictionary: ${fmt(nowCopies)}`);
  out.push(`- Hindi values still English now, tool files: ${fmt(toolCopies)}`);
  out.push(`- Hindi values still English now, both: ${fmt(nowCopies + toolCopies)}`);
  out.push(`- Tool-file strings (all new since the base): ${fmt(toolRows.length)}`);
  out.push(`- Tool-file strings whose Hindi is an English copy: ${fmt(toolCopies)}`);
  out.push(`- Tool-file strings with no Hindi yet (the app shows the English): ${fmt(toolMissing)}`);
  out.push("");
  out.push("Statuses: \"Hindi was an English copy\" (the Hindi at the base was the English text; it needs translating); \"Hindi re-drafted\" (the English changed and the Hindi changed with it); \"English changed, Hindi not updated\" (the English changed and the Hindi is the old Hindi; it needs a check); \"emoji only\" (the only change is an emoji; no new Hindi needed); \"new key\" (added, with a draft Hindi); \"new key, Hindi is still English\" (added, Hindi not yet translated); \"new key, no Hindi yet\" (added to the English file only).", "");
  out.push(`## Main dictionary: ${fmt(rows.length)} keys changed or added since the base`, "");
  out.push("| Key | Old English | New English | Old Hindi | New Hindi (DRAFT) | Status |", "|---|---|---|---|---|---|");
  for (const [k, oe, ne, oh, nh, st] of rows) out.push(`| ${cell(k)} | ${cell(oe)} | ${cell(ne)} | ${cell(oh)} | ${cell(nh)} | ${st} |`);
  out.push("");
  out.push(`## Tool message files: ${fmt(toolRows.length)} strings, all new since the base`, "");
  out.push("| File | Key | English | Hindi (DRAFT) | Status |", "|---|---|---|---|---|");
  for (const [f, k, e, h, st] of toolRows) out.push(`| ${f} | ${cell(k)} | ${cell(e)} | ${cell(h)} | ${st} |`);
  out.push("");
  return out.join("\n");
}

/** The sheet from the two pinned snapshots (deterministic: it does not read messages/). */
export function buildSheet(headSnap = readJson(HEAD_URL)) {
  const snap = readJson(SNAPSHOT_URL);
  return renderSheet({ base: snap.base, baseKeys: snap.keys, ...headInputs(headSnap) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv[2];
  const writeHead = () => { const h = readHeadFromRepo(); writeFileSync(HEAD_URL, serializeHead(h)); return h; };
  if (flag === "--snapshot") {
    const snap = readBaseFromGit(BASE_COMMIT);
    mkdirSync(new URL("./", SNAPSHOT_URL), { recursive: true });
    writeFileSync(SNAPSHOT_URL, serializeSnapshot(snap));
    console.log(`base snapshot of ${BASE_COMMIT}: ${Object.keys(snap.keys).length} keys`);
  } else if (flag === "--head-snapshot") {
    mkdirSync(new URL("./", HEAD_URL), { recursive: true });
    const h = writeHead();
    console.log(`head snapshot at ${h.head}: ${Object.keys(h.keys).length} keys`);
  } else if (flag === "--check") {
    // The live dictionaries against the pinned head, then the sheet against the snapshots. Same commit id on both sides, so only content is compared.
    const pinned = readJson(HEAD_URL);
    const live = readHeadFromRepo(pinned.head);
    const problems = [];
    if (serializeHead(live) !== serializeHead(pinned)) problems.push("messages/ differ from scripts/fixtures/wave-b-head.json");
    if (readFileSync(SHEET_URL, "utf8") !== buildSheet(pinned)) problems.push("docs/i18n/wave-b-hindi-remap.md is not what the snapshots produce");
    if (problems.length) { console.log(problems.join("\n") + "\nrun: pnpm --filter @appuscholar/web i18n:remap"); process.exit(1); }
    console.log("the sheet and the head snapshot are current");
  } else if (flag === undefined) {
    mkdirSync(new URL("./", SHEET_URL), { recursive: true });
    mkdirSync(new URL("./", HEAD_URL), { recursive: true });
    const h = writeHead();
    writeFileSync(SHEET_URL, buildSheet(h));
    console.log(`wrote scripts/fixtures/wave-b-head.json and docs/i18n/wave-b-hindi-remap.md (head ${h.head})`);
  } else throw new Error(`unknown option ${flag}`);
}
