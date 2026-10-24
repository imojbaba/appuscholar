import { apiFetch } from "@/lib/api";
import { shelfPaperKind, type ApNotes, type BlobKind, type BlobShape, type ShelfIndex, type StoredEntry } from "@/lib/blobs/kinds";
import { projectBlobClient, type BlobVault, type ProjectBlobState } from "@/lib/blobs/useProjectBlob";
import { stageStates } from "@/lib/frame/stages";
import type { ProjectWork } from "@/lib/frame/useProjectWork";
import { isPopout } from "@/lib/popout/mode";
import type { VaultValue } from "@/lib/vault/useVault";
import { cellsToNotes, linkShelf, noteKey, rekeyNotes, withPids } from "./ids";

/*
 * The client migration that gives every stored paper an id (wave B, Task 17). It runs in the browser, because the blobs are sealed under the vault and the server cannot
 * read them: the library, then the reading list, then the matrix cells, then the notes. It is resumable (each step is its own write, and a run that stopped after one is
 * finished by the next), idempotent (a run that finds nothing to do sends no PUT, and reads no reading-list paper once the notes carry their cells), and non-destructive (every
 * field of an entry stays, an old note stays with `movedTo`, the shelf's cells stay where they were). Every blob is read and written through the versioned blob client, so a
 * sealed blob stays sealed, a plain one stays plain, and a write that loses to another device (409) is read again and replayed. It never asks for the passphrase and never uses
 * the vault's /rewrite routes.
 */

/** What a run answers. "busy": it could not finish now (the vault is loading or migrating, a save kept losing to another window, the network, a place's own window): try again later. */
export type PaperIdsResult = "done" | "locked" | "broken" | "busy";
/** What the project shell tells the places: the answer of the run, or "running" while it is under way. */
export type PaperIdsState = PaperIdsResult | "running";
type Stop = Exclude<PaperIdsResult, "done">;

/** The vault as the blob client uses it, with what the run's gate reads. */
export type PaperVault = BlobVault & Pick<VaultValue, "status" | "complete">;

/** One blob as the migration sees it: read once, and written at most once, as an update of what is stored (so a replay after a 409 lands on the newer value). */
export type MigrationBlob<T> = {
  read(): Promise<{ out: "ok"; value: T | null } | { out: Stop }>;
  /** The update is applied to the stored value and sent now; `value` is what was sent last (after any replay). */
  write(u: (prev: T | null) => T): Promise<{ out: "ok"; value: T } | { out: Stop }>;
  close(): void;
};

/** Literature's Ready mark, which the migration's own writes must not undo (ruling B2-R8). */
export type LitStage = {
  isReady(projectId: string): Promise<boolean>;
  markReady(projectId: string): Promise<void>;
};

export type PaperMigrateDeps = {
  /** The newest vault, read at each use. */
  vault: () => PaperVault;
  /** The library blob. The project shell passes its shared library client, so the panels that are open see the ids; without it the migration opens a client of its own. */
  citations?: MigrationBlob<StoredEntry[]>;
  /** Literature's Ready mark; the api's by default. */
  stage?: LitStage;
};

/** The vault that never asks: the run starts only when it is open, and a lock meanwhile is an answer ("locked"), not a prompt. */
export const quiet = (v: BlobVault): BlobVault => ({
  known: (recheck) => v.known(recheck),
  ensureUnlocked: async () => false,
  encryptBody: (doc, html) => v.encryptBody(doc, html),
  decryptBody: (doc) => v.decryptBody(doc)
});

/**
 * A blob through a blob client of the migration's own. A blob that can be written is first read with flush() and not start(): start() takes what a panel left held for the blob,
 * and abandon() (when the run is over) forgets what is still unsent, so a write that did not go is never kept to be sent by itself. A blob that is only read (a reading-list paper)
 * uses start() as every reader does and is disposed of.
 */
function ownBlob<K extends BlobKind>(kind: K, projectId: string, vault: () => BlobVault, readOnly = false): MigrationBlob<BlobShape<K>> {
  type T = BlobShape<K>;
  const seen: { s: ProjectBlobState<T> | null } = { s: null };
  const c = projectBlobClient(kind, projectId, vault, (s) => { seen.s = s; }, { readOnly });
  const stop = (): Stop | null => {
    const s = seen.s;
    return s === null ? "busy" : s.locked ? "locked" : s.broken ? "broken" : s.error ? "busy" : null;
  };
  return {
    async read() {
      await (readOnly ? c.start() : c.flush());
      const why = stop();
      return why ? { out: why } : { out: "ok", value: seen.s!.value };
    },
    async write(u) {
      // What the update last made is what was sent (a replay after a conflict makes it again).
      const made: { value?: T } = {};
      c.set((prev: T | null) => (made.value = u(prev)));
      const sent = await c.flush();
      const why = sent ? null : stop() ?? "busy";
      return why ? { out: why } : { out: "ok", value: made.value as T };
    },
    close() { if (readOnly) c.dispose(); else c.abandon(); }
  };
}

/** The api's answer to "is Literature Ready now" (the stage states come from `GET /projects?include=work`) and the stamp (the server's clock, no body). */
const apiStage: LitStage = {
  async isReady(projectId) {
    const all = await apiFetch<ProjectWork[]>("/projects?include=work");
    const p = all.find((x) => x.id === projectId);
    return !!p && stageStates({ blobs: p.blobs, draftWords: p.draftWords, draftEditedAt: p.draftEditedAt, stageMarks: p.stageMarks }).lit === "ready";
  },
  async markReady(projectId) { await apiFetch(`/projects/${projectId}/stages/lit/ready`, { method: "POST" }); }
};

/** Whether the run may start: the vault off, or unlocked and complete. A locked vault is "locked"; one still loading, migrating or incomplete is "busy" (the title pass's gate). */
function gate(v: PaperVault): "open" | Stop {
  if (v.status === "off") return "open";
  if (v.status === "unlocked") return v.complete ? "open" : "busy";
  return v.status === "locked" ? "locked" : "busy";
}

/** The papers the notes can be moved to: the reading list's and the library's, each with its pid and title. */
const paperRefs = (index: ShelfIndex, lib: StoredEntry[]): Array<{ pid: string; title: string }> => [
  ...index.flatMap((e) => (e.pid ? [{ pid: e.pid, title: e.title }] : [])),
  ...lib.flatMap((e) => (e.pid && e.title ? [{ pid: e.pid, title: e.title }] : []))
];

const running = new Map<string, Promise<PaperIdsResult>>();

/**
 * Gives every library entry and reading-list paper of the project its pid and moves the old notes and the matrix cells to `p:<pid>`, in that order, each step a write of its
 * own blob. Answers "done" when nothing is left to do; "locked" when the vault is locked (nothing is read, nothing asked) or locks meanwhile; "broken" when a blob does not
 * open or is not of its shape (it, and every blob after it, is left unwritten; a reading-list paper that does not open is the one exception: it is skipped, its note gets no
 * cells so a later run tries it again, the rest is done, and the answer is "broken"); "busy" when it could not finish now. Two calls for one project at once are one run. Never in a
 * place's own window.
 */
export function ensurePaperIds(projectId: string, d: PaperMigrateDeps): Promise<PaperIdsResult> {
  if (isPopout()) return Promise.resolve("busy");
  const open = gate(d.vault());
  if (open !== "open") return Promise.resolve(open);
  const going = running.get(projectId);
  if (going) return going;
  const run = migrate(projectId, d).finally(() => { running.delete(projectId); });
  running.set(projectId, run);
  return run;
}

async function migrate(projectId: string, d: PaperMigrateDeps): Promise<PaperIdsResult> {
  const vault = () => quiet(d.vault());
  const stage = d.stage ?? apiStage;
  const opened: Array<{ close(): void }> = [];
  const own = <K extends BlobKind>(kind: K, readOnly = false): MigrationBlob<BlobShape<K>> => {
    const b = ownBlob(kind, projectId, vault, readOnly);
    opened.push(b);
    return b;
  };
  /** Whether Literature was Ready (and not reopened) before the run's first write, asked once. */
  let wasReady: boolean | null = null;
  const write = async <T,>(b: MigrationBlob<T>, u: (prev: T | null) => T) => {
    if (wasReady === null) {
      // Before the first write moves the blob's time: a stage that cannot be asked about is not written over.
      try { wasReady = await stage.isReady(projectId); } catch { return { out: "busy" } as const; }
    }
    const w = await b.write(u);
    // The migration's writes are not the student's work: a stage that was Ready stays Ready, stamped again with the server's clock (never this device's) right after each write
    // that went (ruling B2-R32), so a tab closed between two steps leaves nothing reopened. A write that was refused or failed is not stamped for.
    if (w.out === "ok" && wasReady) await stage.markReady(projectId).catch(() => undefined);
    return w;
  };
  try {
    // 1. The library: every entry gets its pid.
    const citations = d.citations ?? own("citations");
    const c = await citations.read();
    if (c.out !== "ok") return c.out;
    let lib = c.value ?? [];
    if (lib.some((e) => !e.pid)) {
      const w = await write(citations, (prev) => withPids(prev ?? []));
      if (w.out !== "ok") return w.out;
      lib = w.value;
    }

    // 2. The reading list: each paper takes the pid of the library entry it is (the DOI, then the title), else its own.
    const shelf = own("shelf_index");
    const s = await shelf.read();
    if (s.out !== "ok") return s.out;
    let index = s.value ?? [];
    if (index.some((e) => !e.pid)) {
      const w = await write(shelf, (prev) => linkShelf(prev ?? [], lib));
      if (w.out !== "ok") return w.out;
      index = w.value;
    }

    // 3. The notes: the old ones move to their paper; each reading-list paper's matrix cells are copied to its note once. Only a paper whose note has no cells yet is read.
    const notes = own("ap_notes");
    const n = await notes.read();
    if (n.out !== "ok") return n.out;
    const stored: ApNotes = n.value ?? {};
    const papers = paperRefs(index, lib);
    const moved = rekeyNotes(stored, papers);
    const cells: Array<{ pid: string; title: string; cells: Record<string, string> }> = [];
    const asked = new Set<string>();
    let unreadable = false;
    for (const e of index) {
      if (!e.pid || asked.has(e.pid) || moved[noteKey(e.pid)]?.cells !== undefined) continue;
      asked.add(e.pid);
      // One reading-list paper at a time. A paper whose blob is gone has no cells. One that does not open is skipped (ruling B2-R32): its note gets no cells, so a later run tries it
      // again, and the other papers go on; the answer is then "broken". One that is locked or cannot be read now stops the run.
      const paper = own(shelfPaperKind(e.id), true);
      const r = await paper.read();
      paper.close();
      if (r.out === "broken") { unreadable = true; continue; }
      if (r.out !== "ok") return r.out;
      cells.push({ pid: e.pid, title: e.title, cells: r.value?.cells ?? {} });
    }
    if (moved !== stored || cells.length > 0) {
      const w = await write(notes, (prev) => cellsToNotes(rekeyNotes(prev ?? {}, papers), cells));
      if (w.out !== "ok") return w.out;
    }
    return unreadable ? "broken" : "done";
  } finally {
    for (const b of opened) b.close();
  }
}
