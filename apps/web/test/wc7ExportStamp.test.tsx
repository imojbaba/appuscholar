// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  download: vi.fn(),
  toast: vi.fn(),
  me: { id: "u1", scratchProjectId: "s1" } as { id: string; scratchProjectId: string } | null,
  vault: { known: vi.fn(async () => "off"), ensureUnlocked: vi.fn(async () => true), decryptBody: vi.fn() },
  order: [] as string[]
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: (...a: unknown[]) => h.api(...a) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: (...a: unknown[]) => { h.order.push("download"); h.download(...a); } }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/vault/export", async (orig) => ({ ...(await orig<typeof import("../lib/vault/export")>()), exportAll: async () => new Blob(["zip"]) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({}) }));

import { useAccount } from "../components/workspace/dialogs/Help";
import { lastBackup } from "../lib/help/backup/stamp";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
function Probe() { const { exportWork } = useAccount(); return <button data-testid="go" onClick={() => { void exportWork(); }} />; }
function mount() {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<Probe />); });
}
/** Presses the button and lets the export settle. */
const run = async () => {
  await act(async () => { document.body.querySelector<HTMLElement>('[data-testid="go"]')!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};

beforeEach(() => {
  localStorage.clear();
  h.order = [];
  h.me = { id: "u1", scratchProjectId: "s1" };
  h.api.mockReset(); h.download.mockReset(); h.toast.mockReset();
  h.vault.known.mockResolvedValue("off"); h.vault.ensureUnlocked.mockResolvedValue(true);
  // The projects (none besides the scratch space) and each one's blob listing, which the export reads (also for the participant-list question).
  h.api.mockImplementation(async (path: string) => (path === "/projects?include=work" || /\/blobs$/.test(path) ? [] : undefined));
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Export all my work stamps the backup (Task C7)", () => {
  it("a finished export marks a backup made now for this student, after the file is saved", async () => {
    h.download.mockImplementation(() => { h.order.push(`stamp-before-download:${lastBackup("u1") > 0}`); });
    mount();
    await run();
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.order).toEqual(["download", "stamp-before-download:false"]);
    expect(lastBackup("u1")).toBeGreaterThan(0);
    expect(Math.abs(lastBackup("u1") - Date.now())).toBeLessThan(5000);
    expect(Object.keys(localStorage)).toEqual(["appu_last_backup_u1"]);
  });

  it("an export that fails stamps nothing", async () => {
    h.api.mockImplementation(async (path: string) => { if (path === "/me/export-audit") throw new Error("down"); return path === "/projects?include=work" || /\/blobs$/.test(path) ? [] : undefined; });
    mount();
    await run();
    expect(h.download).not.toHaveBeenCalled();
    expect(lastBackup("u1")).toBe(0);
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("a cancelled unlock stamps nothing", async () => {
    h.vault.known.mockResolvedValue("locked");
    h.vault.ensureUnlocked.mockResolvedValue(false);
    mount();
    await run();
    expect(h.download).not.toHaveBeenCalled();
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("with no signed-in student nothing is written", async () => {
    h.me = null;
    mount();
    await run();
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(Object.keys(localStorage)).toEqual([]);
  });
});
