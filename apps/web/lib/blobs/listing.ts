import { apiFetch } from "@/lib/api";

/** What GET /projects/:id/blobs answers: the kinds a project holds, whatever this build knows of them, with how each is sealed and when it was written. */
export type BlobListing = Array<{ kind: string; keyVersion: number; updatedAt: string }>;

/**
 * The project's blob listing. "Export all my work" reads it to carry every kind and to learn whether a project has a participant list (spec 2026-10-24-participants-design.md C10);
 * an AI request reads it while the vault is locked, to learn whether a list exists that could not be checked (§8.3). The kinds are not secret: only the bodies are sealed.
 */
export function listProjectBlobs(projectId: string): Promise<BlobListing> {
  return apiFetch<BlobListing>(`/projects/${projectId}/blobs`);
}

/** Whether a project's listing has a participant list (the blob exists; it may still be locked). */
export const hasParticipantsBlob = (listing: BlobListing): boolean => listing.some((b) => b.kind === "participants");
