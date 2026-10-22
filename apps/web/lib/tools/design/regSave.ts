import { regDone, type RegState } from "@appuscholar/core";
import type { DesignReg } from "@/lib/blobs/kinds/design";

/**
 * regCompute's store (5938): the four answers with `done` (core's regDone) and `savedAt` (ms), over the blob that was there (a field a later version
 * adds is kept). Here, not in the page, because it reads the clock.
 */
export function regSaved(prev: DesignReg | null, a: RegState): DesignReg {
  return { ...(prev ?? {}), type: a.type, pop: a.pop, bio: a.bio, multi: a.multi, done: regDone(), savedAt: Date.now() };
}
