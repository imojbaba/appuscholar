// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 11: the AI button's entry point (useCallAI) gives callAI the open project's names (spec 2026-10-24-participants-design.md §8.3; rulings R1 and R41). The real hook, the real callAI
 * and the real readers run; the dialog is answered by the test, the api is an in-memory stand-in with the blob routes, the vault a status and a "sealed:" wrapper.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), askPd: vi.fn(), ensure: vi.fn(), status: "unlocked" as string, project: { id: "p1" } as { id: string } | null
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: h.project, openSettings: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { provider: "gemini", contentLang: "en" } }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ blobs: {}, hasKey: () => false, getUnlocked: async () => null }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ askPassphrase: vi.fn(async () => null) }));
vi.mock("@/components/workspace/dialogs/RateLimit", () => ({ showRateLimit: vi.fn() }));
vi.mock("@/lib/ai/pdDialog", () => ({ askPd: (sc: unknown) => h.askPd(sc) }));
vi.mock("@/lib/vault/useVault", () => {
  const open = () => h.status === "unlocked" || h.status === "migrating";
  return {
    useVault: () => ({
      status: h.status,
      known: async () => h.status,
      ensureUnlocked: async () => { h.ensure(); return open(); },
      encryptBody: async () => { throw new Error("vault-locked"); },
      decryptBody: async (doc: { bodyHtml: string; keyVersion: number }) => {
        if (doc.keyVersion === 0) return doc.bodyHtml;
        if (!open()) throw new Error("vault-locked");
        return doc.bodyHtml.replace(/^sealed:/, "");
      }
    })
  };
});

import { ApiError } from "../lib/api";
import { keyStore } from "../lib/ai/keys";
import { resetPdMemo } from "../lib/ai/callAI";
import { useCallAI } from "../lib/ai/useCallAI";
import { emptyList, type ParticipantList } from "../lib/blobs/kinds/participants";
import { addPerson } from "../lib/tools/participants/list";
import { resetLists } from "../lib/tools/participants/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIST: ParticipantList = addPerson(emptyList(), { name: "Priya Sharma", spellings: ["Priya"], joined: "2026-10-01" }).list;
let blobs: Map<string, unknown>;
const roots: Root[] = [];
type Call = ReturnType<typeof useCallAI>;
/** The real hook in its own root; `rerender` draws it again (the stand-in project and vault are read at each render). */
async function mountProbe() {
  const box: { call: Call | null } = { call: null };
  function Probe() { box.call = useCallAI(); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return { call: (...a: Parameters<Call>) => box.call!(...a), rerender: async () => { await act(async () => { root.render(<Probe />); }); } };
}
let probe: Awaited<ReturnType<typeof mountProbe>>;
const calls = () => h.api.mock.calls.map(([path, init]) => ((init as RequestInit | undefined)?.method ?? "GET") + " " + String(path));
const sentPrompt = () => JSON.parse((h.api.mock.calls.find((c) => c[0] === "/ai/complete")![1] as { body: string }).body).prompt as string;


beforeEach(async () => {
  blobs = new Map();
  h.status = "unlocked";
  h.project = { id: "p1" };
  h.ensure.mockReset();
  h.askPd.mockReset().mockResolvedValue({ answer: "mask", leave: [] });
  resetLists();
  resetPdMemo();
  keyStore.clear("gemini");
  keyStore.setSession("gemini", "AIza1");
  h.api.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    const m = /^\/projects\/([^/]+)\/blobs(?:\/([^/]+))?$/.exec(path);
    if (m && !m[2]) return [...blobs.keys()].map((k) => ({ kind: k, keyVersion: 1, updatedAt: "2026-10-24T00:00:00.000Z" }));
    if (m && m[2]) {
      const v = blobs.get(decodeURIComponent(m[2]));
      if (v === undefined) throw new ApiError(404, "not-found");
      return { kind: m[2], body: "sealed:" + JSON.stringify(v), keyVersion: 1, deks: [], updatedAt: "2026-10-24T00:00:00.000Z", version: 1 };
    }
    if (path === "/ai/complete" && init?.method === "POST") return { text: "ok", model: "m" };
    throw new ApiError(404, "not-found");
  });
  probe = await mountProbe();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("useCallAI gives callAI the open project's names", () => {
  it("a name on the stored list is found and masked as its code; the list is read once for the window", async () => {
    blobs.set("participants", LIST);
    await probe.call("Priya Sharma said hello.");
    expect(h.askPd).toHaveBeenCalledTimes(1);
    expect(h.askPd.mock.calls[0]![0]).toMatchObject({ names: { listed: 1, maybe: [], locked: false } });
    expect(sentPrompt()).toBe("P001 said hello.");
    await probe.call("Priya Sharma said goodbye.");
    expect(calls().filter((c) => c === "GET /projects/p1/blobs/participants")).toHaveLength(1);
    // The check reads and never writes: the only POST is the request itself.
    expect(calls().filter((c) => !c.startsWith("GET"))).toEqual(["POST /ai/complete", "POST /ai/complete"]);
  });

  it("the plan is read: a codes plan suggests Meena, and a literature request does not", async () => {
    blobs.set("design_ec", { idMode: "codes" });
    await probe.call("Meena said it was hard.");
    expect(h.askPd.mock.calls[0]![0]).toMatchObject({ names: { listed: 0, maybe: ["Meena"], locked: false } });
    expect(sentPrompt()).toBe("[name] said it was hard.");
    h.askPd.mockClear();
    await probe.call("Carl Rogers (1951) wrote about it.", { literature: true });
    expect(h.askPd).not.toHaveBeenCalled();
  });

  it("no plan answer and no list: nothing is suggested", async () => {
    await probe.call("Meena said it was hard.");
    expect(h.askPd).not.toHaveBeenCalled();
    expect(sentPrompt()).toBe("Meena said it was hard.");
  });

  it("with no project open nothing is read: the check is for emails, phone numbers and ID numbers only", async () => {
    h.project = null;
    await probe.rerender();
    await probe.call("Priya Sharma said hello.");
    expect(h.askPd).not.toHaveBeenCalled();
    expect(calls().filter((c) => c.includes("/blobs"))).toEqual([]);
  });

  it("a locked vault with a list in the project: the dialog says so; Unlock opens the vault and the request is checked against the list", async () => {
    blobs.set("participants", LIST);
    h.status = "locked";
    h.ensure.mockImplementation(() => { h.status = "unlocked"; });
    h.askPd.mockImplementation(async (sc: { names?: { locked: boolean } }) => (sc.names?.locked ? { answer: "unlock", leave: [] } : { answer: "mask", leave: [] }));
    await act(async () => { await probe.call("Priya Sharma said hello."); });
    expect(h.askPd).toHaveBeenCalledTimes(2);
    expect(h.askPd.mock.calls[0]![0]).toMatchObject({ names: { listed: 0, maybe: [], locked: true } });
    expect(h.ensure).toHaveBeenCalledTimes(1);
    expect(h.askPd.mock.calls[1]![0]).toMatchObject({ names: { listed: 1, locked: false } });
    expect(sentPrompt()).toBe("P001 said hello.");
    // Locked, nothing was read of the list before the student unlocked.
    expect(calls().indexOf("GET /projects/p1/blobs")).toBeLessThan(calls().indexOf("GET /projects/p1/blobs/participants"));
  });

  it("a locked vault and no list in the project: no line, no dialog", async () => {
    h.status = "locked";
    await probe.call("Plain words.");
    expect(h.askPd).not.toHaveBeenCalled();
    expect(h.ensure).not.toHaveBeenCalled();
  });
});
