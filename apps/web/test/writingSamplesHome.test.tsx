// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 12: the writing samples are a copy of everything the student typed, and no tool's facts() reads them. The project home reads the blobs of
 * a stage whose modules declare facts; it must not read (and so must not decrypt) `writing_samples` on a visit, while the facts that are read
 * stay as they were. test/projectHome.test.tsx is a shared test and is not extended for this.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(),
  vault: null as unknown,
  seen: [] as string[][],
  me: { id: "u1", activeProjectId: "p1", scratchProjectId: "s1" }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {}, update: async () => undefined, reload: async () => undefined }) }));
vi.mock("@/lib/vault/useVault", async (orig) => ({ ...(await orig<typeof import("../lib/vault/useVault")>()), useVault: () => h.vault }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
// Writing's Style module is built and says what it was given, the way the real one reads its profile.
vi.mock("@/components/tools/style", () => ({
  built: true,
  facts: (b: Record<string, { value: unknown }>) => {
    h.seen.push(Object.keys(b).sort());
    return { started: !!b.style_profile, detail: "sty2_fact_n", vars: { n: 1 } };
  }
}));
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [], field: "Psychology", stage: "idea", status: "active", contentLang: "en", kind: "research" };
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project, projectId: "p1", go: vi.fn(async () => true), place: null, openExport: vi.fn() }) }));
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

import { ApiError } from "../lib/api";
import { heldBlobs } from "../lib/blobs/held";
import { ProjectHome, highlightCache } from "../components/frame/ProjectHome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; heldBlobs.clear(); highlightCache.clear(); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}

const vaultOff = { status: "off", known: async () => "off", ensureUnlocked: async () => true, decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml, encryptBody: async () => { throw new Error("unused"); } };
const blobs: Record<string, unknown> = {
  style_profile: { profile: "- Warm, reflective tone.", on: true },
  writing_samples: { D1: { title: "T", text: "everything the student typed", words: 40, updated: 1 } }
};
const reads = () => h.api.mock.calls.map(([p]) => String(p)).filter((p) => /\/blobs\//.test(p));

beforeEach(() => {
  h.vault = vaultOff;
  h.seen = [];
  h.api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/projects?include=work") {
      return [{
        ...project, userId: "u1", createdAt: "2026-10-01T00:00:00Z", stageMarks: {}, documentCount: 1, lastEditedAt: null,
        blobs: Object.keys(blobs).map((kind) => ({ kind, updatedAt: "2026-10-20T00:00:00Z", version: 1 })), draftWords: 423, draftEditedAt: "2026-10-10T00:00:00Z"
      }];
    }
    const m = /^\/projects\/p1\/blobs\/(.+)$/.exec(path);
    if (m) {
      const kind = decodeURIComponent(m[1]!);
      if (!(kind in blobs)) throw new ApiError(404, "not-found");
      return { kind, body: JSON.stringify(blobs[kind]), keyVersion: 0, deks: [], updatedAt: "2026-10-20T00:00:00Z", version: 1 };
    }
    throw new Error("unexpected " + path);
  });
});

describe("the project home and the writing samples", () => {
  it("reads the stage's tool blobs for its facts, and never the writing samples", async () => {
    const el = document.body.appendChild(document.createElement("div"));
    const r = createRoot(el);
    roots.push(r);
    act(() => { r.render(<ProjectHome />); });
    await until(() => h.seen.length > 0);
    // The facts got the style profile, as before, and only that.
    expect(h.seen.at(-1)).toEqual(["style_profile"]);
    expect(reads()).toContain("/projects/p1/blobs/style_profile");
    expect(reads().filter((p) => p.includes("writing_samples"))).toEqual([]);
  });
});
