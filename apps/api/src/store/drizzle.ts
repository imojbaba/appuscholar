import { and, desc, eq, sql } from "drizzle-orm";
import { projects, documents, documentRevisions, type Db } from "@appuscholar/db";
import type { Store, Project, DocumentSummary, DocumentWithBody, DocumentRevision, RevisionSummary, NewRevision, AuthorKind } from "./types";

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

  private async ownedDoc(userId: string, docId: string) {
    const rows = await this.d.select({ doc: documents, project: projects }).from(documents).innerJoin(projects, eq(projects.id, documents.projectId)).where(and(eq(documents.id, docId), eq(projects.userId, userId))).limit(1);
    return rows[0]?.doc ?? null;
  }
  private async latest(docId: string): Promise<{ seq: number; wordCount: number } | null> {
    const rows = await this.d.select({ seq: documentRevisions.seq, wordCount: documentRevisions.wordCount }).from(documentRevisions).where(eq(documentRevisions.documentId, docId)).orderBy(desc(documentRevisions.seq)).limit(1);
    return rows[0] ?? null;
  }
  private toRev(r: typeof documentRevisions.$inferSelect): DocumentRevision {
    return { id: r.id, documentId: r.documentId, seq: r.seq, bodyHtml: r.bodyHtml, authorKind: r.authorKind as AuthorKind, authorLabel: r.authorLabel, wordCount: r.wordCount, createdAt: r.createdAt };
  }
  private async summary(doc: typeof documents.$inferSelect): Promise<DocumentSummary | null> {
    const r = await this.latest(doc.id);
    if (!r) return null;
    return { id: doc.id, projectId: doc.projectId, title: doc.title, kind: doc.kind, currentSeq: r.seq, wordCount: r.wordCount, updatedAt: doc.updatedAt };
  }

  async createProject(userId: string, title: string): Promise<Project> {
    const [p] = await this.d.insert(projects).values({ userId, title }).returning();
    return p!;
  }
  async listProjects(userId: string): Promise<Project[]> {
    return this.d.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
  }
  async getProject(userId: string, id: string): Promise<Project | null> {
    const rows = await this.d.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
    return rows[0] ?? null;
  }

  async createDocument(userId: string, projectId: string, title: string, kind: string, first: NewRevision): Promise<DocumentWithBody | null> {
    if (!(await this.getProject(userId, projectId))) return null;
    const [doc] = await this.d.insert(documents).values({ projectId, title, kind }).returning();
    const [rev] = await this.d.insert(documentRevisions).values({ documentId: doc!.id, seq: 1, ...first }).returning();
    await this.d.update(documents).set({ currentRevisionId: rev!.id }).where(eq(documents.id, doc!.id));
    return { ...(await this.summary(doc!))!, bodyHtml: rev!.bodyHtml };
  }
  async listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null> {
    if (!(await this.getProject(userId, projectId))) return null;
    const rows = await this.d.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.updatedAt));
    const sums = await Promise.all(rows.map(r => this.summary(r)));
    return sums.filter((x): x is DocumentSummary => x !== null);
  }
  async getDocument(userId: string, id: string): Promise<DocumentWithBody | null> {
    const doc = await this.ownedDoc(userId, id);
    if (!doc) return null;
    const rows = await this.d.select().from(documentRevisions).where(eq(documentRevisions.documentId, doc.id)).orderBy(desc(documentRevisions.seq)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: doc.id, projectId: doc.projectId, title: doc.title, kind: doc.kind,
      currentSeq: r.seq, wordCount: r.wordCount, updatedAt: doc.updatedAt, bodyHtml: r.bodyHtml
    };
  }
  async renameDocument(userId: string, id: string, title: string): Promise<DocumentSummary | null> {
    const doc = await this.ownedDoc(userId, id);
    if (!doc) return null;
    const [updated] = await this.d.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, id)).returning();
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
  async listRevisions(userId: string, documentId: string): Promise<RevisionSummary[] | null> {
    if (!(await this.ownedDoc(userId, documentId))) return null;
    const rows = await this.d.select({ id: documentRevisions.id, documentId: documentRevisions.documentId, seq: documentRevisions.seq, authorKind: documentRevisions.authorKind, authorLabel: documentRevisions.authorLabel, wordCount: documentRevisions.wordCount, createdAt: documentRevisions.createdAt }).from(documentRevisions).where(eq(documentRevisions.documentId, documentId)).orderBy(desc(documentRevisions.seq));
    return rows.map(r => ({ ...r, authorKind: r.authorKind as AuthorKind }));
  }
  async getRevision(userId: string, documentId: string, seq: number): Promise<DocumentRevision | null> {
    if (!(await this.ownedDoc(userId, documentId))) return null;
    const rows = await this.d.select().from(documentRevisions).where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.seq, seq))).limit(1);
    return rows[0] ? this.toRev(rows[0]) : null;
  }
}
