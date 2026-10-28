// Installs the fake AI provider (core.mjs) on globalThis.fetch. The QA config starts the API with it:
//   node --import ./qa/provider-shim/shim.mjs ../api/dist/index.js
// A preload runs before the API's code, and createApp() takes the `fetch` it hands to the AI gateway when it runs (apps/api/src/app.ts), so the API uses this one.
// The recorded replies are qa/fixtures/ai-replies.json. Each request is appended to QA_PROVIDER_LOG as one JSON line (a ShimLogEntry, see core.mjs).
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createShimFetch } from "./core.mjs";

if (process.env.QA_LIVE_AI === "1") {
  throw new Error("QA provider shim: QA_LIVE_AI=1 means the api talks to the real AI providers. Do not load the fake one (start the api without --import).");
}
const logFile = process.env.QA_PROVIDER_LOG;
if (!logFile) {
  throw new Error("QA provider shim: QA_PROVIDER_LOG is not set. The QA config sets it; when you start the api by hand, point it at a file (the cases read the calls back from there).");
}
const repliesFile = fileURLToPath(new URL("../fixtures/ai-replies.json", import.meta.url));
const replies = JSON.parse(readFileSync(repliesFile, "utf8"));

/**
 * The file is opened for each write, and its folder made if it is not there: Playwright empties `qa-results/` when a run starts, which can happen after the
 * api has started. A write that fails is not swallowed: a case that expects "the provider was not called" would otherwise pass because nothing could be written.
 */
function log(entry) {
  try {
    mkdirSync(path.dirname(logFile), { recursive: true });
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("QA provider shim: could not write " + logFile + ":", e);
    throw e;
  }
}

globalThis.fetch = createShimFetch(globalThis.fetch, { replies, log });
console.log(`QA provider shim: answering the AI providers from ${replies.length} recorded replies (${path.basename(repliesFile)}); calls go to ${logFile}`);
