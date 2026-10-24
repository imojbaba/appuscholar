import type { Store, Project, ProjectSummary, ProjectWork, ProjectPatch, TitleWrite, DocumentSummary, DocumentWithBody, DocumentRevision, RevisionSummary, NewRevision, ProjectStage, Settings, UserRecord, Credential, AiUseEntry, AuditAction, AuditEntry, OriginStats, VaultRecord, VaultWrapsPatch, WrappedDek, ProjectBlob, BlobSummary, BlobWrite, QuotaRule, QuotaResult } from "./types";
import { asTitle, DekExistsError, VaultExistsError, VaultKeypairExistsError, VaultStaleError, VersionConflictError } from "./types";

/** A vault record's next updatedAt: now, but always after the last one, so a precondition never matches two versions. */
const after = (prev: Date): Date => new Date(Math.max(Date.now(), prev.getTime() + 1));

/** Quota counters from windows that began longer ago than this are dropped (both stores). */
const QUOTA_KEEP_MS = 2 * 86_400_000;

type DocRow = { id: string; projectId: string; title: string; titleKeyVersion: number; kind: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null; deks: WrappedDek[] };

export class MemoryStore implements Store {
  private projects = new Map<string, Project>();
  private docs = new Map<string, DocRow>();
  private revs = new Map<string, DocumentRevision[]>();
  private users = new Map<string, UserRecord>();
  private credentials = new Map<string, Credential & { userId: string }>();
  private vaults = new Map<string, VaultRecord>();
  private audit: { userId: string; action: AuditAction; target: string | null; at: Date }[] = [];
  private aiUse: { userId: string; projectId: string | null; e: AiUseEntry; at: Date }[] = [];
  /** Quota counters keyed by userId + "\n" + bucket + "\n" + window start in ms: { start, count }. */
  private quota = new Map<string, { userId: string; start: number; count: number }>();
  /** Keyed by projectId + "\n" + kind (a kind never holds a newline). */
  private blobs = new Map<string, ProjectBlob>();

  private ownsProject(userId: string, projectId: string): boolean {
    return this.projects.get(projectId)?.userId === userId;
  }
  private ownedDoc(userId: string, docId: string, includeDeleted = false): DocRow | null {
    const d = this.docs.get(docId);
    return d && this.ownsProject(userId, d.projectId) && (includeDeleted || d.deletedAt === null) ? d : null;
  }
  private projectCopy(p: Project): Project {
    return { ...p, stageMarks: { ...p.stageMarks }, deks: p.deks.map(k => ({ v: k.v, wrapped: k.wrapped })) };
  }
  private blobCopy(b: ProjectBlob): ProjectBlob {
    return { ...b, deks: b.deks.map(k => ({ v: k.v, wrapped: k.wrapped })) };
  }
  /** The deks after adding `dek`: unchanged when its wrap is already there, DekExistsError when another wrap holds its `v`. */
  private withDek(deks: WrappedDek[], dek?: WrappedDek): WrappedDek[] {
    if (!dek) return deks;
    const known = deks.find(k => k.v === dek.v);
    if (known && known.wrapped !== dek.wrapped) throw new DekExistsError(dek.v);
    return known ? deks : [...deks, { v: dek.v, wrapped: dek.wrapped }];
  }
  private latest(docId: string): DocumentRevision | null {
    const list = this.revs.get(docId) ?? [];
    return list[list.length - 1] ?? null;
  }
  private summary(d: DocRow, r: DocumentRevision | null = this.latest(d.id)): DocumentSummary | null {
    if (!r) return null;
    return { id: d.id, projectId: d.projectId, title: d.title, titleKeyVersion: d.titleKeyVersion, kind: d.kind, currentSeq: r.seq, wordCount: r.wordCount, createdAt: d.createdAt, updatedAt: d.updatedAt, deletedAt: d.deletedAt, deks: d.deks.map(k => ({ ...k })) };
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

  async createProject(userId: string, title: string | TitleWrite, stage: ProjectStage = "idea"): Promise<Project> {
    const t = asTitle(title);
    const p: Project = { id: crypto.randomUUID(), userId, title: t.title, field: "psychology", stage, status: "active", contentLang: "en", kind: "research", createdAt: new Date(), stageMarks: {}, deks: this.withDek([], t.dek), titleKeyVersion: t.titleKeyVersion };
    this.projects.set(p.id, p);
    return this.projectCopy(p);
  }
  async getScratchProject(userId: string): Promise<Project> {
    const found = [...this.projects.values()].find(p => p.userId === userId && p.kind === "scratch");
    if (found) return this.projectCopy(found);
    const p: Project = { id: crypto.randomUUID(), userId, title: "Scratch space", field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "scratch", createdAt: new Date(), stageMarks: {}, deks: [], titleKeyVersion: 0 };
    this.projects.set(p.id, p);
    return this.projectCopy(p);
  }
  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const rank = (p: Project) => (p.status === "complete" ? 1 : 0);
    const recency = (p: ProjectSummary) => (p.lastEditedAt ?? p.createdAt).getTime();
    return [...this.projects.values()]
      .filter(p => p.userId === userId && p.kind !== "scratch")
      .map(p => {
        const docs = [...this.docs.values()].filter(d => d.projectId === p.id && d.deletedAt === null);
        const last = docs.reduce<Date | null>((acc, d) => (acc === null || d.updatedAt > acc ? d.updatedAt : acc), null);
        return { ...this.projectCopy(p), documentCount: docs.length, lastEditedAt: last };
      })
      .sort((x, y) => rank(x) - rank(y) || recency(y) - recency(x));
  }
  async listProjectWork(userId: string): Promise<ProjectWork[]> {
    return (await this.listProjects(userId)).map(p => {
      const drafts = [...this.docs.values()].filter(d => d.projectId === p.id && d.deletedAt === null && d.kind !== "source" && this.latest(d.id) !== null);
      return {
        ...p,
        blobs: [...this.blobs.values()].filter(b => b.projectId === p.id).sort((x, y) => (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0)).map(b => ({ kind: b.kind, updatedAt: b.updatedAt, version: b.version })),
        draftWords: drafts.reduce((n, d) => n + (this.latest(d.id)?.wordCount ?? 0), 0),
        draftEditedAt: drafts.reduce<Date | null>((acc, d) => { const at = this.latest(d.id)!.createdAt; return acc === null || at > acc ? at : acc; }, null)
      };
    });
  }
  async updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return null;
    p.deks = this.withDek(p.deks, patch.dek);
    if (patch.title !== undefined) { p.title = patch.title; p.titleKeyVersion = patch.titleKeyVersion ?? 0; }
    else if (patch.titleKeyVersion !== undefined) p.titleKeyVersion = patch.titleKeyVersion;
    if (patch.stage !== undefined) p.stage = patch.stage;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.contentLang !== undefined) p.contentLang = patch.contentLang;
    return this.projectCopy(p);
  }
  async markStage(userId: string, id: string, stage: ProjectStage, ready: boolean, now: Date): Promise<Project | null> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return null;
    if (ready) p.stageMarks[stage] = { readyAt: now.toISOString() };
    else delete p.stageMarks[stage];
    return this.projectCopy(p);
  }
  async deleteProject(userId: string, id: string): Promise<boolean> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return false;
    for (const d of [...this.docs.values()]) if (d.projectId === id) { this.docs.delete(d.id); this.revs.delete(d.id); }
    for (const [k, b] of [...this.blobs]) if (b.projectId === id) this.blobs.delete(k);
    this.projects.delete(id);
    return true;
  }
  async getProject(userId: string, id: string): Promise<Project | null> {
    const p = this.projects.get(id);
    return p && p.userId === userId ? this.projectCopy(p) : null;
  }

  async createDocument(userId: string, projectId: string, title: string | TitleWrite, kind: string, first: NewRevision, deks: WrappedDek[] = []): Promise<DocumentWithBody | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const t = asTitle(title);
    const now = new Date();
    const d: DocRow = { id: crypto.randomUUID(), projectId, title: t.title, titleKeyVersion: t.titleKeyVersion, kind, createdAt: now, updatedAt: now, deletedAt: null, deks: this.withDek(deks.map(k => ({ v: k.v, wrapped: k.wrapped })), t.dek) };
    this.docs.set(d.id, d);
    const r: DocumentRevision = { id: crypto.randomUUID(), documentId: d.id, seq: 1, ...first, originStats: first.originStats ?? null, createdAt: now };
    this.revs.set(d.id, [r]);
    return { ...this.summary(d, r)!, bodyHtml: r.bodyHtml, keyVersion: r.keyVersion };
  }
  async listDocuments(userId: string, projectId: string, opts?: { includeDeleted?: boolean }): Promise<DocumentSummary[] | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    return [...this.docs.values()].filter(d => d.projectId === projectId && (opts?.includeDeleted === true || d.deletedAt === null)).map(d => this.summary(d)).filter((x): x is DocumentSummary => x !== null).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async getDocument(userId: string, id: string, opts?: { includeDeleted?: boolean }): Promise<DocumentWithBody | null> {
    const d = this.ownedDoc(userId, id, opts?.includeDeleted === true);
    if (!d) return null;
    const r = this.latest(d.id);
    const sum = this.summary(d, r);
    return r && sum ? { ...sum, bodyHtml: r.bodyHtml, keyVersion: r.keyVersion } : null;
  }
  async renameDocument(userId: string, id: string, title: string | TitleWrite, opts?: { includeDeleted?: boolean }): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, id, opts?.includeDeleted === true);
    if (!d) return null;
    const t = asTitle(title);
    d.deks = this.withDek(d.deks, t.dek);
    d.title = t.title; d.titleKeyVersion = t.titleKeyVersion; d.updatedAt = new Date();
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
  async listRevisions(userId: string, documentId: string, opts?: { includeDeleted?: boolean }): Promise<RevisionSummary[] | null> {
    if (!this.ownedDoc(userId, documentId, opts?.includeDeleted === true)) return null;
    return [...(this.revs.get(documentId) ?? [])].reverse().map((r): RevisionSummary => ({ id: r.id, documentId: r.documentId, seq: r.seq, authorKind: r.authorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, originStats: r.originStats, keyVersion: r.keyVersion, createdAt: r.createdAt }));
  }
  async getRevision(userId: string, documentId: string, seq: number, opts?: { includeDeleted?: boolean }): Promise<DocumentRevision | null> {
    if (!this.ownedDoc(userId, documentId, opts?.includeDeleted === true)) return null;
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
    this.aiUse.push({ userId, projectId, e: { d: e.d, p: e.p, m: e.m, k: e.k, g: e.g }, at: new Date() });
  }
  async listAiUse(userId: string, from?: string, to?: string, projectId?: string): Promise<AiUseEntry[]> {
    return this.aiUse
      .filter(r => r.userId === userId && (from === undefined || r.e.d >= from) && (to === undefined || r.e.d <= to) && (projectId === undefined || r.projectId === projectId))
      .map(r => ({ ...r.e }))
      .sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  }
  async claimAiUse(userId: string, projectId: string, since: Date): Promise<number> {
    const rows = this.aiUse.filter(r => r.userId === userId && r.projectId === null && r.at >= since);
    for (const r of rows) r.projectId = projectId;
    return rows.length;
  }
  async eraseAiUse(userId: string): Promise<void> {
    this.aiUse = this.aiUse.filter(r => r.userId !== userId);
  }

  async getVault(userId: string): Promise<VaultRecord | null> {
    const v = this.vaults.get(userId);
    return v ? { ...v } : null;
  }
  async putVault(userId: string, v: Omit<VaultRecord, "complete" | "updatedAt">): Promise<VaultRecord> {
    if (this.vaults.has(userId)) throw new VaultExistsError();
    const rec: VaultRecord = { passWrapped: v.passWrapped, recoveryWrapped: v.recoveryWrapped, checkWrapped: v.checkWrapped, publicKey: v.publicKey, privateKeyWrapped: v.privateKeyWrapped, complete: false, updatedAt: new Date() };
    this.vaults.set(userId, rec);
    return { ...rec };
  }
  async updateVaultWraps(userId: string, patch: VaultWrapsPatch, opts?: { expectUpdatedAt?: Date }): Promise<VaultRecord | null> {
    const v = this.vaults.get(userId);
    if (!v) return null;
    if (opts?.expectUpdatedAt && opts.expectUpdatedAt.getTime() !== v.updatedAt.getTime()) throw new VaultStaleError();
    if ((patch.publicKey !== undefined || patch.privateKeyWrapped !== undefined) && (v.publicKey !== null || v.privateKeyWrapped !== null)) throw new VaultKeypairExistsError();
    if (patch.passWrapped !== undefined) v.passWrapped = patch.passWrapped;
    if (patch.recoveryWrapped !== undefined) v.recoveryWrapped = patch.recoveryWrapped;
    if (patch.publicKey !== undefined) v.publicKey = patch.publicKey;
    if (patch.privateKeyWrapped !== undefined) v.privateKeyWrapped = patch.privateKeyWrapped;
    v.updatedAt = after(v.updatedAt);
    return { ...v };
  }
  async countPlaintextRevisions(userId: string): Promise<number> {
    let n = 0;
    for (const d of this.docs.values()) if (this.ownsProject(userId, d.projectId)) n += (this.revs.get(d.id) ?? []).filter(r => r.keyVersion === 0).length;
    for (const b of this.blobs.values()) if (b.keyVersion === 0 && this.ownsProject(userId, b.projectId)) n++;
    return n;
  }
  async markVaultComplete(userId: string): Promise<boolean> {
    const v = this.vaults.get(userId);
    if (!v) return false;
    v.complete = true;
    v.updatedAt = after(v.updatedAt);
    return true;
  }

  async addDek(userId: string, documentId: string, dek: WrappedDek): Promise<DocumentSummary | null> {
    const d = this.ownedDoc(userId, documentId, true);
    if (!d) return null;
    if (d.deks.some(k => k.v === dek.v)) throw new DekExistsError(dek.v);
    d.deks.push({ v: dek.v, wrapped: dek.wrapped });
    return this.summary(d);
  }
  async rewriteRevision(userId: string, documentId: string, seq: number, patch: { bodyHtml: string; keyVersion: number; originStats?: OriginStats }): Promise<RevisionSummary | null> {
    if (!this.ownedDoc(userId, documentId, true)) return null;
    const r = (this.revs.get(documentId) ?? []).find(x => x.seq === seq);
    if (!r) return null;
    r.bodyHtml = patch.bodyHtml;
    r.keyVersion = patch.keyVersion;
    if (r.originStats === null && patch.originStats) r.originStats = { ...patch.originStats };
    return { id: r.id, documentId: r.documentId, seq: r.seq, authorKind: r.authorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, originStats: r.originStats, keyVersion: r.keyVersion, createdAt: r.createdAt };
  }

  async getBlob(userId: string, projectId: string, kind: string): Promise<ProjectBlob | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const b = this.blobs.get(projectId + "\n" + kind);
    return b ? this.blobCopy(b) : null;
  }
  async putBlob(userId: string, projectId: string, kind: string, w: BlobWrite): Promise<ProjectBlob | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const key = projectId + "\n" + kind;
    const prev = this.blobs.get(key);
    // A missing blob is version 0, so expectedVersion above 0 never creates one. The version is checked before the dek rule, as the Drizzle
    // store reports them; either refusal writes nothing.
    if (w.expectedVersion !== undefined && (prev?.version ?? 0) !== w.expectedVersion) throw new VersionConflictError(prev?.version ?? 0);
    const deks = this.withDek(prev?.deks ?? [], w.dek);
    const updatedAt = new Date(Math.max(Date.now(), (prev?.updatedAt.getTime() ?? 0) + 1));
    const b: ProjectBlob = { id: prev?.id ?? crypto.randomUUID(), projectId, kind, body: w.body, keyVersion: w.keyVersion, deks, updatedAt, version: (prev?.version ?? 0) + 1 };
    this.blobs.set(key, b);
    return this.blobCopy(b);
  }
  async listBlobs(userId: string, projectId: string): Promise<BlobSummary[] | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    return [...this.blobs.values()].filter(b => b.projectId === projectId).sort((x, y) => (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0)).map(b => ({ kind: b.kind, keyVersion: b.keyVersion, updatedAt: b.updatedAt, version: b.version }));
  }
  async rewriteBlob(userId: string, projectId: string, kind: string, w: BlobWrite): Promise<ProjectBlob | null> {
    if (!this.ownsProject(userId, projectId)) return null;
    const b = this.blobs.get(projectId + "\n" + kind);
    if (!b) return null;
    b.deks = this.withDek(b.deks, w.dek);
    b.body = w.body;
    b.keyVersion = w.keyVersion;
    b.version += 1;
    return this.blobCopy(b);
  }

  async deleteBlob(userId: string, projectId: string, kind: string): Promise<boolean> {
    if (!this.ownsProject(userId, projectId)) return false;
    return this.blobs.delete(projectId + "\n" + kind);
  }

  async consumeQuota(userId: string, rules: QuotaRule[], now: Date): Promise<QuotaResult> {
    const ms = now.getTime();
    for (const [k, v] of this.quota) if (v.userId === userId && v.start < ms - QUOTA_KEEP_MS) this.quota.delete(k);
    for (const r of rules) {
      const len = r.windowSec * 1000;
      const start = Math.floor(ms / len) * len;
      const key = userId + "\n" + r.bucket + "\n" + start;
      const row = this.quota.get(key);
      if ((row?.count ?? 0) >= r.limit) return { ok: false, bucket: r.bucket, retryAfterSec: Math.max(1, Math.ceil((start + len - ms) / 1000)) };
      if (row) row.count++; else this.quota.set(key, { userId, start, count: 1 });
    }
    return { ok: true };
  }

  /** Test hook: when set, ping() rejects with it. */
  failPing: Error | null = null;
  async ping(): Promise<void> {
    if (this.failPing) throw this.failPing;
  }

  async appendAudit(userId: string, action: AuditAction, target?: string): Promise<void> {
    this.audit.push({ userId, action, target: target ?? null, at: new Date() });
  }
  async listAudit(userId: string): Promise<AuditEntry[]> {
    return this.audit.filter(r => r.userId === userId).map(({ action, target, at }) => ({ action, target, at }));
  }
  async eraseUser(userId: string): Promise<boolean> {
    if (!this.users.has(userId)) return false;
    for (const p of [...this.projects.values()]) if (p.userId === userId) await this.deleteProject(userId, p.id);
    for (const k of [...this.credentials.keys()]) if (this.credentials.get(k)!.userId === userId) this.credentials.delete(k);
    await this.eraseAiUse(userId);
    for (const [k, v] of this.quota) if (v.userId === userId) this.quota.delete(k);
    this.vaults.delete(userId);
    this.users.delete(userId);
    await this.appendAudit(userId, "account-erased");
    return true;
  }
}
