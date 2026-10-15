import type { Store, Project, ProjectSummary, ProjectPatch, DocumentSummary, DocumentWithBody, DocumentRevision, RevisionSummary, NewRevision, ProjectStage, Settings, UserRecord, Credential, AiUseEntry } from "./types";

type DocRow = { id: string; projectId: string; title: string; kind: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null };

export class MemoryStore implements Store {
  private projects = new Map<string, Project>();
  private docs = new Map<string, DocRow>();
  private revs = new Map<string, DocumentRevision[]>();
  private users = new Map<string, UserRecord>();
  private credentials = new Map<string, Credential & { userId: string }>();
  private aiUse: { userId: string; projectId: string | null; e: AiUseEntry }[] = [];

  private ownsProject(userId: string, projectId: string): boolean {
    return this.projects.get(projectId)?.userId === userId;
  }
  private ownedDoc(userId: string, docId: string, includeDeleted = false): DocRow | null {
    const d = this.docs.get(docId);
    return d && this.ownsProject(userId, d.projectId) && (includeDeleted || d.deletedAt === null) ? d : null;
  }
  private latest(docId: string): DocumentRevision | null {
    const list = this.revs.get(docId) ?? [];
    return list[list.length - 1] ?? null;
  }
  private summary(d: DocRow, r: DocumentRevision | null = this.latest(d.id)): DocumentSummary | null {
    if (!r) return null;
    return { id: d.id, projectId: d.projectId, title: d.title, kind: d.kind, currentSeq: r.seq, wordCount: r.wordCount, updatedAt: d.updatedAt, deletedAt: d.deletedAt };
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const u = this.users.get(userId);
    return u ? { ...u, settings: { ...u.settings } } : null;
  }
  async ensureUser(userId: string, email: string): Promise<UserRecord> {
    if (!this.users.has(userId)) {
      this.users.set(userId, { id: userId, email, locale: "en", settings: {}, activeProjectId: null, termsAcceptedAt: null, ageConfirmed: false });
    }
    return (await this.getUser(userId))!;
  }
  async updateSettings(userId: string, patch: Settings): Promise<Settings> {
    const u = this.users.get(userId);
    if (!u) throw new Error(`unknown user ${userId}`);
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (u.settings as Record<string, unknown>)[k] = v;
    return { ...u.settings };
  }
  async setActiveProject(userId: string, projectId: string | null): Promise<boolean> {
    const u = this.users.get(userId);
    if (!u || (projectId !== null && !this.ownsProject(userId, projectId))) return false;
    u.activeProjectId = projectId;
    return true;
  }
  async acceptTerms(userId: string, at: Date): Promise<void> {
    const u = this.users.get(userId);
    if (!u) return;
    u.termsAcceptedAt = at;
    u.ageConfirmed = true;
  }

  async createProject(userId: string, title: string, stage: ProjectStage = "idea"): Promise<Project> {
    const p: Project = { id: crypto.randomUUID(), userId, title, field: "psychology", stage, status: "active", contentLang: "en", kind: "research", createdAt: new Date() };
    this.projects.set(p.id, p);
    return p;
  }
  async getScratchProject(userId: string): Promise<Project> {
    const found = [...this.projects.values()].find(p => p.userId === userId && p.kind === "scratch");
    if (found) return found;
    const p: Project = { id: crypto.randomUUID(), userId, title: "Scratch space", field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "scratch", createdAt: new Date() };
    this.projects.set(p.id, p);
    return p;
  }
  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const rank = (p: Project) => (p.status === "complete" ? 1 : 0);
    const recency = (p: ProjectSummary) => (p.lastEditedAt ?? p.createdAt).getTime();
    return [...this.projects.values()]
      .filter(p => p.userId === userId && p.kind !== "scratch")
      .map(p => {
        const docs = [...this.docs.values()].filter(d => d.projectId === p.id && d.deletedAt === null);
        const last = docs.reduce<Date | null>((acc, d) => (acc === null || d.updatedAt > acc ? d.updatedAt : acc), null);
        return { ...p, documentCount: docs.length, lastEditedAt: last };
      })
      .sort((x, y) => rank(x) - rank(y) || recency(y) - recency(x));
  }
  async updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return null;
    if (patch.title !== undefined) p.title = patch.title;
    if (patch.stage !== undefined) p.stage = patch.stage;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.contentLang !== undefined) p.contentLang = patch.contentLang;
    return p;
  }
  async deleteProject(userId: string, id: string): Promise<boolean> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return false;
    for (const d of [...this.docs.values()]) if (d.projectId === id) { this.docs.delete(d.id); this.revs.delete(d.id); }
    this.projects.delete(id);
    return true;
  }
  async getProject(userId: string, id: string): Promise<Project | null> {
    const p = this.projects.get(id);
    return p && p.userId === userId ? p : null;
  }

  async createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision): Promise<DocumentWithBody | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const now = new Date();
    const d: DocRow = { id: crypto.randomUUID(), projectId, title, kind, createdAt: now, updatedAt: now, deletedAt: null };
    this.docs.set(d.id, d);
    const r: DocumentRevision = { id: crypto.randomUUID(), documentId: d.id, seq: 1, ...first, originStats: first.originStats ?? null, createdAt: now };
    this.revs.set(d.id, [r]);
    return { ...this.summary(d, r)!, bodyHtml: r.bodyHtml };
  }
  async listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    return [...this.docs.values()].filter(d => d.projectId === projectId && d.deletedAt === null).map(d => this.summary(d)).filter((x): x is DocumentSummary => x !== null).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async getDocument(userId: string, id: string): Promise<DocumentWithBody | null> {
    const d = this.ownedDoc(userId, id);
    if (!d) return null;
    const r = this.latest(d.id);
    const sum = this.summary(d, r);
    return r && sum ? { ...sum, bodyHtml: r.bodyHtml } : null;
  }
  async renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, id);
    if (!d) return null;
    d.title = title; d.updatedAt = new Date();
    return this.summary(d);
  }
  async moveDocument(userId: string, documentId: string, projectId: string): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, documentId);
    if (!d || !this.ownsProject(userId, projectId)) return null;
    d.projectId = projectId;
    return this.summary(d);
  }
  async setDocumentKind(userId: string, id: string, kind: string): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, id);
    if (!d) return null;
    d.kind = kind;
    return this.summary(d);
  }
  async softDeleteDocument(userId: string, id: string): Promise<"deleted" | "only-document" | null> {
    const d = this.ownedDoc(userId, id);
    if (!d) return null;
    const live = [...this.docs.values()].filter(x => x.projectId === d.projectId && x.deletedAt === null).length;
    if (live <= 1) return "only-document";
    d.deletedAt = new Date();
    return "deleted";
  }
  async restoreDeletedDocument(userId: string, id: string): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, id, true);
    if (!d) return null;
    d.deletedAt = null;
    return this.summary(d);
  }

  async appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null> {
    const d = this.ownedDoc(userId, documentId);
    if (!d) return null;
    const list = this.revs.get(documentId)!;
    const r: DocumentRevision = { id: crypto.randomUUID(), documentId, seq: list.length + 1, ...rev, originStats: rev.originStats ?? null, createdAt: new Date() };
    list.push(r);
    d.updatedAt = r.createdAt;
    return r;
  }
  async listRevisions(userId: string, documentId: string): Promise<RevisionSummary[] | null> {
    if (!this.ownedDoc(userId, documentId)) return null;
    return [...(this.revs.get(documentId) ?? [])].reverse().map((r): RevisionSummary => ({ id: r.id, documentId: r.documentId, seq: r.seq, authorKind: r.authorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, originStats: r.originStats, createdAt: r.createdAt }));
  }
  async getRevision(userId: string, documentId: string, seq: number): Promise<DocumentRevision | null> {
    if (!this.ownedDoc(userId, documentId)) return null;
    return (this.revs.get(documentId) ?? []).find(r => r.seq === seq) ?? null;
  }

  async putCredential(userId: string, provider: string, encryptedKey: string): Promise<void> {
    this.credentials.set(`${userId}:${provider}`, { userId, provider, encryptedKey, updatedAt: new Date() });
  }
  async getCredentials(userId: string): Promise<Credential[]> {
    return [...this.credentials.values()].filter(c => c.userId === userId).map(({ provider, encryptedKey, updatedAt }) => ({ provider, encryptedKey, updatedAt })).sort((x, y) => x.provider.localeCompare(y.provider));
  }
  async deleteCredential(userId: string, provider: string): Promise<boolean> {
    return this.credentials.delete(`${userId}:${provider}`);
  }

  async appendAiUse(userId: string, projectId: string | null, e: AiUseEntry): Promise<void> {
    this.aiUse.push({ userId, projectId, e: { d: e.d, p: e.p, m: e.m, k: e.k, g: e.g } });
  }
  async listAiUse(userId: string, from?: string, to?: string): Promise<AiUseEntry[]> {
    return this.aiUse
      .filter(r => r.userId === userId && (from === undefined || r.e.d >= from) && (to === undefined || r.e.d <= to))
      .map(r => ({ ...r.e }))
      .sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  }
  async eraseAiUse(userId: string): Promise<void> {
    this.aiUse = this.aiUse.filter(r => r.userId !== userId);
  }
}
