export type AuthorKind = "web" | "copilot" | "import" | "restore";

export type Settings = {
  lang?: "en" | "hi"; provider?: string; draftFirst?: boolean; aiFallback?: boolean; field?: string;
  contentLang?: "en" | "hi"; orcid?: string; toolTab?: string; sidebarCollapsed?: boolean;
  stageGroupsCollapsed?: string[]; fmtMore?: boolean; dockW?: number; sheetPct?: number; aiLogOff?: boolean; seenWelcome?: boolean;
  docBeside?: boolean; docW?: number;
};
export type UserRecord = { id: string; email: string; locale: string; settings: Settings; activeProjectId: string | null; termsAcceptedAt: Date | null; ageConfirmed: boolean };
export type Credential = { provider: string; encryptedKey: string; updatedAt: Date };
export type AiUseEntry = { d: string; p: string; m: string; k: string; g: "text" | "feedback" | "explain" | "other" };
export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };

export type ProjectKind = "research" | "scratch";
export const PROJECT_STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
/** The stages the student marked Ready, each stamped by the server's clock. */
export type StageMarks = Partial<Record<ProjectStage, { readyAt: string }>>;
/** `deks` and `titleKeyVersion` seal the title as a document's revisions are sealed: 0 is a plaintext title. */
export type Project = { id: string; userId: string; title: string; field: string; stage: string; status: string; contentLang: string; kind: ProjectKind; createdAt: Date; stageMarks: StageMarks; deks: WrappedDek[]; titleKeyVersion: number };
export const PROJECT_STATUSES = ["active", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectSummary = Project & { documentCount: number; lastEditedAt: Date | null };
/** A title without `titleKeyVersion` is plaintext (0). `dek` is added to the project's deks as TitleWrite's is. */
export type ProjectPatch = { title?: string; titleKeyVersion?: number; dek?: WrappedDek; stage?: ProjectStage; status?: ProjectStatus; contentLang?: "en" | "hi" };
/** A per-document data key wrapped under the user's vault key; `v` matches the revisions' `keyVersion`. */
export type WrappedDek = { v: number; wrapped: string };
export type DocumentSummary = { id: string; projectId: string; title: string; titleKeyVersion: number; kind: string; currentSeq: number; wordCount: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null; deks: WrappedDek[] };
/**
 * A project's or document's title: titleKeyVersion 0 is plaintext, 1 or more is ciphertext under the entity's dek with that `v`. `dek` is
 * added to the entity's deks when its `v` is new; the same wrap again is a no-op, another wrap for a known `v` is DekExistsError. A plain
 * string is a plaintext title. Either way the entity's deks are kept.
 */
export type TitleWrite = { title: string; titleKeyVersion: number; dek?: WrappedDek };
/** A plain string as the plaintext TitleWrite it stands for. */
export const asTitle = (t: string | TitleWrite): TitleWrite => (typeof t === "string" ? { title: t, titleKeyVersion: 0 } : t);
export type DocumentRevision = { id: string; documentId: string; seq: number; bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats: OriginStats | null; keyVersion: number; createdAt: Date };
export type RevisionSummary = Omit<DocumentRevision, "bodyHtml">;
/** keyVersion 0 means bodyHtml is plaintext HTML; 1 or more means it is a ciphertext blob the server cannot read. */
export type DocumentWithBody = DocumentSummary & { bodyHtml: string; keyVersion: number };

/**
 * A stage panel's data for one project: one body per (project, kind). keyVersion 0 is plaintext JSON (only while the user has no vault);
 * 1 or more is ciphertext under the dek with that `v`, which the server stores and never opens.
 */
export type ProjectBlob = { id: string; projectId: string; kind: string; body: string; keyVersion: number; deks: WrappedDek[]; updatedAt: Date; version: number };
export type BlobSummary = { kind: string; keyVersion: number; updatedAt: Date; version: number };
/** A project in the list with what it holds: every blob without its body, and the words and newest edit of its live non-source documents. */
export type ProjectWork = ProjectSummary & { blobs: Array<{ kind: string; updatedAt: Date; version: number }>; draftWords: number; draftEditedAt: Date | null };
/**
 * `dek` is added to the blob's deks when its `v` is new; the same wrap again is a no-op, another wrap for a known `v` is DekExistsError.
 * `expectedVersion` is the version the writer read (putBlob only): absent, the write is an upsert as before wave A; 0, it creates the blob or
 * updates one still at version 0; above 0, it updates only a blob at that version and never creates one. Otherwise VersionConflictError.
 */
export type BlobWrite = { body: string; keyVersion: number; dek?: WrappedDek; expectedVersion?: number };

export type NewRevision = { bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats?: OriginStats; keyVersion: number };

/**
 * `checkWrapped` is a fixed sentinel encrypted under the vault key, so a candidate key is checked without the sharing keypair. The keypair is
 * null where the browser had no X25519 at setup; a later unlock adds it once (see updateVaultWraps).
 */
export type VaultRecord = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: Date };
export type VaultWrapsPatch = { passWrapped?: string; recoveryWrapped?: string; publicKey?: string; privateKeyWrapped?: string };
export type AuditAction = "signin" | "vault-setup" | "passphrase-changed" | "recovery-used" | "keypair-added" | "migration-complete" | "export" | "document-deleted" | "project-deleted" | "account-erased";
export type AuditEntry = { action: AuditAction; target: string | null; at: Date };

/** Thrown by putVault when the user already has a vault record. */
export class VaultExistsError extends Error {
  constructor() { super("vault already exists"); this.name = "VaultExistsError"; }
}

/** Thrown by updateVaultWraps when the caller's `expectUpdatedAt` is not the record's: another tab or device changed it meanwhile. */
export class VaultStaleError extends Error {
  constructor() { super("vault record changed"); this.name = "VaultStaleError"; }
}

/** Thrown by updateVaultWraps when a keypair is sent for a vault that already has one: the sharing keypair is set once. */
export class VaultKeypairExistsError extends Error {
  constructor() { super("vault keypair already set"); this.name = "VaultKeypairExistsError"; }
}

/** Thrown by addDek when the document already has a data key with the same `v`, and by putBlob/rewriteBlob when the blob has another wrap for that `v`. */
export class DekExistsError extends Error {
  constructor(v: number) { super(`dek v${v} already exists`); this.name = "DekExistsError"; }
}

/** Thrown by putBlob when `expectedVersion` is not the blob's version; `current` is the stored version, 0 when there is no blob. */
export class VersionConflictError extends Error {
  constructor(public current: number) { super(`blob is at version ${current}`); this.name = "VersionConflictError"; }
}

export interface Store {
  /** DekExistsError cannot happen here: a new project has no deks. */
  createProject(userId: string, title: string | TitleWrite, stage?: ProjectStage): Promise<Project>;
  /** Excludes the scratch project. */
  listProjects(userId: string): Promise<ProjectSummary[]>;
  /** listProjects' projects, in its order, with their work (see ProjectWork). At most 3 SQL statements for any number of projects. */
  listProjectWork(userId: string): Promise<ProjectWork[]>;
  /** Throws DekExistsError (and writes nothing) when `patch.dek` is another wrap for a `v` the project has. */
  updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null>;
  /** Ready sets stageMarks[stage] to { readyAt: now }; false deletes it. Null if the project is not the user's. */
  markStage(userId: string, id: string, stage: ProjectStage, ready: boolean, now: Date): Promise<Project | null>;
  deleteProject(userId: string, id: string): Promise<boolean>;
  getProject(userId: string, id: string): Promise<Project | null>;

  /**
   * `deks` are attached in the same step, so a ciphertext first revision is never stored without its key; a sealed title's dek joins them
   * (DekExistsError, and nothing created, when it disagrees with one of them).
   */
  createDocument(userId: string, projectId: string, title: string | TitleWrite, kind: string, first: NewRevision, deks?: WrappedDek[]): Promise<DocumentWithBody | null>;
  /** Excludes soft-deleted documents, as does every document lookup except restoreDeletedDocument, unless `includeDeleted` (the vault migration). */
  listDocuments(userId: string, projectId: string, opts?: { includeDeleted?: boolean }): Promise<DocumentSummary[] | null>;
  /** `includeDeleted` also returns a soft-deleted document (the vault migration must reach those). */
  getDocument(userId: string, id: string, opts?: { includeDeleted?: boolean }): Promise<DocumentWithBody | null>;
  /** DekExistsError (and nothing written) as updateProject. */
  renameDocument(userId: string, id: string, title: string | TitleWrite): Promise<DocumentSummary | null>;

  appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null>;
  /** `includeDeleted` also reaches a soft-deleted document's revisions (the vault migration rewrites those too). */
  listRevisions(userId: string, documentId: string, opts?: { includeDeleted?: boolean }): Promise<RevisionSummary[] | null>;
  getRevision(userId: string, documentId: string, seq: number, opts?: { includeDeleted?: boolean }): Promise<DocumentRevision | null>;

  getUser(userId: string): Promise<UserRecord | null>;
  /** Inserts a users row if the API sees a JWT for a user the adapter has not written yet (e2e provider). Never overwrites an existing row. */
  ensureUser(userId: string, email: string): Promise<UserRecord>;
  /** Shallow merge: keys absent (or undefined) in the patch are untouched; arrays replace. Throws if the user row does not exist. */
  updateSettings(userId: string, patch: Settings): Promise<Settings>;
  /** False if the project is not owned by the user. */
  setActiveProject(userId: string, projectId: string | null): Promise<boolean>;
  /** Sets termsAcceptedAt and ageConfirmed=true. */
  acceptTerms(userId: string, at: Date): Promise<void>;
  /** Creates the kind=scratch project titled "Scratch space" once, then returns it. */
  getScratchProject(userId: string): Promise<Project>;
  moveDocument(userId: string, documentId: string, projectId: string): Promise<DocumentSummary | null>;
  setDocumentKind(userId: string, id: string, kind: string): Promise<DocumentSummary | null>;
  softDeleteDocument(userId: string, id: string): Promise<"deleted" | "only-document" | null>;
  restoreDeletedDocument(userId: string, id: string): Promise<DocumentSummary | null>;

  putCredential(userId: string, provider: string, encryptedKey: string): Promise<void>;
  getCredentials(userId: string): Promise<Credential[]>;
  deleteCredential(userId: string, provider: string): Promise<boolean>;

  appendAiUse(userId: string, projectId: string | null, e: AiUseEntry): Promise<void>;
  /** ISO dates YYYY-MM-DD, inclusive. */
  listAiUse(userId: string, from?: string, to?: string): Promise<AiUseEntry[]>;
  eraseAiUse(userId: string): Promise<void>;

  getVault(userId: string): Promise<VaultRecord | null>;
  /** Creates the record (complete=false). A second call for the same user throws VaultExistsError. */
  putVault(userId: string, v: Omit<VaultRecord, "complete" | "updatedAt">): Promise<VaultRecord>;
  /**
   * Replaces whichever wraps are given, in one conditional step, and moves updatedAt strictly forward. Null if the user has no vault record.
   * Throws VaultStaleError when `expectUpdatedAt` is given and differs from the stored updatedAt (compared to the millisecond), and
   * VaultKeypairExistsError when publicKey/privateKeyWrapped are given while the record already has a keypair.
   */
  updateVaultWraps(userId: string, patch: VaultWrapsPatch, opts?: { expectUpdatedAt?: Date }): Promise<VaultRecord | null>;
  /** False if the user has no vault record. */
  markVaultComplete(userId: string): Promise<boolean>;
  /**
   * Revisions with keyVersion 0 in any of the user's documents, soft-deleted ones included, plus blobs with keyVersion 0 in any of the user's
   * projects (the scratch project included): the vault completes only at 0.
   */
  countPlaintextRevisions(userId: string): Promise<number>;

  /** Attaches a wrapped data key to a document, soft-deleted ones included. Throws DekExistsError if a dek with the same `v` already exists. Null if the document is not the user's. */
  addDek(userId: string, documentId: string, dek: WrappedDek): Promise<DocumentSummary | null>;
  /**
   * Replaces a revision's body and key version in place, on soft-deleted documents too; id, seq, createdAt, author and wordCount are untouched.
   * `originStats` is stored only where the revision has none (a revision saved before the tracker): stats already there are kept.
   * Null if the document or revision is not the user's.
   */
  rewriteRevision(userId: string, documentId: string, seq: number, patch: { bodyHtml: string; keyVersion: number; originStats?: OriginStats }): Promise<RevisionSummary | null>;

  /** Null if there is none, or the project is not the user's. */
  getBlob(userId: string, projectId: string, kind: string): Promise<ProjectBlob | null>;
  /**
   * Creates the (project, kind) blob or replaces its body and key version, adding `dek` in the same step when its `v` is new, and sets the
   * version one above the stored one (1 for a new blob). Null if the project is not the user's. Throws VersionConflictError (and writes
   * nothing) when `expectedVersion` does not hold (see BlobWrite), else DekExistsError (and writes nothing) when the blob already has another
   * wrap for `dek.v`. The version check and the write are one step, so of two writers holding the same version exactly one wins.
   */
  putBlob(userId: string, projectId: string, kind: string, w: BlobWrite): Promise<ProjectBlob | null>;
  /** The project's blobs without their bodies, by kind. Null if the project is not the user's. */
  listBlobs(userId: string, projectId: string): Promise<BlobSummary[] | null>;
  /**
   * Migration only: replaces an existing blob's body and key version, adding `dek` as putBlob does (a plaintext blob has none yet), bumps the
   * version, and leaves updatedAt as it was. Ignores `expectedVersion`. Null if the blob does not exist or the project is not the user's.
   * DekExistsError as putBlob.
   */
  rewriteBlob(userId: string, projectId: string, kind: string, w: BlobWrite): Promise<ProjectBlob | null>;
  /** Deletes the (project, kind) blob (a Reading shelf paper removed from the shelf). False if there is none or the project is not the user's. */
  deleteBlob(userId: string, projectId: string, kind: string): Promise<boolean>;

  appendAudit(userId: string, action: AuditAction, target?: string): Promise<void>;
  /** Oldest first. */
  listAudit(userId: string): Promise<AuditEntry[]>;
  /** Deletes credentials, ai_use_log, vault_keys, verification tokens for the user's email, projects (with their documents, revisions and blobs) and the user (accounts and sessions by cascade), then appends an "account-erased" audit row. Existing audit rows stay. False if the user does not exist. */
  eraseUser(userId: string): Promise<boolean>;
}
