// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { InstallButton } from "@/components/help/install/InstallButton";
import { OfflineBar } from "@/components/help/install/OfflineBar";
import { InstallSlot } from "@/components/help/slots/InstallSlot";
import { OfflineSlot } from "@/components/help/slots/OfflineSlot";
import { setUpWorker, startInstallWatch } from "@/lib/help/install/register";
import { DICTS } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});

describe("the install button", () => {
  it("is hidden until the browser offers the install, then installs on a press; before that a line points at the browser menu", async () => {
    startInstallWatch();
    const host = draw(<InstallSlot />);
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
    expect(host.querySelector("[data-testid=install-hint]")?.textContent).toBe(DICTS.en.wc_install_menu);
    const prompt = vi.fn();
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    const btn = host.querySelector("[data-testid=install-app]") as HTMLButtonElement;
    expect(btn.textContent).toBe(DICTS.en.wc_install_btn);
    expect(host.querySelector("[data-testid=install-hint]")).toBeNull();
    await act(async () => { btn.click(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
  });
  it("an installed app (appinstalled) shows neither the button nor the line", () => {
    startInstallWatch();
    const host = draw(<InstallButton />);
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(host.querySelector("[data-testid=install-app]")).toBeNull();
    expect(host.querySelector("[data-testid=install-hint]")).toBeNull();
  });
});

describe("registering the worker", () => {
  const fake = () => {
    const unregister = vi.fn(async () => true);
    const register = vi.fn(async () => ({}));
    const cacheDelete = vi.fn(async () => true);
    return {
      unregister, register, cacheDelete,
      nav: { serviceWorker: { register, getRegistrations: async () => [{ unregister }] } },
      caches: { keys: async () => ["appu-wc-1", "other"], delete: cacheDelete }
    };
  };
  it("registers /sw.js at the root in a production build only", async () => {
    const dev = fake();
    expect(await setUpWorker({ production: false, search: "", protocol: "https:", ...dev })).toBe("skipped");
    expect(dev.register).not.toHaveBeenCalled();
    const prod = fake();
    expect(await setUpWorker({ production: true, search: "", protocol: "https:", ...prod })).toBe("registered");
    expect(prod.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });
  it("does nothing without service worker support or on a page that is not http(s)", async () => {
    const f = fake();
    expect(await setUpWorker({ production: true, search: "", protocol: "file:", ...f })).toBe("skipped");
    expect(await setUpWorker({ production: true, search: "", protocol: "https:", nav: {}, caches: f.caches })).toBe("skipped");
    expect(f.register).not.toHaveBeenCalled();
  });
  it("?nosw=1 unregisters the worker and clears the appu- caches only, and does not register", async () => {
    const f = fake();
    expect(await setUpWorker({ production: true, search: "?a=1&nosw=1", protocol: "https:", ...f })).toBe("cleared");
    expect(f.unregister).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledTimes(1);
    expect(f.cacheDelete).toHaveBeenCalledWith("appu-wc-1");
    expect(f.register).not.toHaveBeenCalled();
  });
});
