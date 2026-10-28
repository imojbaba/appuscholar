"use client";
import { useSyncExternalStore } from "react";
import { APP_VERSION } from "@/lib/version";

/** What a browser hands over when the app can be installed (not in lib.dom). */
export type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

type Registration = { unregister(): Promise<boolean>; active?: { scriptURL: string } | null; waiting?: { scriptURL: string } | null; installing?: { scriptURL: string } | null };
type WorkerNav = { serviceWorker?: { register(url: string, o: { scope: string; updateViaCache: "none" }): Promise<unknown>; getRegistrations(): Promise<readonly Registration[]> } };
type CacheHost = { keys(): Promise<string[]>; delete(k: string): Promise<boolean> };
export type WorkerResult = "registered" | "cleared" | "skipped";

/** v1 wiped a second time 1.5 s after `?nosw=1`: the worker still controlling this page can refill its cache while the page is open. */
const WIPE_AGAIN_MS = 1500;

/** Whether a registration is this app's worker (/sw.js), so a development server never unregisters another app's worker that shared the address. A registration that says nothing about its script counts as ours. */
function isOurs(r: Registration): boolean {
  const url = (r.active ?? r.waiting ?? r.installing)?.scriptURL;
  if (!url) return true;
  try { return new URL(url).pathname === "/sw.js"; } catch { return true; }
}

/**
 * v1's offline block (index.html 11726-11740) for v2's much narrower worker (public/sw.js).
 * - `?nosw=1` unregisters the worker and clears the appu- caches (and registers nothing), then does it once more after 1.5 s as v1 did.
 * - A production build registers `/sw.js?v=<build>` at the root: the address changes with every deploy, so the browser installs the new worker, whose
 *   activate step deletes the previous build's cache (`version` is the deployed commit; empty means the dev build, "dev").
 * - A development build registers nothing and quietly removes a worker an earlier `next start` left on the same address, with its caches: a leftover
 *   worker would answer a development server's files from a production cache.
 * Does nothing without service worker support or off http(s).
 */
export async function setUpWorker(o: { production: boolean; version: string; search: string; protocol: string; nav: WorkerNav; caches?: CacheHost }): Promise<WorkerResult> {
  const sw = o.nav.serviceWorker;
  if (!sw || !/^https?:$/.test(o.protocol)) return "skipped";
  const wipe = async () => {
    await Promise.all((await sw.getRegistrations()).filter(isOurs).map((r) => r.unregister()));
    if (o.caches) await Promise.all((await o.caches.keys()).filter((k) => k.startsWith("appu-")).map((k) => o.caches!.delete(k)));
  };
  try {
    if (/[?&]nosw=1(&|$)/.test(o.search)) {
      await wipe();
      setTimeout(() => { void wipe().catch(() => {}); }, WIPE_AGAIN_MS);
      return "cleared";
    }
    if (!o.production) {
      await wipe();
      return "skipped";
    }
    await sw.register("/sw.js?v=" + encodeURIComponent(o.version || "dev"), { scope: "/", updateViaCache: "none" });
    return "registered";
  } catch {
    return "skipped";
  }
}

let started: Promise<WorkerResult> | null = null;
/** Sets the worker up once per page, after the page has loaded. Called from the always-on OfflineSlot. */
export function startWorker(): Promise<WorkerResult> {
  if (started) return started;
  started = new Promise<WorkerResult>((resolve) => {
    const go = () => resolve(setUpWorker({ production: process.env.NODE_ENV === "production", version: APP_VERSION, search: location.search, protocol: location.protocol, nav: navigator as WorkerNav, caches: window.caches }));
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  });
  return started;
}

// ---- the install offer ---------------------------------------------------------------------------------------------------------------------

export type InstallState = { offer: InstallEvent | null; installed: boolean };
const NONE: InstallState = { offer: null, installed: false };
let state: InstallState = NONE;
let watching = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/**
 * Keeps the browser's install offer (v1 11742-11743): remembered when it fires, forgotten once the app is installed. Safe to call again. It also runs
 * when this module loads, so an offer the browser makes while the page's scripts are still arriving is kept; one made before this script loads at all
 * is missed, and Help then shows the browser-menu line (D-C-83).
 */
export function startInstallWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state = { offer: e as InstallEvent, installed: false }; emit(); });
  window.addEventListener("appinstalled", () => { state = { offer: null, installed: true }; emit(); });
}
startInstallWatch();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

/** The remembered offer and whether the app has been installed since this page opened. */
export function installState(): InstallState {
  return state;
}

/** The remembered offer (null until the browser has made one) and whether the app has been installed since this page opened. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, installState, () => NONE);
}

/** Shows the browser's install prompt (v1 `installApp`), once; the offer is spent afterwards. */
export async function runInstall(): Promise<void> {
  const ev = state.offer;
  if (!ev) return;
  state = { ...state, offer: null };
  emit();
  try { await ev.prompt(); await ev.userChoice; } catch { /* the student closed it */ }
}
