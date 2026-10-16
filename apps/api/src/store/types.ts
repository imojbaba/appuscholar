export type AuthorKind = "web" | "copilot" | "import" | "restore";

export type Settings = {
  lang?: "en" | "hi"; provider?: string; draftFirst?: boolean; aiFallback?: boolean; field?: string;
  contentLang?: "en" | "hi"; orcid?: string; toolTab?: string; sidebarCollapsed?: boolean;
  stageGroupsCollapsed?: string[]; fmtMore?: boolean; dockW?: number; sheetPct?: number; aiLogOff?: boolean; seenWelcome?: boolean;
};
export type UserRecord = { id: string; email: string; locale: string; settings: Settings; activeProjectId: string | null; termsAcceptedAt: Date | null; ageConfirmed: boolean };
export type Credential = { provider: string; encryptedKey: string; updatedAt: Date };
export type AiUseEntry = { d: string; p: string; m: string; k: string; g: "text" | "feedback" | "explain" | "other" };
export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };

export type ProjectKind = "research" | "scratch";
export type Project = { id: string; userId: string; title: string; field: string; stage: string; status: string; contentLang: string; kind: ProjectKind; createdAt: Date };
export const PROJECT_STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const PROJECT_STATUSES = ["active", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectSummary = Project & { documentCount: number; lastEditedAt: Date | null };
export type ProjectPatch = { title?: string; stage?: ProjectStage; status?: ProjectStatus; contentLang?: "en" | "hi" };
/** A per-document data key wrapped under the user's vault key; `v` matches the revisions' `keyVersion`. */
export type WrappedDek = { v: number; wrapped: string };
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null; deks: WrappedDek[] };
export type DocumentRevision = { id: string; documentId: string; seq: number; bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats: OriginStats | null; keyVersion: number; createdAt: Date };
export type RevisionSummary = Omit<DocumentRevision, "bodyHtml">;
/** keyVersion 0 means bodyHtml is plaintext HTML; 1 or more means it is a ciphertext blob the server cannot read. */
export type DocumentWithBody = DocumentSummary & { bodyHtml: string; keyVersion: number };

export type NewRevision = { bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats?: OriginStats; keyVersion: number };

export type VaultRecord = { passWrapped: string; recoveryWrapped: string; publicKey: string; privateKeyWrapped: string; complete: boolean; updatedAt: Date };
export type AuditAction = "signin" | "vault-setup" | "passphrase-changed" | "recovery-used" | "migration-complete" | "export" | "document-deleted" | "project-deleted" | "account-erased";
export type AuditEntry = { action: AuditAction; target: string | null; at: Date };

/** Thrown by putVault when the user already has a vault record. */
export class VaultExistsError extends Error {
  constructor() { super("vault already exists"); this.name = "VaultExistsError"; }
}

export interface Store {
  createProject(userId: string, title: string, stage?: ProjectStage): Promise<Project>;
  /** Excludes the scratch project. */
  listProjects(userId: string): Promise<ProjectSummary[]>;
  updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null>;
  deleteProject(userId: string, id: string): Promise<boolean>;
  getProject(userId: string, id: string): Promise<Project | null>;

  createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision): Promise<DocumentWithBody | null>;
  /** Excludes soft-deleted documents, as does every document lookup except restoreDeletedDocument. */
  listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null>;
  getDocument(userId: string, id: string): Promise<DocumentWithBody | null>;
  renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null>;

  appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null>;
  listRevisions(userId: string, documentId: string): Promise<RevisionSummary[] | null>;
  getRevision(userId: string, documentId: string, seq: number): Promise<DocumentRevision | null>;

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
  /** Replaces whichever wraps are given. Null if the user has no vault record. */
  updateVaultWraps(userId: string, patch: { passWrapped?: string; recoveryWrapped?: string }): Promise<VaultRecord | null>;
  /** False if the user has no vault record. */
  markVaultComplete(userId: string): Promise<boolean>;

  /** Attaches a wrapped data key to a document. Rejects (throws) if a dek with the same `v` already exists. Null if the document is not the user's. */
  addDek(userId: string, documentId: string, dek: WrappedDek): Promise<DocumentSummary | null>;
  /** Replaces a revision's body and key version in place; id, seq, createdAt, author, wordCount and originStats are untouched. Null if the document or revision is not the user's. */
  rewriteRevision(userId: string, documentId: string, seq: number, patch: { bodyHtml: string; keyVersion: number }): Promise<RevisionSummary | null>;

  appendAudit(userId: string, action: AuditAction, target?: string): Promise<void>;
  /** Oldest first. */
  listAudit(userId: string): Promise<AuditEntry[]>;
  /** Deletes credentials, ai_use_log, vault_keys, projects (with their documents and revisions) and the user, then appends an "account-erased" audit row. Existing audit rows stay. False if the user does not exist. */
  eraseUser(userId: string): Promise<boolean>;
}
