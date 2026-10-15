export type AuthorKind = "web" | "copilot" | "import" | "restore";

export type Project = { id: string; userId: string; title: string; field: string; stage: string; status: string; contentLang: string; createdAt: Date };
export const PROJECT_STAGES = ["idea", "lit", "design", "collect", "writing", "review"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const PROJECT_STATUSES = ["active", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectSummary = Project & { documentCount: number; lastEditedAt: Date | null };
export type ProjectPatch = { title?: string; stage?: ProjectStage; status?: ProjectStatus };
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; updatedAt: Date };
export type DocumentRevision = { id: string; documentId: string; seq: number; bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number; createdAt: Date };
export type RevisionSummary = Omit<DocumentRevision, "bodyHtml">;
export type DocumentWithBody = DocumentSummary & { bodyHtml: string };

export type NewRevision = { bodyHtml: string; authorKind: AuthorKind; authorLabel: string; wordCount: number };

export interface Store {
  createProject(userId: string, title: string): Promise<Project>;
  listProjects(userId: string): Promise<ProjectSummary[]>;
  updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null>;
  deleteProject(userId: string, id: string): Promise<boolean>;
  getProject(userId: string, id: string): Promise<Project | null>;

  createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision): Promise<DocumentWithBody | null>;
  listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null>;
  getDocument(userId: string, id: string): Promise<DocumentWithBody | null>;
  renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null>;

  appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null>;
  listRevisions(userId: string, documentId: string): Promise<RevisionSummary[] | null>;
  getRevision(userId: string, documentId: string, seq: number): Promise<DocumentRevision | null>;
}
