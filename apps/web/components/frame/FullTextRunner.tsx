"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useLibrary } from "@/lib/cite/useLibrary";
import { fullText, type FullTextSide } from "@/lib/papers/fullText";
import { libraryRead } from "@/lib/papers/keep";
import { quiet } from "@/lib/papers/migrate";
import { isPopout } from "@/lib/popout/mode";
import { deletePaperBlob, mountedShelfOps, putNewPaper, readIndexOnce, readPaperOnce, writeIndexDetached } from "@/lib/shelf/useShelf";
import { useVault } from "@/lib/vault/useVault";
import { useProject } from "./ProjectContext";

/**
 * Hands the open project's library and reading list to the full-text queue (lib/papers/fullText; wave B Task 21b, register row D-S2-127; OJ's answer 2), which fetches the open-access text
 * of kept papers from Europe PMC one at a time. Mounted by the project shell next to the paper-id runner, inside the shared library, and never in a place's own window. The queue works only
 * while the vault is off or unlocked and complete (the same gate as the paper-id migration), so a locked vault waits for its unlock and nothing here ever asks for the passphrase: the
 * reads and writes go through a vault that does not ask (migrate.ts `quiet`). It reads the library the shell holds, passively, so a paper kept in Find is seen as soon as the library has it,
 * and it writes the reading list through the open Reading list's own store when one is open (so the list shows the new text at once), else through a headless client. Draws nothing.
 */
export function FullTextRunner() {
  const { projectId } = useProject();
  const vault = useVault();
  const t = useT();
  const library = useLibrary({ passive: true });
  const live = useRef({ vault, library, t });
  useEffect(() => { live.current = { vault, library, t }; });

  useEffect(() => {
    if (!projectId || isPopout()) return;
    /** The reading list as the queue writes it: the open list's store when there is one, else a client of its own. */
    const shelf = (): FullTextSide => {
      const vaultNow = () => quiet(live.current.vault);
      const mounted = mountedShelfOps(projectId);
      return {
        index: () => readIndexOnce(projectId, vaultNow()),
        readPaper: (id) => readPaperOnce(projectId, id, vaultNow()),
        createPaper: (id, paper) => putNewPaper(projectId, id, paper, vaultNow(), live.current.t),
        updateIndex: mounted ? mounted.updateIndex : (u) => { writeIndexDetached(projectId, u, vaultNow); return true; },
        deletePaper: mounted ? mounted.deletePaper : (id) => deletePaperBlob(projectId, id)
      };
    };
    return fullText.attach({
      projectId,
      open: () => {
        const v = live.current.vault;
        return !isPopout() && (v.status === "off" || (v.status === "unlocked" && v.complete));
      },
      library: () => (libraryRead(live.current.library) ? live.current.library.lib : null),
      updateLibrary: (fn) => live.current.library.update(fn),
      shelf
    });
  }, [projectId]);

  // Whatever decides whether a paper may be asked for now: the vault opening, the library being read, a paper joining it (or getting its pid from the paper-id migration).
  const { status, complete } = vault;
  const { lib, loading, locked, broken, error, ready } = library;
  useEffect(() => { fullText.poke(); }, [status, complete, lib, loading, locked, broken, error, ready]);
  return null;
}
