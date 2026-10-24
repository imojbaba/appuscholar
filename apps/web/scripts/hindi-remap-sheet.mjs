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
//   - scripts/fixtures/v1-hindi-remap.json: the Hindi that Dr. Sharma's newest v1 gave to English copies (made by v1-hindi-remap.mjs). It adds the counts
//     of the remap and two sections: the keys remapped, and the keys whose Hindi is still English with the reason.
// To refresh after the dictionaries change: run `pnpm --filter @appuscholar/web i18n:remap` (it rewrites the head snapshot and then the sheet),
// and commit wave-b-head.json and docs/i18n/wave-b-hindi-remap.md together. The sheet is built only from this repo's own dictionaries.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KIND, REMAP_URL, SOURCES, sourceOf, stripEmoji } from "./v1-hindi-remap.mjs";

export { stripEmoji };

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

/** How a remapped key was matched, in words. */
export const KIND_LABEL = {
  [KIND.EXACT]: "exact English",
  [KIND.NORMALISED]: "same words (emoji, spacing or spelling differ)",
  [KIND.PLACEHOLDERS]: "placeholders renamed",
};

/** Where in v1 the Hindi of a remapped key was found, in words (v1 keeps Hindi in its dictionary and in three tables beside it). */
export const SOURCE_LABEL = {
  I18N: "I18N dictionary",
  AP_STAGES_HI: "stage table AP_STAGES_HI",
  TOAST_HI: "toast table TOAST_HI",
  STATIC_HI: "dialog table STATIC_HI",
};

/** Why a main-dictionary Hindi is still English after the remap. The text before the first comma is the short name used in the counts. */
export const REASON = {
  NONE: "no Hindi in v1",
  AMBIGUOUS: "ambiguous in v1",
  REJECTED: "v1 Hindi not used",
  KEEP: "a name or format, stays English",
  LATE: "added after the remap, not checked against v1",
};

const readJson = url => JSON.parse(readFileSync(url, "utf8"));
const sortedKeys = o => Object.keys(o).sort();

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

/** Plain table-cell text: pipes escaped, line breaks as <br>. */
const plain = s => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " <br> ");

/** What the remap file says about the head dictionaries: the rows of its two sections and the counts of the header. */
function remapView(remap, en, hi) {
  const remapped = sortedKeys(remap.keys).map(k => [k, remap.keys[k].en, remap.keys[k].hi, remap.keys[k].v1Key, remap.keys[k].kind]);
  const reasonOf = k => {
    if (k in remap.ambiguous) return [REASON.AMBIGUOUS, `${REASON.AMBIGUOUS}: ${remap.ambiguous[k].v1.map(([v, h]) => `\`${v}\` says ${h}`).join(", ")}`];
    if (k in remap.rejected) return [REASON.REJECTED, `${REASON.REJECTED}: ${remap.rejected[k].reason} (v1 key \`${remap.rejected[k].v1Key}\`)`];
    if (remap.keepEnglish.includes(k)) return [REASON.KEEP, REASON.KEEP];
    if (remap.noV1Hindi.includes(k)) return [REASON.NONE, REASON.NONE];
    return [REASON.LATE, REASON.LATE];
  };
  const still = sortedKeys(en).filter(k => hi[k] === en[k]).map(k => [k, en[k], ...reasonOf(k)]);
  const before = remapped.length + Object.keys(remap.ambiguous).length + Object.keys(remap.rejected).length + remap.keepEnglish.length + remap.noV1Hindi.length;
  const kinds = Object.values(KIND).map(kd => [kd, remapped.filter(r => r[4] === kd).length]);
  const sources = SOURCES.map(src => [src, remapped.filter(r => sourceOf(r[3]) === src).length]);
  const reasons = Object.values(REASON).map(r => [r, still.filter(x => x[2] === r).length]);
  return { remapped, still, before, kinds, sources, reasons };
}

/**
 * The sheet as a string. All inputs are passed in, so the function is pure. `remap` (the v1 Hindi remap file) is optional: without it the sheet has no remap counts or sections.
 * @param {{ base: string, head: string, baseKeys: any, en: any, hi: any, tools: any, remap?: any }} a
 */
export function renderSheet({ base, head, baseKeys, en, hi, tools, remap }) {
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
  const view = remap ? remapView(remap, en, hi) : null;
  const out = [];
  out.push("# Wave B Hindi re-map sheet", "");
  out.push(`Generated by \`apps/web/scripts/hindi-remap-sheet.mjs\` from two pinned snapshots: the dictionaries at the base commit \`${base}\` (apps/web/scripts/fixtures/wave-b-base.json) and the dictionaries \`apps/web/messages/en.json\`, \`hi.json\` and \`tools/*.json\` as they stood at commit \`${head}\` (apps/web/scripts/fixtures/wave-b-head.json).` + (view ? " The counts and the last two sections come from a third pinned file, apps/web/scripts/fixtures/v1-hindi-remap.json, made by `apps/web/scripts/v1-hindi-remap.mjs` from Dr. Sharma's newest v1." : ""), "");
  out.push("This sheet is a snapshot at that commit, not a live view: the dictionaries keep changing after it was generated. To refresh it, run \`pnpm --filter @appuscholar/web i18n:remap\` (it rewrites the head snapshot and then this sheet) and commit both files together. Do not edit by hand.", "");
  out.push("All Hindi in this sheet is DRAFT, for Dr. Sharma's review. Quoted English and Hindi are verbatim, including any emoji in the old strings." + (view ? " The one exception is the section \"Hindi remapped from v1\", which is her own Hindi." : ""), "");
  out.push("## Counts", "");
  out.push(`- Keys at the base: ${fmt(Object.keys(baseKeys).length)}`);
  out.push(`- Hindi values that were English copies at the base: ${fmt(baseCopies)}`);
  out.push(`- Keys now: ${fmt(Object.keys(en).length)}`);
  out.push(`- Keys changed since the base (English text differs): ${fmt(changed)}`);
  out.push(`- Keys added since the base: ${fmt(added)}`);
  out.push(`- Keys removed since the base (not listed as rows): ${fmt(removed)}`);
  out.push(`- Keys whose only change is the emoji: ${fmt(emojiOnly)}`);
  if (view) {
    const [exact, same, shaped] = view.kinds.map(([, n]) => n);
    const short = r => r.split(",")[0];
    out.push(`- English copies before the v1 remap, main dictionary: ${fmt(view.before)}`);
    out.push(`- Remapped from v1 build ${remap.v1.build} (commit \`${remap.v1.commit}\`): ${fmt(view.remapped.length)} (exact English ${fmt(exact)}, same words ${fmt(same)}, placeholders renamed ${fmt(shaped)})`);
    out.push(`- Remapped, by where v1 keeps the Hindi: ${view.sources.map(([src, n]) => `${SOURCE_LABEL[src]} ${fmt(n)}`).join(", ")}`);
    out.push(`- Still English after the remap, main dictionary: ${fmt(view.still.length)} (${view.reasons.map(([r, n]) => `${short(r)} ${fmt(n)}`).join(", ")})`);
  }
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
  if (view) {
    out.push(`## Hindi remapped from v1: ${fmt(view.remapped.length)} keys`, "");
    out.push(`Until now Hindi mode showed the English text for these keys. They now show the Hindi in Dr. Sharma's own v1 (build ${remap.v1.build}, commit \`${remap.v1.commit}\`), found by the English text; v1's key is in the table (a key such as \`TOAST_HI["..."]\` or \`AP_STAGES_HI.gap.name\` names one of the tables beside v1's dictionary: toasts, dialog text, the stage names and questions of Analyse a paper). The Hindi is hers, not a draft, but it was written for v1's screens, so please check it in place. Three things were adjusted to keep the two languages alike: "Appuscholer" is spelt "Appuscholar", the Hindi has the same edge spaces as the English, and the Hindi starts with the same emoji as the English (or none).`, "");
    out.push("| Key | English | Hindi from v1 | v1 key | Match |", "|---|---|---|---|---|");
    for (const [k, e, h, v, kd] of view.remapped) out.push(`| ${cell(k)} | ${cell(e)} | ${cell(h)} | ${cell(v)} | ${KIND_LABEL[kd]} |`);
    out.push("");
    out.push(`## Hindi still English after the remap: ${fmt(view.still.length)} keys`, "");
    out.push("Hindi mode shows the English text for these keys. Reasons: \"no Hindi in v1\" (v1 has no Hindi for that English, in its dictionary or in its toast, dialog and stage tables, often because v1 itself still shows it in English; Dr. Sharma to provide); \"ambiguous in v1\" (v1 has two different Hindi values for it; she is asked to choose); \"v1 Hindi not used\" (v1's Hindi has other tags, placeholders or emoji than the English); \"a name or format\" (a product name, a file format or a typed word, which stays as it is in both languages).", "");
    out.push("| Key | English | Reason |", "|---|---|---|");
    for (const [k, e, , text] of view.still) out.push(`| ${cell(k)} | ${cell(e)} | ${plain(text)} |`);
    out.push("");
  }
  return out.join("\n");
}

/** The sheet from the two pinned snapshots (deterministic: it does not read messages/). */
export function buildSheet(headSnap = readJson(HEAD_URL)) {
  const snap = readJson(SNAPSHOT_URL);
  return renderSheet({ base: snap.base, baseKeys: snap.keys, ...headInputs(headSnap), remap: readJson(REMAP_URL) });
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
