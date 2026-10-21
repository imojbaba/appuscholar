/**
 * Blob values that could not reach the server before their panel went away (unmount, another project), kept for this tab by blob id until
 * they can be sent: when a panel for the same blob mounts (it adopts them before its first read, so they replay onto the loaded value),
 * when the vault unlocks (useVault calls drain), and when the browser comes back online. While anything is held, or a mounted panel has an
 * unsent value, leaving the page asks first. Memory only: the values are plaintext and never written to storage.
 */

/** A set() as it is queued: a plain value replaces what came before, an update transforms it. */
export type HeldOp<T = unknown> = { value: T } | { update: (prev: T | null) => T };

/** Sends the queued ops for one blob; answers the ops still not on the server (empty when done). */
export type HeldSender = (ops: HeldOp[]) => Promise<HeldOp[]>;

type Entry = { ops: HeldOp[]; send: HeldSender };

const entries = new Map<string, Entry>();
/** A blob's last save from a panel that is gone, or a drain, while it runs: a panel mounting for that blob waits for it. */
const busy = new Map<string, Promise<unknown>>();
/** Mounted clients holding a value not yet on the server, each with its flush (sends it now). */
const dirty = new Map<object, () => Promise<unknown>>();

/** Everything before the last plain value is replaced by it. */
export function compactOps<T>(ops: HeldOp<T>[]): HeldOp<T>[] {
  for (let i = ops.length - 1; i >= 0; i--) if ("value" in ops[i]!) return ops.slice(i);
  return ops;
}
/** The ops applied in order onto `base`. */
export function applyOps<T>(ops: HeldOp<T>[], base: T | null): T | null {
  return ops.reduce<T | null>((acc, op) => ("value" in op ? op.value : op.update(acc)), base);
}

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeunload", (e) => { if (shouldWarnOnUnloadBlobs()) e.preventDefault(); });
  window.addEventListener("online", () => { void heldBlobs.drain(); });
}

/** Leaving the page now would lose a blob value that never reached the server (held, unsent in a panel, or a last save still running). */
export function shouldWarnOnUnloadBlobs(): boolean {
  return entries.size > 0 || dirty.size > 0 || busy.size > 0;
}

export const heldBlobs = {
  get size() { return entries.size; },
  has: (id: string) => entries.has(id),
  /** The ops held for a blob (tests). */
  ops: (id: string): HeldOp[] | undefined => entries.get(id)?.ops,
  /** Keeps ops for a blob, after any already held for it (the newest plain value wins). */
  put(id: string, ops: HeldOp[], send: HeldSender) {
    if (ops.length === 0) return;
    const cur = entries.get(id);
    entries.set(id, { ops: compactOps([...(cur?.ops ?? []), ...ops]), send });
    listen();
  },
  /** Removes and answers what is held for a blob (a mounting panel adopts it). */
  take(id: string): HeldOp[] | null {
    const e = entries.get(id);
    if (!e) return null;
    entries.delete(id);
    return e.ops;
  },
  /** Marks a blob as busy until `p` settles. */
  track(id: string, p: Promise<unknown>) {
    const all = Promise.allSettled([busy.get(id), p]);
    busy.set(id, all);
    listen();
    void all.then(() => { if (busy.get(id) === all) busy.delete(id); });
  },
  /**
   * Runs `run` once every save tracked for the blob so far has settled, and tracks it, so a client mounting for the blob meanwhile waits for it
   * (a write made with no panel, such as the shelf's detached index write). `run` must not wait for idle(id) itself: it would wait for itself.
   */
  after<R>(id: string, run: () => Promise<R>): Promise<R> {
    const p = Promise.allSettled([busy.get(id)]).then(run);
    heldBlobs.track(id, p);
    return p;
  },
  /** Settles once no last save or drain runs for the blob. */
  async idle(id: string) {
    for (let p = busy.get(id); p; p = busy.get(id)) await p;
  },
  /** A mounted client holds (true) or no longer holds (false) a value not yet on the server; `flush` sends it now (saveAll). */
  markDirty(client: object, on: boolean, flush: () => Promise<unknown> = async () => {}) {
    if (on) { dirty.set(client, flush); listen(); } else dirty.delete(client);
  },
  /**
   * Sends what can go now (the project export, before it reads the server): everything held is drained, every mounted client's unsent value
   * is flushed, and every last save still running is waited for. What still cannot go stays as it was (shouldWarnOnUnloadBlobs says so).
   */
  async saveAll(): Promise<void> {
    await Promise.allSettled([heldBlobs.drain(), ...[...dirty.values()].map((f) => f())]);
    await Promise.allSettled([...busy.values()]);
  },
  /** Tries to send everything held. What still cannot go is kept, ahead of anything held for the same blob meanwhile. */
  async drain(): Promise<void> {
    await Promise.all([...entries.keys()].map(async (id) => {
      const e = entries.get(id);
      if (!e) return;
      entries.delete(id);
      const run = e.send(e.ops).catch(() => e.ops);
      heldBlobs.track(id, run);
      const left = await run;
      if (left.length === 0) return;
      const cur = entries.get(id);
      entries.set(id, { ops: compactOps([...left, ...(cur?.ops ?? [])]), send: cur?.send ?? e.send });
    }));
  },
  /** Tests only. */
  clear() { entries.clear(); busy.clear(); dirty.clear(); }
};
