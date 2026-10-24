// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import wcEn from "../messages/tools/help-backup.en.json";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  popout: false,
  exportWork: vi.fn(async () => {}),
  exporting: false,
  settings: { me: null as unknown, settings: {} as Record<string, unknown> }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => h.settings }));
vi.mock("@/lib/popout/mode", async (orig) => ({ ...(await orig<typeof import("../lib/popout/mode")>()), isPopout: () => h.popout }));
vi.mock("@/components/workspace/dialogs/Help", () => ({ useAccount: () => ({ exportWork: h.exportWork, exporting: h.exporting }) }));

import { NudgeSlot } from "../components/help/slots/NudgeSlot";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";
import { lastBackup, snoozedUntil, stampBackup } from "../lib/help/backup/stamp";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...en, ...wcEn } as Record<string, string>;
/** A message with its {holes} filled, as t() fills them. */
const say = (key: string, vars: Record<string, string | number> = {}) => E[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();
const ME = { id: "u1", email: "a@e2e.local", settings: { seenWelcome: true }, scratchProjectId: "s1", termsAcceptedAt: "2026-10-20T00:00:00Z", ageConfirmed: true };
const work = (...words: number[]) => words.map((draftWords, i) => ({ id: "p" + i, draftWords }));
const shell = (over: Partial<ProjectValue> = {}) => ({ dialog: null, projectId: "p1", ...over }) as unknown as ProjectValue;
const nudge = () => document.body.querySelector<HTMLElement>('[data-testid="backup-nudge"]');
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const roots: Root[] = [];
function mount(value: ProjectValue | null = shell()) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  act(() => { root.render(value ? <ProjectProvider value={value}><NudgeSlot /></ProjectProvider> : <NudgeSlot />); });
  return root;
}
async function rerender(value: ProjectValue) {
  await act(async () => { roots[roots.length - 1]!.render(<ProjectProvider value={value}><NudgeSlot /></ProjectProvider>); });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  localStorage.clear();
  h.popout = false; h.exporting = false;
  h.settings = { me: ME, settings: { seenWelcome: true } };
  h.api.mockReset(); h.api.mockResolvedValue(work(100, 60));
  h.exportWork.mockReset(); h.exportWork.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("the backup reminder (Task C7)", () => {
  it("shows 4 seconds after load, not before, with the words written (the sum of the projects' draft words) and v1's two buttons", async () => {
    mount();
    await tick(3999);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
    await tick(1);
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(h.api.mock.calls[0]![0]).toBe("/projects?include=work");
    expect(nudge()!.dataset.kind).toBe("new");
    expect(nudge()!.querySelector('[data-testid="backup-nudge-text"]')!.textContent).toBe(say("wc_bk_nudge_new", { w: 160 }));
    expect(nudge()!.querySelector('[data-testid="backup-nudge-now"]')!.textContent).toBe(E.backup_now);
    expect(nudge()!.querySelector('[data-testid="backup-nudge-later"]')!.textContent).toBe(E.backup_later);
    expect(nudge()!.getAttribute("aria-label")).toBe(E.wc_bk_nudge_label);
  });

  it("says nothing true of this browser: the account keeps the work, a backup is a second copy", () => {
    expect(E.wc_bk_nudge_new).toMatch(/saved in your account/);
    expect(E.wc_bk_nudge_new).toMatch(/second copy/);
    expect(E.wc_bk_nudge_new).not.toMatch(/erase|this browser/i);
    expect(E.wc_bk_nudge_old).toMatch(/saved in your account/);
  });

  it("is a note, not a dialog: it takes no focus and has no dialog role", async () => {
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    mount();
    await tick(4000);
    expect(nudge()).not.toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(document.body.querySelector("[role=dialog], [role=alertdialog]")).toBeNull();
    expect(nudge()!.className).toContain("fixed");
  });

  it("steps aside after 12 seconds for the rest of this load, without snoozing; focus inside it holds it open", async () => {
    mount();
    await tick(4000);
    expect(nudge()).not.toBeNull();
    await tick(11_999);
    expect(nudge()).not.toBeNull();
    await tick(1);
    expect(nudge()).toBeNull();
    expect(snoozedUntil("u1")).toBe(0);
    await tick(60_000);
    expect(nudge()).toBeNull();
    // A student who is using it (focus is on its button) keeps it.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    mount();
    await tick(4000);
    const later = nudge()!.querySelector<HTMLElement>('[data-testid="backup-nudge-later"]')!;
    act(() => { later.focus(); });
    await tick(30_000);
    expect(nudge()).not.toBeNull();
    act(() => { later.blur(); });
    await tick(12_000);
    expect(nudge()).toBeNull();
  });

  it("under 150 words shows nothing", async () => {
    h.api.mockResolvedValue(work(100, 49));
    mount();
    await tick(4000);
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(nudge()).toBeNull();
  });

  it("a backup 8 days old shows the old words with the days; one made 3 days ago shows nothing and asks the api nothing", async () => {
    stampBackup("u1", NOW - 8 * DAY - 1000);
    mount();
    await tick(4000);
    expect(nudge()!.dataset.kind).toBe("old");
    expect(nudge()!.querySelector('[data-testid="backup-nudge-text"]')!.textContent).toBe(say("wc_bk_nudge_old", { n: 8 }));
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.api.mockClear();
    stampBackup("u1", NOW - 3 * DAY);
    mount();
    await tick(5000);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("never in a pop-out, and it asks the api nothing there", async () => {
    h.popout = true;
    mount();
    await tick(10_000);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("with no signed-in student it does nothing; outside the project shell it draws nothing and does not throw", async () => {
    h.settings = { me: null, settings: {} };
    mount();
    await tick(10_000);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
    h.settings = { me: ME, settings: { seenWelcome: true } };
    mount(null);
    await tick(10_000);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("the timer is cleared when it unmounts", async () => {
    const root = mount();
    await tick(2000);
    act(() => { root.unmount(); });
    await tick(10_000);
    expect(h.api).not.toHaveBeenCalled();
  });

  it("a failed read of the projects shows nothing and does not throw", async () => {
    h.api.mockRejectedValue(new Error("offline"));
    mount();
    await tick(4000);
    expect(nudge()).toBeNull();
  });

  it("Later hides it and snoozes it for 3 days, for this student only; a reload inside the snooze asks nothing, a second student still sees it", async () => {
    mount();
    await tick(4000);
    await act(async () => { nudge()!.querySelector<HTMLElement>('[data-testid="backup-nudge-later"]')!.click(); });
    expect(nudge()).toBeNull();
    expect(snoozedUntil("u1")).toBe(NOW + 4000 + 3 * DAY);
    expect(snoozedUntil("u2")).toBe(0);
    expect([...Object.keys(localStorage)].filter((k) => k.startsWith("appu_backup_snooze"))).toEqual(["appu_backup_snooze_u1"]);
    // The next load, a day later.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.api.mockClear();
    vi.setSystemTime(NOW + DAY);
    mount();
    await tick(5000);
    expect(nudge()).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
    // Another student on this computer.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.settings = { me: { ...ME, id: "u2" }, settings: { seenWelcome: true } };
    mount();
    await tick(4000);
    expect(nudge()).not.toBeNull();
    // After the three days the first student is asked again.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.settings = { me: ME, settings: { seenWelcome: true } };
    vi.setSystemTime(NOW + 3 * DAY + 5000);
    mount();
    await tick(4000);
    expect(nudge()).not.toBeNull();
  });

  it("Back up now runs the same export as Help's, and the reminder goes once the backup is stamped", async () => {
    h.exportWork.mockImplementation(async () => { stampBackup("u1", Date.now()); });
    mount();
    await tick(4000);
    await act(async () => { nudge()!.querySelector<HTMLElement>('[data-testid="backup-nudge-now"]')!.click(); });
    expect(h.exportWork).toHaveBeenCalledTimes(1);
    expect(lastBackup("u1")).toBe(NOW + 4000);
    expect(nudge()).toBeNull();
  });

  it("if the export does not finish (cancelled unlock, a failure) the reminder stays", async () => {
    mount();
    await tick(4000);
    await act(async () => { nudge()!.querySelector<HTMLElement>('[data-testid="backup-nudge-now"]')!.click(); });
    expect(h.exportWork).toHaveBeenCalledTimes(1);
    expect(nudge()).not.toBeNull();
  });

  it("a backup made meanwhile, from Help, ends the reminder: it does not come back when Help closes", async () => {
    mount();
    await tick(4000);
    expect(nudge()).not.toBeNull();
    await rerender(shell({ dialog: "help" }));
    expect(nudge()).toBeNull();
    stampBackup("u1", Date.now());
    await rerender(shell({ dialog: null }));
    expect(nudge()).toBeNull();
  });
});

describe("the reminder waits for the student's attention to be free", () => {
  it("not over a dialog of the shell (Help, the terms, the tour): it appears when that closes", async () => {
    mount(shell({ dialog: "help" }));
    await tick(4000);
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(nudge()).toBeNull();
    await rerender(shell({ dialog: null }));
    expect(nudge()).not.toBeNull();
    await rerender(shell({ dialog: "welcome" }));
    expect(nudge()).toBeNull();
  });

  it("not over the terms gate, nor before the welcome tour has been seen", async () => {
    h.settings = { me: { ...ME, termsAcceptedAt: null }, settings: { seenWelcome: true } };
    mount();
    await tick(4000);
    expect(nudge()).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.settings = { me: ME, settings: {} };
    mount();
    await tick(4000);
    expect(nudge()).toBeNull();
  });

  it("not while any dialog is open, whoever opened it (the recap is one); it comes back when that dialog goes", async () => {
    const recap = document.body.appendChild(document.createElement("div"));
    recap.setAttribute("role", "dialog");
    mount();
    await tick(4000);
    expect(nudge()).toBeNull();
    await act(async () => { recap.remove(); await Promise.resolve(); });
    expect(nudge()).not.toBeNull();
    const ask = document.body.appendChild(document.createElement("div"));
    ask.setAttribute("role", "alertdialog");
    await act(async () => { await Promise.resolve(); });
    expect(nudge()).toBeNull();
    await act(async () => { ask.remove(); await Promise.resolve(); });
    expect(nudge()).not.toBeNull();
  });

  it("not while offline: the export needs the connection", async () => {
    const was = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      mount();
      await tick(4000);
      expect(nudge()).toBeNull();
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      await act(async () => { window.dispatchEvent(new Event("online")); });
      expect(nudge()).not.toBeNull();
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
      if (was) Object.defineProperty(Navigator.prototype, "onLine", was);
    }
  });
});
