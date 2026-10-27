import { apiFetch } from "@/lib/api";
import { APP_VERSION } from "@/lib/version";
import { blobId, type BlobKind } from "@/lib/blobs/kinds";
import type { BlobWire } from "@/lib/blobs/useProjectBlob";
import { exportAll, type ExportDoc, type ExportDocSummary, type ExportProject } from "@/lib/vault/export";
import { openTitle, projectKeyId, titleText, UNTITLED } from "@/lib/vault/titles";
import type { VaultValue } from "@/lib/vault/useVault";
import { buildAllRecordText, openRecordTitles, type WritingRecord } from "@/lib/writingRecord";

export type BuildInput = {
  vault: Pick<VaultValue, "known" | "ensureUnlocked" | "decryptBody">;
  /** `me.scratchProjectId`. */
  scratchProjectId: string | null | undefined;
  /** The scratch space's name (t("export_scratch")). */
  scratchTitle: string;
  /** The local calendar day, YYYY-MM-DD (localDay()). */
  day: string;
};

/**
 * The account export's zip, built the way Help's `exportWork` builds it (components/workspace/dialogs/Help.tsx, which is not touched here): unlock
 * the vault if there is one, read every project with its work, add the scratch space, and hand `exportAll` the same reads. Only ciphertext
 * comes from the server and nothing decrypted goes back. Null when the vault stays locked (the student cancelled the unlock). Locking the
 * zip, the audit and the download are the caller's, in the order exportWork has them: build, `logBackupExport`, save.
 */
export async function buildBackupZip(i: BuildInput): Promise<Blob | null> {
  const { vault } = i;
  if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) return null;
  const projects = await apiFetch<ExportProject[]>("/projects?include=work");
  const scratch = i.scratchProjectId;
  if (scratch && !projects.some((p) => p.id === scratch)) projects.push({ id: scratch, title: i.scratchTitle, titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "" });
  return exportAll({
    listProjects: async () => projects,
    listDocuments: (id) => apiFetch<ExportDocSummary[]>(`/projects/${id}/documents`),
    getDocument: (id) => apiFetch<ExportDoc>(`/documents/${id}`),
    decrypt: (doc) => vault.decryptBody(doc),
    openTitle: (title, keyId) => openTitle(vault, title, keyId),
    listBlobs: (id) => apiFetch<Array<{ kind: string; keyVersion: number; updatedAt: string }>>(`/projects/${id}/blobs`),
    getBlob: (id, kind) => apiFetch<BlobWire>(`/projects/${id}/blobs/${encodeURIComponent(kind)}`),
    decryptBlob: (id, w) => vault.decryptBody({ id: blobId(id, w.kind as BlobKind), deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion }),
    writingRecordText: async () => {
      const parts = await Promise.all(projects.map(async (p) => ({
        title: await titleText(vault, p, projectKeyId(p.id), UNTITLED),
        rec: await openRecordTitles(await apiFetch<WritingRecord>(`/projects/${p.id}/writing-record`), (x, k) => openTitle(vault, x, k), UNTITLED)
      })));
      return buildAllRecordText(parts, APP_VERSION, i.day);
    }
  });
}

/** The export is logged (POST /me/export-audit), as Help's is, once the zip is built and before it is saved. */
export function logBackupExport(): Promise<void> {
  return apiFetch<void>("/me/export-audit", { method: "POST" });
}
