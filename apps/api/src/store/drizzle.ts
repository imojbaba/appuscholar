import { and, asc, count, desc, eq, gte, isNull, lte, max, ne, sql } from "drizzle-orm";
import { users, projects, documents, documentRevisions, credentials, aiUseLog, vaultKeys, auditLog, type Db } from "@appuscholar/db";
import type { Store, Project, ProjectSummary, ProjectPatch, DocumentSummary, DocumentWithBody, DocumentRevision, RevisionSummary, NewRevision, AuthorKind, Settings, UserRecord, Credential, AiUseEntry, OriginStats, ProjectKind, ProjectStage, AuditAction, AuditEntry, VaultRecord, WrappedDek } from "./types";
import { DekExistsError, VaultExistsError } from "./types";

const APPEND_RETRIES = 2;

/** Postgres unique_violation (23505), whether thrown directly by the driver or wrapped by drizzle in `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export class DrizzleStore implements Store {
  constructor(private d: Db) {}

  private async ownedDoc(userId: string, docId: string, includeDeleted = false) {
    const live = includeDeleted ? undefined : isNull(documents.deletedAt);
    const rows = await this.d.select({ doc: documents, project: projects }).from(documents).innerJoin(projects, eq(projects.id, documents.projectId)).where(and(eq(documents.id, docId), eq(projects.userId, userId), live)).limit(1);
    return rows[0]?.doc ?? null;
  }
  private async latest(docId: string): Promise<{ seq: number; wordCount: number } | null> {
    const rows = await this.d.select({ seq: documentRevisions.seq, wordCount: documentRevisions.wordCount }).from(documentRevisions).where(eq(documentRevisions.documentId, docId)).orderBy(desc(documentRevisions.seq)).limit(1);
    return rows[0] ?? null;
  }
  private toRev(r: typeof documentRevisions.$inferSelect): DocumentRevision {
    return { id: r.id, documentId: r.documentId, seq: r.seq, bodyHtml: r.bodyHtml, authorKind: r.authorKind as AuthorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, originStats: (r.originStats as OriginStats | null) ?? null, keyVersion: r.keyVersion, createdAt: r.createdAt };
  }
  private toVault(v: typeof vaultKeys.$inferSelect): VaultRecord {
    return { passWrapped: v.passWrapped, recoveryWrapped: v.recoveryWrapped, publicKey: v.publicKey, privateKeyWrapped: v.privateKeyWrapped, complete: v.complete, updatedAt: v.updatedAt };
  }
  private toProject(p: typeof projects.$inferSelect): Project {
    return { ...p, kind: p.kind as ProjectKind };
  }
  private toUser(u: typeof users.$inferSelect): UserRecord {
    return { id: u.id, email: u.email, locale: u.locale, settings: u.settings as Settings, activeProjectId: u.activeProjectId, termsAcceptedAt: u.termsAcceptedAt, ageConfirmed: u.ageConfirmed };
  }
  private async summary(doc: typeof documents.$inferSelect): Promise<DocumentSummary | null> {
    const r = await this.latest(doc.id);
    if (!r) return null;
    return { id: doc.id, projectId: doc.projectId, title: doc.title, kind: doc.kind, currentSeq: r.seq, wordCount: r.wordCount, createdAt: doc.createdAt, updatedAt: doc.updatedAt, deletedAt: doc.deletedAt, deks: doc.deks };
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const rows = await this.d.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ? this.toUser(rows[0]) : null;
  }
  async ensureUser(userId: string, email: string): Promise<UserRecord> {
    await this.d.insert(users).values({ id: userId, email }).onConflictDoNothing();
    const u = await this.getUser(userId);
    if (!u) throw new Error(`cannot ensure user ${userId}: email already belongs to another user`);
    return u;
  }
  async updateSettings(userId: string, patch: Settings): Promise<Settings> {
    // jsonb || jsonb is a shallow merge, and JSON.stringify drops undefined keys, so absent keys stay untouched and arrays replace.
    const rows = await this.d.update(users).set({ settings: sql`${users.settings} || ${JSON.stringify(patch)}::jsonb` }).where(eq(users.id, userId)).returning({ settings: users.settings });
    if (!rows[0]) throw new Error(`unknown user ${userId}`);
    return rows[0].settings as Settings;
  }
  async setActiveProject(userId: string, projectId: string | null): Promise<boolean> {
    if (projectId !== null && !(await this.getProject(userId, projectId))) return false;
    const rows = await this.d.update(users).set({ activeProjectId: projectId }).where(eq(users.id, userId)).returning({ id: users.id });
    return rows.length > 0;
  }
  async acceptTerms(userId: string, at: Date): Promise<void> {
    await this.d.update(users).set({ termsAcceptedAt: at, ageConfirmed: true }).where(eq(users.id, userId));
  }

  async createProject(userId: string, title: string, stage?: ProjectStage): Promise<Project> {
    const [p] = await this.d.insert(projects).values(stage ? { userId, title, stage } : { userId, title }).returning();
    return this.toProject(p!);
  }
  async getScratchProject(userId: string): Promise<Project> {
    const find = () => this.d.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.kind, "scratch"))).orderBy(asc(projects.createdAt), asc(projects.id)).limit(1);
    const existing = (await find())[0];
    if (existing) return this.toProject(existing);
    await this.d.insert(projects).values({ userId, title: "Scratch space", kind: "scratch" });
    return this.toProject((await find())[0]!);
  }
  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const rows = await this.d
      .select({ project: projects, documentCount: count(documents.id), lastEditedAt: max(documents.updatedAt) })
      .from(projects)
      .leftJoin(documents, and(eq(documents.projectId, projects.id), isNull(documents.deletedAt)))
      .where(and(eq(projects.userId, userId), ne(projects.kind, "scratch")))
      .groupBy(projects.id)
      .orderBy(sql`case when ${projects.status} = 'complete' then 1 else 0 end`, desc(sql`coalesce(max(${documents.updatedAt}), ${projects.createdAt})`));
    return rows.map(r => ({ ...this.toProject(r.project), documentCount: Number(r.documentCount), lastEditedAt: r.lastEditedAt ?? null }));
  }
  async updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
    if (!(await this.getProject(userId, id))) return null;
    const set: Partial<typeof projects.$inferInsert> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.stage !== undefined) set.stage = patch.stage;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.contentLang !== undefined) set.contentLang = patch.contentLang;
    if (Object.keys(set).length === 0) return this.getProject(userId, id);
    const [row] = await this.d.update(projects).set(set).where(eq(projects.id, id)).returning();
    return row ? this.toProject(row) : null;
  }
  async deleteProject(userId: string, id: string): Promise<boolean> {
    if (!(await this.getProject(userId, id))) return false;
    const rows = await this.d.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return rows.length > 0;
  }
  async getProject(userId: string, id: string): Promise<Project | null> {
    const rows = await this.d.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
    return rows[0] ? this.toProject(rows[0]) : null;
  }

  async createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision, deks: WrappedDek[] = []): Promise<DocumentWithBody | null> {
    if (!(await this.getProject(userId, projectId))) return null;
    const [doc] = await this.d.insert(documents).values({ projectId, title, kind, deks: deks.map(k => ({ v: k.v, wrapped: k.wrapped })) }).returning();
    const [rev] = await this.d.insert(documentRevisions).values({ documentId: doc!.id, seq: 1, ...first }).returning();
    await this.d.update(documents).set({ currentRevisionId: rev!.id }).where(eq(documents.id, doc!.id));
    return { ...(await this.summary(doc!))!, bodyHtml: rev!.bodyHtml, keyVersion: rev!.keyVersion };
  }
  async listDocuments(userId: string, projectId: string, opts?: { includeDeleted?: boolean }): Promise<DocumentSummary[] | null> {
    if (!(await this.getProject(userId, projectId))) return null;
    const live = opts?.includeDeleted === true ? undefined : isNull(documents.deletedAt);
    const rows = await this.d.select().from(documents).where(and(eq(documents.projectId, projectId), live)).orderBy(desc(documents.updatedAt));
    const sums = await Promise.all(rows.map(r => this.summary(r)));
    return sums.filter((x): x is DocumentSummary => x !== null);
  }
  async getDocument(userId: string, id: string, opts?: { includeDeleted?: boolean }): Promise<DocumentWithBody | null> {
    const doc = await this.ownedDoc(userId, id, opts?.includeDeleted === true);
    if (!doc) return null;
    const rows = await this.d.select().from(documentRevisions).where(eq(documentRevisions.documentId, doc.id)).orderBy(desc(documentRevisions.seq)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: doc.id, projectId: doc.projectId, title: doc.title, kind: doc.kind,
      currentSeq: r.seq, wordCount: r.wordCount, createdAt: doc.createdAt, updatedAt: doc.updatedAt, deletedAt: doc.deletedAt, deks: doc.deks, bodyHtml: r.bodyHtml, keyVersion: r.keyVersion
    };
  }
  async renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null> {
    const doc = await this.ownedDoc(userId, id);
    if (!doc) return null;
    const [updated] = await this.d.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, id)).returning();
    return this.summary(updated!);
  }
  async moveDocument(userId: string, documentId: string, projectId: string): Promise<DocumentSummary | null> {
    if (!(await this.ownedDoc(userId, documentId)) || !(await this.getProject(userId, projectId))) return null;
    const [updated] = await this.d.update(documents).set({ projectId }).where(eq(documents.id, documentId)).returning();
    return this.summary(updated!);
  }
  async setDocumentKind(userId: string, id: string, kind: string): Promise<DocumentSummary | null> {
    if (!(await this.ownedDoc(userId, id))) return null;
    const [updated] = await this.d.update(documents).set({ kind }).where(eq(documents.id, id)).returning();
    return this.summary(updated!);
  }
  async softDeleteDocument(userId: string, id: string): Promise<"deleted" | "only-document" | null> {
    const doc = await this.ownedDoc(userId, id);
    if (!doc) return null;
    const [live] = await this.d.select({ n: count() }).from(documents).where(and(eq(documents.projectId, doc.projectId), isNull(documents.deletedAt)));
    if (Number(live?.n ?? 0) <= 1) return "only-document";
    await this.d.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id));
    return "deleted";
  }
  async restoreDeletedDocument(userId: string, id: string): Promise<DocumentSummary | null> {
    if (!(await this.ownedDoc(userId, id, true))) return null;
    const [updated] = await this.d.update(documents).set({ deletedAt: null }).where(eq(documents.id, id)).returning();
    return this.summary(updated!);
  }

  async appendRevision(userId: string, documentId: string, rev: NewRevision): Promise<DocumentRevision | null> {
    const doc = await this.ownedDoc(userId, documentId);
    if (!doc) return null;
    // Two concurrent appends can compute the same next seq; the (document_id, seq) unique index rejects the loser,
    // which then recomputes seq from the new max. Revisions stay append-only either way.
    let row: typeof documentRevisions.$inferSelect | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        [row] = await this.d.insert(documentRevisions).values({
          documentId, ...rev,
          seq: sql`(select coalesce(max(${documentRevisions.seq}), 0) + 1 from ${documentRevisions} where ${documentRevisions.documentId} = ${documentId})`
        }).returning();
        break;
      } catch (err) {
        if (attempt >= APPEND_RETRIES || !isUniqueViolation(err)) throw err;
      }
    }
    await this.d.update(documents).set({ currentRevisionId: row!.id, updatedAt: row!.createdAt }).where(eq(documents.id, documentId));
    return this.toRev(row!);
  }
  async listRevisions(userId: string, documentId: string, opts?: { includeDeleted?: boolean }): Promise<RevisionSummary[] | null> {
    if (!(await this.ownedDoc(userId, documentId, opts?.includeDeleted === true))) return null;
    const rows = await this.d.select({ id: documentRevisions.id, documentId: documentRevisions.documentId, seq: documentRevisions.seq, authorKind: documentRevisions.authorKind, authorLabel: documentRevisions.authorLabel, wordCount: documentRevisions.wordCount, originStats: documentRevisions.originStats, keyVersion: documentRevisions.keyVersion, createdAt: documentRevisions.createdAt }).from(documentRevisions).where(eq(documentRevisions.documentId, documentId)).orderBy(desc(documentRevisions.seq));
    return rows.map(r => ({ ...r, authorKind: r.authorKind as AuthorKind, originStats: (r.originStats as OriginStats | null) ?? null }));
  }
  async getRevision(userId: string, documentId: string, seq: number, opts?: { includeDeleted?: boolean }): Promise<DocumentRevision | null> {
    if (!(await this.ownedDoc(userId, documentId, opts?.includeDeleted === true))) return null;
    const rows = await this.d.select().from(documentRevisions).where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.seq, seq))).limit(1);
    return rows[0] ? this.toRev(rows[0]) : null;
  }

  async putCredential(userId: string, provider: string, encryptedKey: string): Promise<void> {
    await this.d.insert(credentials).values({ userId, provider, encryptedKey }).onConflictDoUpdate({ target: [credentials.userId, credentials.provider], set: { encryptedKey, updatedAt: new Date() } });
  }
  async getCredentials(userId: string): Promise<Credential[]> {
    return this.d.select({ provider: credentials.provider, encryptedKey: credentials.encryptedKey, updatedAt: credentials.updatedAt }).from(credentials).where(eq(credentials.userId, userId)).orderBy(asc(credentials.provider));
  }
  async deleteCredential(userId: string, provider: string): Promise<boolean> {
    const rows = await this.d.delete(credentials).where(and(eq(credentials.userId, userId), eq(credentials.provider, provider))).returning({ provider: credentials.provider });
    return rows.length > 0;
  }

  async appendAiUse(userId: string, projectId: string | null, e: AiUseEntry): Promise<void> {
    await this.d.insert(aiUseLog).values({ userId, projectId, day: e.d, provider: e.p, model: e.m, kind: e.k, grp: e.g });
  }
  async listAiUse(userId: string, from?: string, to?: string): Promise<AiUseEntry[]> {
    const rows = await this.d.select().from(aiUseLog)
      .where(and(eq(aiUseLog.userId, userId), from === undefined ? undefined : gte(aiUseLog.day, from), to === undefined ? undefined : lte(aiUseLog.day, to)))
      .orderBy(asc(aiUseLog.day), asc(aiUseLog.createdAt));
    return rows.map(r => ({ d: r.day, p: r.provider, m: r.model, k: r.kind, g: r.grp as AiUseEntry["g"] }));
  }
  async eraseAiUse(userId: string): Promise<void> {
    await this.d.delete(aiUseLog).where(eq(aiUseLog.userId, userId));
  }

  async getVault(userId: string): Promise<VaultRecord | null> {
    const rows = await this.d.select().from(vaultKeys).where(eq(vaultKeys.userId, userId)).limit(1);
    return rows[0] ? this.toVault(rows[0]) : null;
  }
  async putVault(userId: string, v: Omit<VaultRecord, "complete" | "updatedAt">): Promise<VaultRecord> {
    const rows = await this.d.insert(vaultKeys).values({ userId, passWrapped: v.passWrapped, recoveryWrapped: v.recoveryWrapped, publicKey: v.publicKey, privateKeyWrapped: v.privateKeyWrapped }).onConflictDoNothing().returning();
    if (!rows[0]) throw new VaultExistsError();
    return this.toVault(rows[0]);
  }
  async updateVaultWraps(userId: string, patch: { passWrapped?: string; recoveryWrapped?: string }): Promise<VaultRecord | null> {
    const set: Partial<typeof vaultKeys.$inferInsert> = { updatedAt: new Date() };
    if (patch.passWrapped !== undefined) set.passWrapped = patch.passWrapped;
    if (patch.recoveryWrapped !== undefined) set.recoveryWrapped = patch.recoveryWrapped;
    const rows = await this.d.update(vaultKeys).set(set).where(eq(vaultKeys.userId, userId)).returning();
    return rows[0] ? this.toVault(rows[0]) : null;
  }
  async countPlaintextRevisions(userId: string): Promise<number> {
    const [row] = await this.d.select({ n: count() }).from(documentRevisions)
      .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(and(eq(projects.userId, userId), eq(documentRevisions.keyVersion, 0)));
    return Number(row?.n ?? 0);
  }
  async markVaultComplete(userId: string): Promise<boolean> {
    const rows = await this.d.update(vaultKeys).set({ complete: true, updatedAt: new Date() }).where(eq(vaultKeys.userId, userId)).returning({ userId: vaultKeys.userId });
    return rows.length > 0;
  }

  async addDek(userId: string, documentId: string, dek: WrappedDek): Promise<DocumentSummary | null> {
    if (!(await this.ownedDoc(userId, documentId, true))) return null;
    // One conditional statement, so two concurrent adds of the same `v` cannot both land.
    const entry = JSON.stringify([{ v: dek.v, wrapped: dek.wrapped }]);
    const rows = await this.d.update(documents)
      .set({ deks: sql`${documents.deks} || ${entry}::jsonb` })
      .where(and(eq(documents.id, documentId), sql`not exists (select 1 from jsonb_array_elements(${documents.deks}) e where (e->>'v')::int = ${dek.v})`))
      .returning();
    if (!rows[0]) throw new DekExistsError(dek.v);
    return this.summary(rows[0]);
  }
  async rewriteRevision(userId: string, documentId: string, seq: number, patch: { bodyHtml: string; keyVersion: number }): Promise<RevisionSummary | null> {
    if (!(await this.ownedDoc(userId, documentId, true))) return null;
    const rows = await this.d.update(documentRevisions).set({ bodyHtml: patch.bodyHtml, keyVersion: patch.keyVersion }).where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.seq, seq))).returning();
    if (!rows[0]) return null;
    const r = rows[0];
    return { id: r.id, documentId: r.documentId, seq: r.seq, authorKind: r.authorKind as AuthorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, originStats: (r.originStats as OriginStats | null) ?? null, keyVersion: r.keyVersion, createdAt: r.createdAt };
  }

  async appendAudit(userId: string, action: AuditAction, target?: string): Promise<void> {
    await this.d.insert(auditLog).values({ userId, action, target: target ?? null });
  }
  async listAudit(userId: string): Promise<AuditEntry[]> {
    const rows = await this.d.select({ action: auditLog.action, target: auditLog.target, at: auditLog.at }).from(auditLog).where(eq(auditLog.userId, userId)).orderBy(asc(auditLog.at));
    return rows.map(r => ({ action: r.action as AuditAction, target: r.target, at: r.at }));
  }
  async eraseUser(userId: string): Promise<boolean> {
    // Atomic without an interactive transaction: the neon-http driver used in production has none, but a single
    // statement with data-modifying CTEs is one atomic unit on every driver. The audit row is inserted only if the
    // user row was actually deleted, and audit_log has no foreign key, so earlier audit rows are untouched.
    const res = await this.d.execute(sql`
      with
        c as (delete from ${credentials} where ${credentials.userId} = ${userId}),
        l as (delete from ${aiUseLog} where ${aiUseLog.userId} = ${userId}),
        v as (delete from ${vaultKeys} where ${vaultKeys.userId} = ${userId}),
        p as (delete from ${projects} where ${projects.userId} = ${userId}),
        u as (delete from ${users} where ${users.id} = ${userId} returning ${users.id} as id),
        a as (insert into ${auditLog} (id, user_id, action) select ${crypto.randomUUID()}, id, 'account-erased' from u)
      select id from u`);
    const rows = Array.isArray(res) ? res : (res as { rows: unknown[] }).rows;
    return rows.length > 0;
  }
}
