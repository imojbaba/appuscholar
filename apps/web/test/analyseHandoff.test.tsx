// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/* Until Task 12's Analyse a paper panel consumes it, the stub shows the abstract Research kept for it (ruling R7), as the research stub once showed pendingSearch. */
const h = vi.hoisted(() => ({ pending: null as null | { title: string; pages: string[]; src: "abstract" } }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ pendingAnalyse: h.pending }) }));

import { StubPanel } from "../components/tools/StubPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = ""; });
async function render(id: "analyse" | "design") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<StubPanel id={id} />); });
  return root;
}

describe("the Analyse a paper stub keeps Research's abstract", () => {
  it("shows the kept paper's title on the analyse stub only", async () => {
    h.pending = { title: "Growth mindset and poverty", pages: ["Growth mindset and poverty\n\nAbstract\n…"], src: "abstract" };
    const a = await render("analyse");
    expect(document.querySelector('[data-testid="pending-analyse"]')!.textContent).toBe("Abstract kept for Analyse a paper: “Growth mindset and poverty”");
    act(() => a.unmount());
    document.body.innerHTML = "";
    const d = await render("design");
    expect(document.querySelector('[data-testid="pending-analyse"]')).toBeNull();
    act(() => d.unmount());
    h.pending = null;
    const n = await render("analyse");
    expect(document.querySelector('[data-testid="pending-analyse"]')).toBeNull();
    act(() => n.unmount());
  });
});
