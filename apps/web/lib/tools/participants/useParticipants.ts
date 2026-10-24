"use client";
import { useCallback, useEffect, useMemo } from "react";
import { emptyList, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useVault } from "@/lib/vault/useVault";
import { publishList } from "./store";

/*
 * The participant list's state (spec 2026-10-24-participants-design.md §5 "Vault" and §6; rulings R1, R17, R20, R21 and R22). One sealed blob, `participants`, one project's list.
 *
 * - It reads only once the vault is open ("unlocked" or "migrating"), as components/tools/qual/DocumentLayer.tsx does, so it never raises a passphrase prompt of its own: the blob is
 *   not even asked for (useProjectBlob gets no project) while the vault is locked, off or still loading.
 * - The vault off is its own state: the list is only ever stored sealed, so nothing is read and `save` refuses (the blob client refuses a plaintext save of this kind as well, SEALED_ONLY).
 * - `save` takes an update of the latest list, not a list: it runs inside the blob's set(prev => …) on the list as it is when the save lands, so a code is allocated from that list's `next`
 *   (addPerson / addPeople, lib/tools/participants/list.ts) and never from a copy the caller held earlier. Another window's save, or another hook's in this one, is rebased the same way.
 *   The update may run again (on a newer list after a conflict), so it must make the same change to any list it is given. `save` is accepted only in "ready".
 * - Whenever the blob delivers a value (a read, a save set here, a save the server accepted) it is published to lib/tools/participants/store.ts with the blob's version (R22), because a
 *   second useProjectBlob in this window does not hear this one's saves; the store keeps the newest version. Nothing is published from inside the update. A hook that is still loading or
 *   in error publishes nothing (it must not wipe what another published); locked, off and broken publish `null`.
 * - A read that failed is "error", not "loading" (R20): there is no list and `save` refuses, so nothing is written over a list that is only out of reach; `retry` reads again.
 * - A list that does not open ("broken") is never replaced from here (R21): `save` returns false and the hook asks nothing and shows nothing; the tab says so.
 * - `saveFailed` (R24): the list is known and the blob reports an error, so the last save did not land (the list shown is the student's, held, and goes with the next change, flush or unlock).
 *   A failed read is not this ("error" state, no list); neither is a refused save with the vault off ("off").
 */

export type ParticipantsState = "loading" | "off" | "locked" | "broken" | "error" | "ready";
export type Participants = {
  /** The list, once it is read (an empty one, starting at P001, when none is stored yet); null in every other state. */
  list: ParticipantList | null;
  state: ParticipantsState;
  /** True in "ready" while the blob reports an error with the list held: the last save did not land. The tab says "Not saved yet" (R24). */
  saveFailed: boolean;
  /** True when this window may not write the list (a pop-out of another stage, lib/popout/mode.ts): `save` refuses, and the tab says where the list can be changed. */
  readOnly: boolean;
  /**
   * Applies `update` to the latest list and saves the result (after the blob's debounce); the new list shows at once. False, and nothing changed, in every state but "ready"
   * (loading, locked, off, broken, error) and when the window may not write.
   */
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  /** After a failed read ("error"): reads the list again. It changes nothing in any other state. */
  retry(): void;
};

/** `projectId` is "" when no project is open: nothing is read then. */
export function useParticipants(projectId: string): Participants {
  const { status } = useVault();
  const id = projectId === "" ? null : projectId;
  const open = status === "unlocked" || status === "migrating";
  const blob = useProjectBlob("participants", open ? id : null);
  const { value, loading, locked, broken, error, version, readOnly, set, flush } = blob;

  let state: ParticipantsState;
  if (status === "off") state = "off";
  else if (status === "locked") state = "locked";
  else if (!open || id === null) state = "loading";
  else if (broken) state = "broken";
  else if (locked && value === null) state = "locked";
  else if (loading) state = "loading";
  else if (error && value === null) state = "error";
  else state = "ready";

  const none = useMemo(() => emptyList(), []);
  const list = state === "ready" ? (value ?? none) : null;
  const saveFailed = state === "ready" && error === true && value !== null;

  useEffect(() => {
    if (id === null || state === "loading" || state === "error") return;
    publishList(id, list, state === "ready" ? version : undefined);
  }, [id, state, list, version]);

  const save = useCallback((update: (prev: ParticipantList) => ParticipantList): boolean => {
    if (id === null || readOnly || state !== "ready") return false;
    set((prev) => update(prev ?? emptyList()));
    return true;
  }, [id, readOnly, state, set]);

  // flush reads the blob if it is not known yet (a failed read leaves it so), then sends what is pending; with the list read there is nothing more to do.
  const retry = useCallback(() => { if (state === "error") void flush(); }, [state, flush]);

  return { list, state, saveFailed, readOnly, save, retry };
}
