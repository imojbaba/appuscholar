// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/* The toolbar's Viva button (Task E4, register row D-S2-46): it no longer toasts "arrives in a later phase"; it opens Review > Viva through the frame's place link. */
const h = vi.hoisted(() => ({ go: vi.fn(async () => true), toast: vi.fn(), projectId: "p1" as string | null }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ go: h.go, projectId: h.projectId, currentDoc: { id: "d", wordCount: 3 }, wordCount: 3 }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: {}, update: async () => {} }) }));
vi.mock("@/lib/ai/useWritingRun", () => ({ useWritingRun: () => async () => {} }));
vi.mock("@/components/ui/toast", () => ({ toast: (m: string) => h.toast(m) }));
vi.mock("../components/document/OriginBadge", () => ({ OriginBadge: () => null }));
vi.mock("../components/document/CaretChip", () => ({ CaretChip: () => null }));
vi.mock("@/components/workspace/dialogs/TemplatePicker", () => ({ TemplatePicker: () => null }));

import { ActionRow } from "../components/document/ActionRow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(<ActionRow editor={{} as never} highlightAi={false} onHighlightAi={() => {}} />); });
}
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; h.go.mockClear(); h.toast.mockClear(); h.projectId = "p1"; });

describe("the Viva button", () => {
  it("opens Review > Viva at /p/<id>/review/viva and toasts nothing", async () => {
    await mount();
    const btn = document.querySelector<HTMLElement>('[data-testid="act-viva"]')!;
    expect(btn).not.toBeNull();
    await act(async () => { btn.click(); });
    expect(h.go).toHaveBeenCalledTimes(1);
    expect(h.go).toHaveBeenCalledWith("/p/p1/review/viva");
    expect(h.toast).not.toHaveBeenCalled();
  });
});
