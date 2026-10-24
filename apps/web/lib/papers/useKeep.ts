"use client";
import { useCallback, useEffect, useRef } from "react";
import { useLibrary, type Library } from "@/lib/cite/useLibrary";
import { libraryRead } from "./keep";

/**
 * Keeping needs a library that has been read (lib/papers/keep.ts). `keepWhenRead(job)` runs `job` with the library once it has been read, and answers what the job
 * answered; or null when the library cannot be read now, with nothing kept: it is broken (does not open on this device), it failed to read (the press asks for the
 * read again, and the student presses Keep once more), or the tab went away first. A library that is loading or locked is waited for: the press stays queued and the
 * job runs when the read lands (a locked vault asks for the passphrase through the library's flush, once). Used by the Find tab; the paste box (Task 19) and the
 * adding screen (Task 20) keep the same way. `current()` is the library as the newest render has it: what a press that is answered later (null, after a wait) needs
 * to say why, since the `library` of the render it was made in is old by then.
 */
export function useKeep(): { library: Library; current(): Library; keepWhenRead<R>(job: (library: Library) => R): Promise<R | null> } {
  const library = useLibrary();
  const latest = useRef(library);
  const queue = useRef<Array<{ run(l: Library): void; drop(): void }>>([]);

  useEffect(() => {
    latest.current = library;
    if (libraryRead(library)) for (const q of queue.current.splice(0)) q.run(library);
    else if (library.broken || library.error) for (const q of queue.current.splice(0)) q.drop();
  });
  useEffect(() => () => { for (const q of queue.current.splice(0)) q.drop(); }, []);

  const keepWhenRead = useCallback(<R,>(job: (l: Library) => R): Promise<R | null> => new Promise<R | null>((resolve, reject) => {
    const l = latest.current;
    const go = (x: Library) => { try { resolve(job(x)); } catch (e) { reject(e); } };
    if (libraryRead(l)) { go(l); return; }
    // Broken: no read will come. Failed: ask for the read again; this press keeps nothing.
    if (l.broken || l.error) { if (l.error) void l.flush(); resolve(null); return; }
    queue.current.push({ run: go, drop: () => resolve(null) });
    void l.flush();
  }), []);

  const current = useCallback(() => latest.current, []);

  return { library, current, keepWhenRead };
}
