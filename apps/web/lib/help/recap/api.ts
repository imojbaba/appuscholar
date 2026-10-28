import { ApiError, apiFetch } from "@/lib/api";
import { blobId, parseBlob } from "@/lib/blobs/kinds";
import { blobPath, type BlobWire } from "@/lib/blobs/useProjectBlob";
import type { DocumentWithBody, ProjectValue } from "@/components/frame/ProjectContext";
import { openTitle, projectKeyId, type Titled } from "@/lib/vault/titles";
import type { VaultValue } from "@/lib/vault/useVault";
import { firstWords, type RecapApi } from "./facts";
import { lastAnswer } from "./gap";

/** How many words of the last document the recap quotes. */
const QUOTE_WORDS = 25;

/** What the readers are made from: the shell's loaded project, the vault's state and the day the last visit was. */
export type RecapSource = {
  uid: string;
  since: number;
  now: number;
  loadedAt: number;
  /** The student turned the AI log off (a setting). */
  aiLogOff: boolean;
  vault: Pick<VaultValue, "status" | "decryptBody">;
  shell: Pick<ProjectValue, "project" | "projectId" | "documents" | "currentDoc" | "wordCount">;
};

/** A title opened through the vault, or null while it is locked or does not open. Never the ciphertext. */
async function plainTitle(vault: RecapSource["vault"], t: Titled, keyId: string): Promise<string | null> {
  try {
    const o = await openTitle(vault, t, keyId);
    return o.state === "open" ? o.text : null;
  } catch { return null; }
}

/**
 * The readers the recap's facts are made from (facts.ts RecapApi), over what the shell already holds and three reads of the account. Nothing here
 * prompts for the passphrase: with the vault locked, titles read as locked, the test record and document text are not fetched at all.
 */
export async function buildRecapApi(s: RecapSource): Promise<RecapApi> {
  const { shell, vault } = s;
  const vaultOpen = vault.status === "off" || vault.status === "unlocked";
  const project = shell.project;
  const pid = shell.projectId;

  const openDoc = shell.currentDoc
    ? { title: await plainTitle(vault, shell.currentDoc, shell.currentDoc.id), words: shell.wordCount ?? shell.currentDoc.wordCount }
    : null;

  return {
    since: s.since,
    now: s.now,
    loadedAt: s.loadedAt,
    // The log is kept by project, and a call in the scratch space carries none, so only an open project has a log to count.
    aiCountable: !s.aiLogOff && project !== null,
    vaultOpen,
    // Only the title: v2 reads no single stage of a project (stages are places with their own states), so none is stated.
    project: project ? { name: await plainTitle(vault, project, projectKeyId(project.id)) } : null,
    openDoc,
    documents: pid ? shell.documents.map((d) => ({ createdAt: d.createdAt, updatedAt: d.updatedAt })) : null,
    async aiRows(fromDay) {
      if (!project) throw new Error("no project");
      const rows = await apiFetch<unknown>(`/ai/log?from=${encodeURIComponent(fromDay)}&projectId=${encodeURIComponent(project.id)}`);
      if (!Array.isArray(rows)) throw new Error("ai log");
      return rows;
    },
    async testTimes() {
      if (!pid || !vaultOpen) return null;
      let wire: BlobWire;
      try { wire = await apiFetch<BlobWire>(blobPath(pid, "stats_runs")); } catch (e) {
        if (e instanceof ApiError && e.status === 404) return []; // never inserted a result: zero, read
        throw e;
      }
      let text: string;
      try { text = await vault.decryptBody({ id: blobId(pid, "stats_runs"), deks: wire.deks, bodyHtml: wire.body, keyVersion: wire.keyVersion }); } catch { return null; }
      const runs = parseBlob("stats_runs", text);
      return runs ? Object.values(runs).map((r) => r.ts) : null;
    },
    async lastDoc() {
      if (!vaultOpen) return null;
      // The student's own writing, not a paper they keep to read.
      const own = shell.documents.filter((d) => d.kind !== "source").sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      if (!own) return null;
      const d = await apiFetch<DocumentWithBody>(`/documents/${own.id}`);
      const html = await vault.decryptBody({ id: d.id, deks: d.deks, bodyHtml: d.bodyHtml, keyVersion: d.keyVersion });
      return { at: Date.parse(own.updatedAt), text: firstWords(html, QUOTE_WORDS) };
    },
    answer: lastAnswer(s.uid)
  };
}
