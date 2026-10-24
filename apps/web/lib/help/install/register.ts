"use client";
import { useSyncExternalStore } from "react";

/** What a browser hands over when the app can be installed (not in lib.dom). */
export type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

type WorkerNav = { serviceWorker?: { register(url: string, o: { scope: string; updateViaCache: "none" }): Promise<unknown>; getRegistrations(): Promise<{ unregister(): Promise<boolean> }[]> } };
type CacheHost = { keys(): Promise<string[]>; delete(k: string): Promise<boolean> };
export type WorkerResult = "registered" | "cleared" | "skipped";

/**
 * v1's offline block (index.html 11726-11740) for v2's much narrower worker (public/sw.js). `?nosw=1` unregisters the worker and clears the
 * appu- caches (and registers nothing); otherwise /sw.js is registered at the root, in a production build only (a development server's files
 * are not hashed). Does nothing without service worker support or off http(s).
 */
export async function setUpWorker(o: { production: boolean; search: string; protocol: string; nav: WorkerNav; caches?: CacheHost }): Promise<WorkerResult> {
  const sw = o.nav.serviceWorker;
  if (!sw || !/^https?:$/.test(o.protocol)) return "skipped";
  try {
    if (/[?&]nosw=1(&|$)/.test(o.search)) {
      await Promise.all((await sw.getRegistrations()).map((r) => r.unregister()));
      if (o.caches) await Promise.all((await o.caches.keys()).filter((k) => k.startsWith("appu-")).map((k) => o.caches!.delete(k)));
      return "cleared";
    }
    if (!o.production) return "skipped";
    await sw.register("/sw.js", { scope: "/", updateViaCache: "none" });
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
    const go = () => resolve(setUpWorker({ production: process.env.NODE_ENV === "production", search: location.search, protocol: location.protocol, nav: navigator as WorkerNav, caches: window.caches }));
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

/** Keeps the browser's install offer (v1 11742-11743): remembered when it fires, forgotten once the app is installed. Safe to call again. */
export function startInstallWatch(): void {
  if (watching) return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state = { offer: e as InstallEvent, installed: false }; emit(); });
  window.addEventListener("appinstalled", () => { state = { offer: null, installed: true }; emit(); });
}

/** The remembered offer (null until the browser has made one) and whether the app has been installed since this page opened. */
export function useInstallState(): InstallState {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => state, () => NONE);
}

/** Shows the browser's install prompt (v1 `installApp`), once; the offer is spent afterwards. */
export async function runInstall(): Promise<void> {
  const ev = state.offer;
  if (!ev) return;
  state = { ...state, offer: null };
  emit();
  try { await ev.prompt(); await ev.userChoice; } catch { /* the student closed it */ }
}
