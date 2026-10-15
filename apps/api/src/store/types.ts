export type AuthorKind = "web" | "copilot" | "import" | "restore";

export type Settings = {
  lang?: "en" | "hi"; provider?: string; draftFirst?: boolean; aiFallback?: boolean; field?: string;
  contentLang?: "en" | "hi"; orcid?: string; toolTab?: string; sidebarCollapsed?: boolean;
  stageGroupsCollapsed?: string[]; fmtMore?: boolean; dockW?: number; aiLogOff?: boolean; seenWelcome?: boolean;
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
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; updatedAt: Date; deletedAt: Date | null };
export type DocumentRevision = { id: string; documentId: string; seq: number; bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats: OriginStats | null; createdAt: Date };
export type RevisionSummary = Omit<DocumentRevision, "bodyHtml">;
export type DocumentWithBody = DocumentSummary & { bodyHtml: string };

export type NewRevision = { bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; originStats?: OriginStats };

export interface Store {
  createProject(userId: string, title: string): Promise<Project>;
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
}
