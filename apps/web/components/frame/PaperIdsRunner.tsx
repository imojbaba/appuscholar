"use client";
import { useEffect, useRef } from "react";
import type { StoredEntry } from "@/lib/blobs/kinds";
import { useLibrary } from "@/lib/cite/useLibrary";
import { ensurePaperIds, type MigrationBlob, type PaperIdsState } from "@/lib/papers/migrate";
import { isPopout } from "@/lib/popout/mode";
import { useVault } from "@/lib/vault/useVault";
import { useProject } from "./ProjectContext";

/**
 * How long a place is kept waiting for the paper-id migration: after this the run is reported as busy (the place renders) and goes on by itself. A tab is never blocked for good.
 */
export const PAPER_IDS_WAIT_MS = 15_000;
/** How long the migration waits for the library to be read before it gives up for now. */
const LIBRARY_WAIT_MS = 12_000;
const POLL_MS = 40;

/** The projects this tab has migrated since its last lock (module scope: it outlives a project switch, as the title pass's flag does). */
const done = new Set<string>();
/** For tests: forget what this tab has migrated. */
export function resetPaperIdsRun(): void { done.clear(); }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Starts the paper-id migration (lib/papers/migrate; wave B Task 17, rulings B2-R4 to R6) from the project shell, once per project per unlock per tab: with the vault off, or
 * unlocked and complete, and never in a place's own window. It reads without asking for the passphrase. The library step goes through the shell's shared library client
 * (`useLibrary`), so a panel that is open sees the ids as soon as they are written. It tells the shell where it is (`onState`): "running" until its first answer, then the answer;
 * a locked vault is reported at once as "locked" and the unlock runs it, and a vault not ready (loading excepted) as "busy", so a place does not wait on a vault it cannot open.
 * Must be rendered inside CiteLibraryProvider.
 */
export function PaperIdsRunner({ onState }: { onState(projectId: string, state: PaperIdsState): void }) {
  const { projectId } = useProject();
  const vault = useVault();
  const vaultRef = useRef(vault);
  const library = useLibrary({ passive: true });
  const libraryRef = useRef(library);
  const onStateRef = useRef(onState);
  useEffect(() => { vaultRef.current = vault; libraryRef.current = library; onStateRef.current = onState; });

  const { status, complete } = vault;
  useEffect(() => {
    if (!projectId || isPopout()) return;
    const tell = (s: PaperIdsState) => onStateRef.current(projectId, s);
    if (status === "locked") { done.clear(); tell("locked"); return; }
    if (status === "loading") {
      // Not known yet whether the account has a vault (the api may be out of reach): a place waits a while, not for good.
      tell("running");
      const wait = setTimeout(() => tell("busy"), PAPER_IDS_WAIT_MS);
      return () => clearTimeout(wait);
    }
    if (!(status === "off" || (status === "unlocked" && complete))) { tell("busy"); return; }
    if (done.has(projectId)) { tell("done"); return; }

    tell("running");
    let settled = false;
    const cap = setTimeout(() => { if (!settled) tell("busy"); }, PAPER_IDS_WAIT_MS);
    // The library step, through the shell's shared client. The run is single-flight (a second call joins the first), so this effect running again joins it.
    const citations: MigrationBlob<StoredEntry[]> = {
      async read() {
        const until = Date.now() + LIBRARY_WAIT_MS;
        while (libraryRef.current.loading) {
          if (Date.now() >= until) return { out: "busy" };
          await sleep(POLL_MS);
        }
        const l = libraryRef.current;
        if (l.locked) return { out: "locked" };
        if (l.broken) return { out: "broken" };
        // A read that failed leaves `[]`, which is not an empty library: ids made from it would be made for papers the library has not been asked about.
        if (l.error) return { out: "busy" };
        return { out: "ok", value: l.lib };
      },
      async write(u) {
        // What the update last made is what was sent (a replay after a conflict makes it again).
        const made: { value?: StoredEntry[] } = {};
        if (!libraryRef.current.update((prev) => (made.value = u(prev)))) return { out: "busy" };
        const sent = await libraryRef.current.flush();
        if (sent && made.value) return { out: "ok", value: made.value };
        return { out: libraryRef.current.locked ? "locked" : "busy" };
      },
      close() {}
    };
    void ensurePaperIds(projectId, { vault: () => vaultRef.current, citations }).then((r) => r, () => "busy" as const).then((r) => {
      settled = true;
      clearTimeout(cap);
      if (r === "done") done.add(projectId);
      tell(r);
    });
    return () => clearTimeout(cap);
  }, [projectId, status, complete]);
  return null;
}
