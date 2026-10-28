import { apiFetch } from "@/lib/api";
import { newDocumentBody } from "@/lib/useAutosave";
import { isPopout } from "@/lib/popout/mode";
import type { VaultValue } from "@/lib/vault/useVault";
import type { DocumentSummary, DocumentWithBody } from "@/components/frame/ProjectContext";

/**
 * The project's documents, or its first one made now when it has none (the shell on open, and first run's "Save as my project"). `firstTitle` is that
 * document's title, in the page's language as it is when the document is made (`doc_first_title`); the title is stored, so it does not follow a later change of language.
 */
export async function listOrSeed(projectId: string, vault: VaultValue, firstTitle: string): Promise<DocumentSummary[]> {
  const list = await apiFetch<DocumentSummary[]>(`/projects/${projectId}/documents`);
  // A place's own window reads the list only (the Citation Manager's "Cited in"): it never creates a document (D-S2-43).
  if (list.length || isPopout()) return list;
  // A project always has a document to write in (v1 always had one); with a vault its empty body is encrypted from the start.
  // Its title is sealed with it, under the same first key.
  const body = await newDocumentBody(vault, firstTitle);
  // The unlock was cancelled: no document yet, and New in the document bar can make one later.
  if (!body) return [];
  const made = await apiFetch<DocumentWithBody>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify(body) });
  return [made];
}
