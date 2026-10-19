// Usage: node scripts/capture-doctext-chrome.mjs [--check]   (pnpm --filter @appuscholar/web doctext:capture [--check])
// The browser truths of the document-text contract (packages/core/src/doctext.ts), read from headless Chromium: innerText of every case of
// packages/core/test/golden/doctext/corpus.json under the default UA white-space and under white-space:pre-wrap (v2's editor: ProseMirror sets
// it on its root), written to innertext-chrome.json, and toLocaleString("en-IN") of a fixed list of numbers (audit F28: v1's styleMeasured
// 6454 prints word totals with it, and the output depends on the runtime's ICU data), written to en-in-numbers.json.
// --check never writes: it captures again, prints `same` or the first differing field or case id, and exits 1 on any difference.
// The capture date on disk is kept while nothing else changes, so a re-capture on a later day is still `same`. The header names the Node version that ran the capture
// (`node`, as every golden fixture's header does: register row D-W1-16) beside the Chromium and Playwright versions.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = new URL("../../../", import.meta.url);
const DIR = new URL("packages/core/test/golden/doctext/", ROOT);
const check = process.argv.slice(2).includes("--check");
const playwright = createRequire(import.meta.url)("@playwright/test/package.json").version;
const corpus = JSON.parse(readFileSync(new URL("corpus.json", DIR), "utf8"));
const NUMBERS = [0, 1, 12, 123, 1234, 12345, 123456, 1234567, 12345678, 1234567.5, 0.5, -1234567];
const CSS = { normal: "default UA", preWrap: "white-space:pre-wrap" };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function capturedOn(text) {
  if (text === null) return undefined;
  try {
    const c = JSON.parse(text).captured;
    return typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : undefined;
  } catch {
    return undefined;
  }
}

const show = (v) => (v === undefined ? "(absent)" : JSON.stringify(v).slice(0, 160));
const caseKey = (c) => (Array.isArray(c) ? String(c[0]) : String(c?.id));

/** Names the first difference: a header field, the list of case ids, or one case's id and field. */
function describe(onDisk, text) {
  if (onDisk === null) return "(no file on disk)";
  let was;
  try {
    was = JSON.parse(onDisk);
  } catch {
    return "(the file on disk is not valid JSON)";
  }
  const now = JSON.parse(text);
  for (const k of new Set([...Object.keys(now), ...Object.keys(was)]))
    if (k !== "cases" && JSON.stringify(was[k]) !== JSON.stringify(now[k])) return `field ${k}: committed ${show(was[k])}, Chromium now ${show(now[k])}`;
  const a = Array.isArray(was.cases) ? was.cases : [], b = now.cases;
  const ka = a.map(caseKey), kb = b.map(caseKey);
  const added = kb.filter((k) => !ka.includes(k)), removed = ka.filter((k) => !kb.includes(k));
  if (added.length || removed.length) return `case ids: ${[added.length ? `new ${added.join(", ")}` : "", removed.length ? `gone ${removed.join(", ")}` : ""].filter(Boolean).join("; ")}`;
  const moved = kb.findIndex((k, i) => k !== ka[i]);
  if (moved >= 0) return `case order: at position ${moved} committed ${ka[moved]}, now ${kb[moved]}`;
  for (const [i, y] of b.entries()) {
    const x = a[i];
    if (Array.isArray(y)) {
      if (JSON.stringify(x) !== JSON.stringify(y)) return `case ${caseKey(y)}: committed ${show(x)}, Chromium now ${show(y)}`;
      continue;
    }
    for (const f of new Set([...Object.keys(y), ...Object.keys(x ?? {})]))
      if (JSON.stringify(x?.[f]) !== JSON.stringify(y[f])) return `case ${caseKey(y)} field ${f}: committed ${show(x?.[f])}, Chromium now ${show(y[f])}`;
  }
  return "(same values, different text)";
}

/** Writes `<file>.json` beside the corpus when its content changed; under --check it only compares. */
function save(file, fields, body) {
  const path = fileURLToPath(new URL(`${file}.json`, DIR));
  const shown = path.slice(fileURLToPath(ROOT).length);
  const onDisk = existsSync(path) ? readFileSync(path, "utf8") : null;
  const text = (captured) => JSON.stringify({ engine: "doctext", captured, ...fields, ...body }, null, 1) + "\n";
  const kept = text(capturedOn(onDisk) ?? today());
  if (kept === onDisk) {
    console.log(`${shown} same`);
    return "same";
  }
  if (check) {
    console.log(`${shown} differs ${describe(onDisk, kept)}`);
    return "differs";
  }
  writeFileSync(path, text(today()));
  console.log(`${shown} written`);
  return "written";
}

const browser = await chromium.launch();
let differs = false;
try {
  const page = await browser.newPage();
  // The corpus's <img> URLs are never fetched, so the capture needs no network and reads the same page every run.
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="normal"></div><div id="prewrap" style="white-space:pre-wrap"></div>');
  const cases = await page.evaluate((list) => {
    const normal = document.getElementById("normal"), prewrap = document.getElementById("prewrap");
    return list.map(({ id, html }) => {
      normal.innerHTML = html;
      prewrap.innerHTML = html;
      return { id, normal: normal.innerText, preWrap: prewrap.innerText };
    });
  }, corpus);
  const numbers = await page.evaluate((list) => list.map((n) => [n, n.toLocaleString("en-IN")]), NUMBERS);
  const fields = { node: process.version, chromium: browser.version(), playwright, css: CSS };
  const statuses = [save("innertext-chrome", fields, { cases }), save("en-in-numbers", fields, { cases: numbers })];
  differs = statuses.includes("differs");
} finally {
  await browser.close();
}
process.exitCode = differs ? 1 : 0;
