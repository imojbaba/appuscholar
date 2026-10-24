// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/tools/help-install.en.json";
import hi from "@/messages/tools/help-install.hi.json";
import manifest from "@/app/manifest";
import { InstallButton } from "@/components/help/install/InstallButton";
import { OfflineBar } from "@/components/help/install/OfflineBar";
import { InstallSlot } from "@/components/help/slots/InstallSlot";
import { OfflineSlot } from "@/components/help/slots/OfflineSlot";
import { setUpWorker, startInstallWatch } from "@/lib/help/install/register";
import { DICTS } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// OfflineSlot starts the real worker set-up on mount; here it answers what the test says (the set-up itself is tested below with a fake navigator).
const worker = vi.hoisted(() => ({ result: "skipped" as string }));
vi.mock("@/lib/help/install/register", async (orig) => ({ ...(await orig<typeof import("@/lib/help/install/register")>()), startWorker: () => Promise.resolve(worker.result) }));

function draw(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => { createRoot(host).render(node); });
  return host;
}
function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => v });
  act(() => { window.dispatchEvent(new Event(v ? "online" : "offline")); });
}
afterEach(() => { setOnline(true); document.body.innerHTML = ""; });

describe("the manifest (Task C8)", () => {
  it("is a standalone app named Appuscholar with the purple theme colour, the description and the two product icons", () => {
    const m = manifest();
    expect(m.name).toBe("Appuscholar");
    expect(m.short_name).toBe("Appuscholar");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#4c1d95");
    expect(m.description).toBe("A writing and research helper for psychology students.");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect((m.icons ?? []).map((i) => i.src + " " + i.sizes).sort()).toEqual(["/icon-192.png 192x192", "/icon-512.png 512x512", "/icon-512.png 512x512"]);
  });
});

describe("the offline bar", () => {
  it("shows on the offline event and goes on the online event, saying what needs a connection", () => {
    const host = draw(<OfflineBar />);
    expect(host.querySelector("[data-testid=offline-bar]")).toBeNull();
    setOnline(false);
    const bar = host.querySelector("[data-testid=offline-bar]");
    expect(bar?.textContent).toBe(DICTS.en.wc_offline_bar);
    expect(bar?.textContent).toMatch(/saving, AI, paper search and new pages need a connection/);
    expect(bar?.textContent).not.toMatch(/writing still works/i);
    setOnline(true);
    expect(host.querySelector("[data-testid=offline-bar]")).toBeNull();
  });
  it("starts shown when the page opens with no connection", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    expect(draw(<OfflineBar />).querySelector("[data-testid=offline-bar]")).not.toBeNull();
  });
  it("the slot draws the bar", () => {
    const host = draw(<OfflineSlot />);
    setOnline(false);
    expect(host.querySelector("[data-testid=offline-bar]")).not.toBeNull();
  });
  it("keeps one status region mounted and changes what is inside it, so a screen reader announces the change", () => {
    const host = draw(<OfflineBar />);
    const region = host.querySelector("[data-testid=offline-region]") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    setOnline(false);
    expect(host.querySelector("[data-testid=offline-region]")).toBe(region);
    expect(region.textContent).toBe(DICTS.en.wc_offline_bar);
    setOnline(true);
    expect(host.querySelector("[data-testid=offline-region]")).toBe(region);
    expect(region.textContent).toBe("");
  });
  it("sits 56px (bottom-14) above the foot of the screen as v1's bar did, clear of the toast", () => {
    const region = draw(<OfflineBar />).querySelector("[data-testid=offline-region]") as HTMLElement;
    expect(region.className).toMatch(/(^|\s)bottom-14(\s|$)/);
    expect(region.className).not.toMatch(/(^|\s)bottom-4(\s|$)/);
  });
});

describe("the line that says the offline copy was cleared (?nosw=1)", () => {
  afterEach(() => { vi.useRealTimers(); worker.result = "skipped"; });
  it("is not there for an ordinary visit, appears in a status region that stays mounted, and goes by itself after a few seconds", async () => {
    vi.useFakeTimers();
    const host = draw(<OfflineSlot />);
    const region = host.querySelector("[data-testid=sw-region]") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(region.textContent).toBe("");
    document.body.innerHTML = "";
    worker.result = "cleared";
    const host2 = draw(<OfflineSlot />);
    const region2 = host2.querySelector("[data-testid=sw-region]") as HTMLElement;
    expect(region2.textContent).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(region2.textContent).toBe(DICTS.en.wc_install_cleared);
    expect(host2.querySelector("[data-testid=sw-cleared]")?.textContent).toBe(DICTS.en.wc_install_cleared);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(region2.textContent).toBe(DICTS.en.wc_install_cleared);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(host2.querySelector("[data-testid=sw-region]")).toBe(region2);
    expect(region2.textContent).toBe("");
  });
  it("sits above the offline bar rather than on it", () => {
    worker.result = "skipped";
    const region = draw(<OfflineSlot />).querySelector("[data-testid=sw-region]") as HTMLElement;
    expect(region.className).toMatch(/(^|\s)bottom-32(\s|$)/);
  });
});

describe("the install button", () => {
  it("is hidden until the browser offers the install, then installs on a press; before that a line points at the browser menu", async () => {
    startInstallWatch();
    const host = draw(<InstallSlot />);
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
    expect(host.querySelector("[data-testid=install-hint]")?.textContent).toBe(DICTS.en.wc_install_menu);
    expect(host.textContent).toBe(DICTS.en.wc_install_menu);
    const prompt = vi.fn();
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    const btn = host.querySelector("[data-testid=install-app]") as HTMLButtonElement;
    expect(btn.textContent).toBe(DICTS.en.wc_install_btn);
    expect(host.textContent).toBe(DICTS.en.wc_install_btn);
    expect(host.querySelector("[data-testid=install-hint]")).toBeNull();
    await act(async () => { btn.click(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
  });
  it("keeps an offer the browser made before anything on the page was drawn: the watch starts when the module loads, not when a component mounts", async () => {
    vi.resetModules();
    const fresh = await import("@/lib/help/install/register");
    expect(fresh.installState().offer).toBeNull();
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(fresh.installState().offer).toBe(ev);
    window.dispatchEvent(new Event("appinstalled"));
    expect(fresh.installState()).toEqual({ offer: null, installed: true });
  });
  it("an installed app (appinstalled) shows neither the button nor the line", () => {
    startInstallWatch();
    const host = draw(<InstallButton />);
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
    expect(host.querySelector("[data-testid=install-hint]")).toBeNull();
  });
});

describe("the install copy (D-C-84)", () => {
  it("is wc_install_btn and wc_install_menu only: v1's sentence about work staying in the browser it was made in is not carried", () => {
    const copy = (d: Record<string, string>) => Object.keys(d).filter((k) => k.startsWith("wc_install_")).sort();
    expect(copy(en)).toEqual(["wc_install_btn", "wc_install_cleared", "wc_install_menu"]);
    expect(copy(hi)).toEqual(copy(en));
    const all = Object.values(en).join("\n");
    expect(all).not.toMatch(/stays in the browser|browser it was made in|may not show the same projects|Use Backup to move/i);
    expect(all).not.toMatch(/\b(stays|stored|kept|saved) (in|on) this (browser|device|computer)\b/i);
  });
});

describe("registering the worker", () => {
  const fake = (scriptURL?: string) => {
    const unregister = vi.fn(async () => true);
    const register = vi.fn(async () => ({}));
    const cacheDelete = vi.fn(async () => true);
    const reg = scriptURL ? { unregister, active: { scriptURL } } : { unregister };
    return {
      unregister, register, cacheDelete,
      nav: { serviceWorker: { register, getRegistrations: async (): Promise<readonly typeof reg[]> => [reg] } },
      caches: { keys: async () => ["appu-wc-1-abc1234", "other"], delete: cacheDelete }
    };
  };
  it("registers /sw.js at the root, versioned by the build, in a production build only", async () => {
    const dev = fake();
    expect(await setUpWorker({ production: false, version: "abc1234", search: "", protocol: "https:", ...dev })).toBe("skipped");
    expect(dev.register).not.toHaveBeenCalled();
    const prod = fake();
    expect(await setUpWorker({ production: true, version: "abc1234", search: "", protocol: "https:", ...prod })).toBe("registered");
    expect(prod.register).toHaveBeenCalledWith("/sw.js?v=abc1234", { scope: "/", updateViaCache: "none" });
  });
  it("a build with no commit registers as the dev build, so the address is always /sw.js?v=<something>", async () => {
    const f = fake();
    await setUpWorker({ production: true, version: "", search: "", protocol: "https:", ...f });
    expect(f.register).toHaveBeenCalledWith("/sw.js?v=dev", { scope: "/", updateViaCache: "none" });
  });
  it("a development build quietly unregisters a worker left on this address by next start, and clears its caches, and says nothing", async () => {
    const f = fake("http://localhost:3000/sw.js?v=abc1234");
    expect(await setUpWorker({ production: false, version: "dev", search: "", protocol: "http:", ...f })).toBe("skipped");
    expect(f.unregister).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledWith("appu-wc-1-abc1234");
    expect(f.register).not.toHaveBeenCalled();
  });
  it("a development build leaves another app's worker on the same address alone", async () => {
    const f = fake("http://localhost:3000/service-worker.js");
    await setUpWorker({ production: false, version: "dev", search: "", protocol: "http:", ...f });
    expect(f.unregister).not.toHaveBeenCalled();
  });
  it("does nothing without service worker support or on a page that is not http(s)", async () => {
    const f = fake();
    expect(await setUpWorker({ production: true, version: "abc1234", search: "", protocol: "file:", ...f })).toBe("skipped");
    expect(await setUpWorker({ production: true, version: "abc1234", search: "", protocol: "https:", nav: {}, caches: f.caches })).toBe("skipped");
    expect(f.register).not.toHaveBeenCalled();
  });
  it("?nosw=1 unregisters the worker and clears the appu- caches only, and does not register", async () => {
    const f = fake();
    expect(await setUpWorker({ production: true, version: "abc1234", search: "?a=1&nosw=1", protocol: "https:", ...f })).toBe("cleared");
    expect(f.unregister).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledWith("appu-wc-1-abc1234");
    expect(f.register).not.toHaveBeenCalled();
  });
  it("?nosw=1 wipes again after 1.5 seconds, because the worker still on this page may have refilled its cache meanwhile (v1 did the same)", async () => {
    vi.useFakeTimers();
    try {
      const f = fake();
      await setUpWorker({ production: true, version: "abc1234", search: "?nosw=1", protocol: "https:", ...f });
      expect(f.cacheDelete).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1499);
      expect(f.cacheDelete).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(f.cacheDelete).toHaveBeenCalledTimes(2);
      expect(f.unregister).toHaveBeenCalledTimes(2);
      expect(f.register).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
