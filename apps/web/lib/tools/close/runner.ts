import { clCompare, type ClResult, type ClSource } from "@appuscholar/core";
import type { CompareJob, CompareReply } from "./worker";

/*
 * Runs clCompare off the page's thread. One worker is made at the first run and kept until dispose(). With no Worker (jsdom, tests), when one cannot be made, or when the worker fails, the same
 * clCompare runs on the main thread after a tick, so the "Checking…" state is drawn first. A run is never lost to a missing worker.
 */
export type CloseRunner = {
  run(text: string, sources: ClSource[], k: number, minRun: number): Promise<ClResult>;
  dispose(): void;
};

type Pending = { job: CompareJob; resolve(r: ClResult): void; reject(e: Error): void };

/** The same comparison on the main thread, one tick later. */
const onMainThread = (j: CompareJob): Promise<ClResult> => new Promise((res, rej) => { setTimeout(() => { try { res(clCompare(j.text, j.sources, j.k, j.minRun)); } catch (e) { rej(e instanceof Error ? e : new Error(String(e))); } }, 0); });

export function createRunner(): CloseRunner {
  let worker: Worker | null = null;
  let broken = false;
  let next = 0;
  const pending = new Map<number, Pending>();

  const fallBack = () => {
    broken = true;
    worker?.terminate();
    worker = null;
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) onMainThread(p.job).then(p.resolve, p.reject);
  };
  const open = (): Worker | null => {
    if (broken || typeof Worker === "undefined") return null;
    if (worker) return worker;
    try {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<CompareReply>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.result) p.resolve(e.data.result); else p.reject(new Error(e.data.error ?? "failed"));
      };
      w.onerror = () => fallBack();
      worker = w;
      return w;
    } catch { broken = true; return null; }
  };

  return {
    run(text, sources, k, minRun) {
      const job: CompareJob = { id: ++next, text, sources, k, minRun };
      const w = open();
      if (!w) return onMainThread(job);
      return new Promise<ClResult>((resolve, reject) => {
        pending.set(job.id, { job, resolve, reject });
        try { w.postMessage(job); } catch { fallBack(); }
      });
    },
    dispose() { worker?.terminate(); worker = null; pending.clear(); }
  };
}
