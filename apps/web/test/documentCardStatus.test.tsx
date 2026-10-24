// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { TOOL_MESSAGE_FILES } from "../messages/tools";
import { AUTOSAVE_OFF_BADGE, AUTOSAVE_STOPPED_TOAST } from "../lib/docMessages";
import type { SaveStatus } from "../lib/useAutosave";

const h = vi.hoisted(() => ({ toast: vi.fn(), onStatus: null as null | ((s: SaveStatus, seq: number) => void) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: {} }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ setEditor: () => undefined, tab: () => false, status: "idle", text: null }) }));
vi.mock("@/lib/vault/titles", () => ({ fileTitle: () => "untitled", useTitle: () => ({ state: "open", text: "" }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({
    currentDoc: { id: "d1", bodyHtml: "", currentSeq: 1, deks: [], unreadable: null }, place: null,
    registerFlush: () => undefined, registerEditor: () => undefined, setWordCount: () => undefined, startImport: () => undefined, closeDocument: async () => undefined
  })
}));
// The editor is a stand-in: it hands the card's onStatus to the test, which plays the autosave states.
vi.mock("@/components/editor/Editor", () => ({
  Editor: ({ onStatus }: { onStatus: (s: SaveStatus, seq: number) => void }) => { h.onStatus = onStatus; return null; }
}));
vi.mock("@/components/document/DocBar", () => ({ DocBar: () => null }));
vi.mock("@/components/document/ActionRow", () => ({ ActionRow: () => null }));
vi.mock("@/components/document/DocAside", () => ({ DocAside: () => null, aiPaneHasContent: () => false }));
vi.mock("@/components/document/SelectionBubble", () => ({ SelectionBubble: () => null }));
vi.mock("@/components/document/FormatBar", () => ({ FormatBar: () => null }));

import { DocumentCard } from "../components/document/DocumentCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const TOO_LARGE = TOOL_MESSAGE_FILES["pictures.en.json"]!.doc_too_large!;
// The badge is short so it fits a phone's card head; the toast says what to do.
const TOO_LARGE_BADGE = TOOL_MESSAGE_FILES["pictures.en.json"]!.doc_too_large_badge!;
let root: Root;
let box: HTMLElement;
const badge = () => box.querySelector('[data-testid="save-status"]')!.textContent;
const report = (s: SaveStatus) => act(() => { h.onStatus!(s, 2); });

beforeEach(() => {
  h.toast.mockReset();
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  act(() => { root.render(<DocumentCard />); });
});
afterEach(() => { act(() => root.unmount()); box.remove(); });

describe("the document card's save badge", () => {
  it("says the document is too large to save, not AUTO-SAVE OFF, with one toast, until a save succeeds", () => {
    expect(badge()).toBe(E.autosave_on);
    report("too-large");
    expect(badge()).toBe(TOO_LARGE_BADGE);
    expect(badge()).not.toBe(AUTOSAVE_OFF_BADGE);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(TOO_LARGE);
    // The student types (dirty), the save is refused again: still the same badge, no second toast.
    report("dirty"); report("saving"); report("too-large");
    expect(badge()).toBe(TOO_LARGE_BADGE);
    expect(h.toast).toHaveBeenCalledTimes(1);
    // A save that fits turns it green and arms the toast again.
    report("saved");
    expect(badge()).toBe(E.autosave_on);
    report("too-large");
    expect(h.toast).toHaveBeenCalledTimes(2);
  });
  it("a plain failure keeps the AUTO-SAVE OFF badge and its own toast", () => {
    report("error");
    expect(badge()).toBe(AUTOSAVE_OFF_BADGE);
    expect(h.toast).toHaveBeenCalledWith(AUTOSAVE_STOPPED_TOAST);
    // The same document then turns out to be over the limit: the badge follows the newest cause.
    report("too-large");
    expect(badge()).toBe(TOO_LARGE_BADGE);
    report("error");
    expect(badge()).toBe(AUTOSAVE_OFF_BADGE);
    report("saved");
    expect(badge()).toBe(E.autosave_on);
  });
});
