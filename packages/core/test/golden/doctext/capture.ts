import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * DOM `textContent` of every case of the hand-written corpus, read in the v1 jsdom window (a detached div, as v1's clHtmlToText 6852 reads).
 * textContent is defined by the DOM standard, so jsdom and Chromium agree; it is captured rather than reasoned about all the same.
 * innerText has no jsdom value: apps/web/scripts/capture-doctext-chrome.mjs records it from Chromium.
 */
export const doctext: Engine = {
  name: "doctext",
  async capture(v1, { check }) {
    const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8")) as Array<{ id: string; html: string }>;
    const div = v1.document.createElement("div");
    const cases = corpus.map(({ id, html }) => {
      div.innerHTML = html;
      return { id, text: div.textContent ?? "" };
    });
    return [writeFixture("doctext", "textcontent", { cases }, v1, check)];
  },
};
