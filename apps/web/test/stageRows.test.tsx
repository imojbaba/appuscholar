// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StageRows } from "../components/frame/StageRows";
import type { HomeFacts } from "../lib/frame/homeFacts";
import type { StageState } from "../lib/frame/stages";
import { STAGE_ORDER, type StageKey } from "../lib/tools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FACTS: HomeFacts = { question: "Q", people: "", time: "", limits: "", field: "", verdict: null, checked: false, readText: "", kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0 };
const STATES = Object.fromEntries(STAGE_ORDER.map((s) => [s, "not-started"])) as Record<StageKey, StageState>;
const roots: Root[] = [];
const text = (id: string) => document.body.querySelector(`[data-testid="${id}"]`)!.textContent!;

async function render(facts: Partial<HomeFacts>) {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  await act(async () => { root.render(<StageRows states={STATES} facts={{ ...FACTS, ...facts }} onOpen={() => {}} onMark={() => {}} />); });
}
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("stage rows' details (B1 walk, Observations D and F)", () => {
  it("a verdict that ends with a full stop gets no second one", async () => {
    await render({ verdict: "Proceed with these modifications: Consider expanding the sample size." });
    expect(text("home-detail-idea")).toBe("Question set. Feasibility read: Proceed with these modifications: Consider expanding the sample size.");
  });

  it("one kept paper is never \"1 papers\"", async () => {
    await render({ kept: 1, read: 1, highlights: 1, cards: 1 });
    expect(text("home-detail-lit")).not.toMatch(/\b1 (papers|highlights|paper cards)\b/);
  });
});
