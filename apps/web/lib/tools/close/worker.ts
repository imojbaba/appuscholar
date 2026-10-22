import { clCompare, type ClResult, type ClSource } from "@appuscholar/core/src/closeness";

/*
 * The comparison's Web Worker (Review focus 4): clCompare over a long document and many papers runs here, so typing and scrolling stay free. It imports the closeness module only, not the
 * whole core barrel. `answer` is the pure part (a job in, an answer out); the message handler is installed only inside a worker.
 */

export type CompareJob = { id: number; text: string; sources: ClSource[]; k: number; minRun: number };
export type CompareReply = { id: number; result?: ClResult; error?: string };

export function answer(job: CompareJob): CompareReply {
  try { return { id: job.id, result: clCompare(job.text, job.sources, job.k, job.minRun) }; } catch (e) { return { id: job.id, error: e instanceof Error ? e.message : String(e) }; }
}

const scope = globalThis as unknown as { WorkerGlobalScope?: unknown; onmessage: ((e: { data: CompareJob }) => void) | null; postMessage(m: CompareReply): void };
if (typeof scope.WorkerGlobalScope !== "undefined" && globalThis instanceof (scope.WorkerGlobalScope as new () => object)) {
  scope.onmessage = (e) => scope.postMessage(answer(e.data));
}
