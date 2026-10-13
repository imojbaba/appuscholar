import type { Store, Project, DocumentSummary, DocumentWithBody, DocumentRevision, RevisionSummary, NewRevision } from "./types";

type DocRow = { id: string; projectId: string; title: string; kind: string; createdAt: Date; updatedAt: Date };

export class MemoryStore implements Store {
  private projects = new Map<string, Project>();
  private docs = new Map<string, DocRow>();
  private revs = new Map<string, DocumentRevision[]>();

  private ownsProject(userId: string, projectId: string): boolean {
    return this.projects.get(projectId)?.userId === userId;
  }
  private ownedDoc(userId: string, docId: string): DocRow | null {
    const d = this.docs.get(docId);
    return d && this.ownsProject(userId, d.projectId) ? d : null;
  }
  private latest(docId: string): DocumentRevision {
    const list = this.revs.get(docId) ?? [];
    const last = list[list.length - 1];
    if (!last) throw new Error("document without revisions: " + docId);
    return last;
  }
  private summary(d: DocRow): DocumentSummary {
    const r = this.latest(d.id);
    return { id: d.id, projectId: d.projectId, title: d.title, kind: d.kind, currentSeq: r.seq, wordCount: r.wordCount, updatedAt: d.updatedAt };
  }

  async createProject(userId: string, title: string): Promise<Project> {
    const p: Project = { id: crypto.randomUUID(), userId, title, field: "psychology", stage: "idea", contentLang: "en", createdAt: new Date() };
    this.projects.set(p.id, p);
    return p;
  }
  async listProjects(userId: string): Promise<Project[]> {
    return [...this.projects.values()].filter(p => p.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getProject(userId: string, id: string): Promise<Project | null> {
    const p = this.projects.get(id);
    return p && p.userId === userId ? p : null;
  }

  async createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision): Promise<DocumentWithBody | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const now = new Date();
    const d: DocRow = { id: crypto.randomUUID(), projectId, title, kind, createdAt: now, updatedAt: now };
    this.docs.set(d.id, d);
    const r: DocumentRevision = { id: crypto.randomUUID(), documentId: d.id, seq: 1, ...first, createdAt: now };
    this.revs.set(d.id, [r]);
    return { ...this.summary(d), bodyHtml: r.bodyHtml };
  }
  async listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    return [...this.docs.values()].filter(d => d.projectId === projectId).map(d => this.summary(d)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async getDocument(userId: string, id: string): Promise<DocumentWithBody | null> {
    const d = this.ownedDoc(userId, id);
    return d ? { ...this.summary(d), bodyHtml: this.latest(d.id).bodyHtml } : null;
  }
  async renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, id);
    if (!d) return null;
    d.title = title; d.updatedAt = new Date();
    return this.summary(d);
  }

  async appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null> {
    const d = this.ownedDoc(userId, documentId);
    if (!d) return null;
    const list = this.revs.get(documentId)!;
    const r: DocumentRevision = { id: crypto.randomUUID(), documentId, seq: list.length + 1, ...rev, createdAt: new Date() };
    list.push(r);
    d.updatedAt = r.createdAt;
    return r;
  }
  async listRevisions(userId: string, documentId: string): Promise<RevisionSummary[] | null> {
    if (!this.ownedDoc(userId, documentId)) return null;
    return [...(this.revs.get(documentId) ?? [])].reverse().map((r): RevisionSummary => ({ id: r.id, documentId: r.documentId, seq: r.seq, authorKind: r.authorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, createdAt: r.createdAt }));
  }
  async getRevision(userId: string, documentId: string, seq: number): Promise<DocumentRevision | null> {
    if (!this.ownedDoc(userId, documentId)) return null;
    return (this.revs.get(documentId) ?? []).find(r => r.seq === seq) ?? null;
  }
}
