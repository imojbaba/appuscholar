"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { emptyList, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { publishList } from "./store";

/*
 * The participant list's state (spec 2026-10-24-participants-design.md §5 "Vault" and §6; rulings R1, R16 and R17). One sealed blob, `participants`, one project's list.
 *
 * - It reads only once the vault is open ("unlocked" or "migrating"), as components/tools/qual/DocumentLayer.tsx does, so it never raises a passphrase prompt of its own: the blob is
 *   not even asked for (useProjectBlob gets no project) while the vault is locked, off or still loading.
 * - The vault off is its own state: the list is only ever stored sealed, so nothing is read and `save` refuses (the blob client refuses a plaintext save of this kind as well, SEALED_ONLY).
 * - `save` takes an update of the latest list, not a list: it runs inside the blob's set(prev => …) on the list as it is when the save lands, so a code is allocated from that list's `next`
 *   (addPerson / addPeople, lib/tools/participants/list.ts) and never from a copy the caller held earlier. Another window's save, or another hook's in this one, is rebased the same way.
 *   The update may run again (on a newer list after a conflict), so it must make the same change to any list it is given.
 * - Every read and every save is published to lib/tools/participants/store.ts (R1), because a second useProjectBlob in this window does not hear this one's saves.
 *   A hook that is still loading publishes nothing (it must not wipe what another published); locked, off and broken publish `null`.
 * - A list that does not open (`broken`) is not replaced unasked (R16): the first save asks with window.confirm, and a Yes lasts until the project changes. A read that failed is not known,
 *   so it reads as "loading" and `save` refuses.
 */

export type ParticipantsState = "loading" | "off" | "locked" | "broken" | "ready";
export type Participants = {
  /** The list, once it is read (an empty one, starting at P001, when none is stored yet); null in every other state. */
  list: ParticipantList | null;
  state: ParticipantsState;
  /**
   * Applies `update` to the latest list and saves the result (after the blob's debounce); the new list shows at once and is published to the store. False, and nothing changed, when
   * the list is not ready (loading, locked, off), the window may not write, or the list does not open and the student declined to replace it.
   */
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
};

/** `projectId` is "" when no project is open: nothing is read then. */
export function useParticipants(projectId: string): Participants {
  const t = useT();
  const { status } = useVault();
  const id = projectId === "" ? null : projectId;
  const open = status === "unlocked" || status === "migrating";
  const blob = useProjectBlob("participants", open ? id : null);
  const { value, loading, locked, broken, error, readOnly, set } = blob;

  let state: ParticipantsState;
  if (status === "off") state = "off";
  else if (status === "locked") state = "locked";
  else if (!open || id === null) state = "loading";
  else if (broken) state = "broken";
  else if (locked && value === null) state = "locked";
  else if (loading || (error && value === null)) state = "loading";
  else state = "ready";

  const none = useMemo(() => emptyList(), []);
  const list = state === "ready" ? (value ?? none) : null;

  useEffect(() => {
    if (id === null || state === "loading") return;
    publishList(id, list);
  }, [id, state, list]);

  const agreed = useRef(false);
  useEffect(() => { agreed.current = false; }, [projectId]);
  const save = useCallback((update: (prev: ParticipantList) => ParticipantList): boolean => {
    if (id === null || readOnly) return false;
    if (state === "broken") {
      if (!agreed.current) {
        if (!window.confirm(t("participants_broken_confirm"))) return false;
        agreed.current = true;
      }
    } else if (state !== "ready") return false;
    set((prev) => {
      const next = update(prev ?? emptyList());
      publishList(id, next);
      return next;
    });
    return true;
  }, [id, readOnly, state, set, t]);

  return { list, state, save };
}
