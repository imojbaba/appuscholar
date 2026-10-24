// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { StoredEntry } from "../lib/blobs/kinds";
import { ApiError } from "../lib/api";
import { createBlobClient, type BlobVault, type BlobWire, type ProjectBlobState } from "../lib/blobs/useProjectBlob";
import { undoKeepSettled, type KeepDeps } from "../lib/papers/keep";

/*
 * Undo's save against the real blob client (createBlobClient) and a server that keeps a version: the claim of undoKeepSettled is that a "removed" is said only once the save has
 * gone, and that a save refused because another window saved first is replayed by the client onto the newer library, where the update finds the entry changed. The unit tests of
 * keep.ts replay by hand; here the client does it.
 */

const ADDED: StoredEntry = { author: "Smith, J.", year: "2020", title: "Sleep duration and exam anxiety in first-year students", source: "Sleep Health", volume: "", issue: "", pages: "", doi: "10.1000/sleep.1", url: "", type: "Journal article", style: "apa", pid: "kundo003", rl: true };

/** A server with one blob and its version, and the library client the page would hold, shown through KeepDeps. */
function setup(start: StoredEntry[]) {
  const server = { value: start as StoredEntry[], version: 1, puts: 0 };
  const wire = (): BlobWire => ({ kind: "citations", body: JSON.stringify(server.value), keyVersion: 0, deks: [], updatedAt: "2026-10-24T00:00:00.000Z", version: server.version });
  const vault: BlobVault = { known: async () => "off", ensureUnlocked: async () => false, encryptBody: async () => { throw new Error("vault is off"); }, decryptBody: async (d) => d.bodyHtml };
  const shown: { s: ProjectBlobState<StoredEntry[]> } = { s: { value: null, loading: true, locked: false } };
  const client = createBlobClient<StoredEntry[]>({
    id: "p/citations",
    parse: (json) => JSON.parse(json) as StoredEntry[],
    get: async () => wire(),
    put: async (body, ifMatch) => {
      if (ifMatch !== server.version) throw new ApiError(409, "version-conflict");
      server.value = JSON.parse(body.body) as StoredEntry[];
      server.version++;
      server.puts++;
      return wire();
    },
    vault: () => vault,
    delayMs: 60_000,
    onState: (s) => { shown.s = s; }
  });
  const deps = (): KeepDeps & { flush(): Promise<boolean> } => ({
    lib: shown.s.value ?? [], ready: true, loading: false, locked: false, broken: false, error: false,
    update: (fn) => { client.set((prev) => fn(prev ?? [])); return true; },
    flush: () => client.flush()
  });
  return { server, client, shown, deps };
}

describe("undoKeepSettled against the blob client", () => {
  it("says removed once the save has gone, and the server no longer has the paper", async () => {
    const { server, client, deps } = setup([ADDED]);
    await client.flush();
    expect(await undoKeepSettled(ADDED, deps())).toBe("removed");
    expect(server.value).toEqual([]);
  });

  it("says changed when another window edited the entry first: the save is refused, the client replays Undo onto the newer library, and the paper stays", async () => {
    const { server, client, deps } = setup([ADDED]);
    await client.flush();
    const edited: StoredEntry = { ...ADDED, pages: "13317-1" };
    server.value = [edited];
    server.version++; // the other window's save
    expect(await undoKeepSettled(ADDED, deps())).toBe("changed");
    expect(server.value).toEqual([edited]);
  });

  it("says changed when another window kept the same paper first under its own id", async () => {
    const { server, client, deps } = setup([ADDED]);
    await client.flush();
    const theirs: StoredEntry = { ...ADDED, pid: "kwindow3" };
    server.value = [theirs];
    server.version++;
    expect(await undoKeepSettled(ADDED, deps())).toBe("changed");
    expect(server.value).toEqual([theirs]);
  });
});
