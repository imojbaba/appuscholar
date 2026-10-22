"use client";
import { useEffect } from "react";
import { useVault } from "@/lib/vault/useVault";
import { clearCurrentStyle } from "@/lib/tools/style/current";
import { useStyleData } from "@/lib/tools/style/useStyleData";

/**
 * What My style draws over the document: nothing to see. It keeps the module-level style snapshot (lib/tools/style/current.ts) current for the open
 * project, so Continue, Improve and Extend (lib/ai/actions.ts) carry the profile when "Use my style in suggestions" is on (ledger ruling R3: the
 * writing buttons build their request from deps they are given, and the style block is not one of them). It reads the project's style blobs once the
 * vault is open and never asks for the passphrase itself, and clears the snapshot when the project goes away, the vault locks or a blob does not open.
 */
export function DocumentLayer({ projectId }: { projectId: string }) {
  const { status } = useVault();
  const open = status === "off" || status === "unlocked" || status === "migrating";
  const id = open && projectId ? projectId : null;
  useStyleData(id);
  useEffect(() => {
    if (id === null && projectId) clearCurrentStyle(projectId);
    return () => { if (projectId) clearCurrentStyle(projectId); };
  }, [id, projectId]);
  return null;
}
