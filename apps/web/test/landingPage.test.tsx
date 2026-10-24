// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * What `/` does with an old bookmark's `#capture=` hash (wave B Task 20 fix round, register row D-S2-125, walk fault W13): it sends the student to the adding screen at once,
 * before it asks for /me or for GET /projects, so a GET /projects that fails cannot lose the paper, and the vault's one-off migration never sees `/` with a capture in it.
 */
const h = vi.hoisted(() => ({
  replace: vi.fn(),
  api: vi.fn(),
  me: null as null | { id: string; activeProjectId: string | null; scratchProjectId: string }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {} }) }));

import Landing from "../app/(app)/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
async function mount() {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Landing />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const HASH = "#capture=eyJ0aXRsZSI6IlQifQ%3D%3D";

beforeEach(() => {
  h.replace.mockReset();
  h.api.mockReset().mockResolvedValue([{ id: "p1" }]);
  h.me = { id: "u1", activeProjectId: "p1", scratchProjectId: "scratch" };
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("/ with a #capture= hash", () => {
  it("goes to /add with the hash before /me has loaded, and asks for no project list", async () => {
    h.me = null;
    window.history.replaceState(null, "", "/" + HASH);
    await mount();
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/add" + HASH);
    expect(h.api).not.toHaveBeenCalled();
  });

  it("goes to /add when GET /projects would fail: the capture is not lost to an error screen", async () => {
    h.api.mockRejectedValue(new Error("offline"));
    window.history.replaceState(null, "", "/" + HASH);
    await mount();
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/add" + HASH);
    expect(h.api).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="error-msg"]')).toBeNull();
  });
});

describe("/ without one lands as before", () => {
  it("the active project's home", async () => {
    await mount();
    expect(h.api).toHaveBeenCalledWith("/projects");
    expect(h.replace).toHaveBeenCalledWith("/p/p1");
  });

  it("another hash is left behind", async () => {
    window.history.replaceState(null, "", "/#top");
    await mount();
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/p/p1");
  });

  it("a failed project list still says so", async () => {
    h.api.mockRejectedValue(new Error("offline"));
    await mount();
    expect(h.replace).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="error-msg"]')).not.toBeNull();
  });
});
