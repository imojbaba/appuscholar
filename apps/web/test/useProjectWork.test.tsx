// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectWork, type ProjectWork } from "@/lib/frame/useProjectWork";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = (id: string): ProjectWork => ({
  id, userId: "u1", title: "T " + id, titleKeyVersion: 0, deks: [], field: "Education", stage: "idea", status: "active", contentLang: "en", kind: "project",
  createdAt: "2026-10-01T00:00:00.000Z", stageMarks: {}, documentCount: 1, lastEditedAt: null,
  blobs: [{ kind: "idea_intake", updatedAt: "2026-10-02T00:00:00.000Z", version: 1 }], draftWords: 0, draftEditedAt: null
});
const PROJECTS = Array.from({ length: 20 }, (_, i) => project("p" + i));
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => { vi.restoreAllMocks(); });

describe("useProjectWork", () => {
  it("twenty projects' work comes from one request, and no blob is read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u === "/api/token") return json({ token: "tok", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
      if (/\/projects\?include=work$/.test(u)) return json(PROJECTS);
      return new Response("{}", { status: 404 });
    });
    let seen: ReturnType<typeof useProjectWork> | null = null;
    function Probe() { seen = useProjectWork(); return null; }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(<Probe />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen!.work).toHaveLength(20);
    expect(seen!.work![3]!.id).toBe("p3");
    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => /\/projects\?include=work$/.test(u))).toHaveLength(1);
    expect(urls.filter((u) => /\/projects\/[^/]+\/blobs/.test(u))).toHaveLength(0);

    await act(async () => { await seen!.reload(); });
    expect(fetchSpy.mock.calls.filter(([u]) => /\/projects\?include=work$/.test(String(u)))).toHaveLength(2);
    act(() => root.unmount());
  });

  it("work is null until the list answers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    let seen: ReturnType<typeof useProjectWork> | null = null;
    function Probe() { seen = useProjectWork(); return null; }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(<Probe />); });
    expect(seen!.work).toBeNull();
    act(() => root.unmount());
  });
});
