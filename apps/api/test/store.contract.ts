import { describe, it, expect, beforeEach } from "vitest";
import { DekExistsError, VaultExistsError, type Store } from "../src/store/types";

export type ContractEnv = { store: Store; users: { a: string; b: string } };

export function storeContract(name: string, make: () => Promise<ContractEnv>) {
  describe(`Store contract: ${name}`, () => {
    let s: Store;
    let a: string;
    let b: string;
    beforeEach(async () => { const env = await make(); s = env.store; a = env.users.a; b = env.users.b; });

    it("creates and lists projects per user", async () => {
      const p = await s.createProject(a, "Sleep");
      expect(p.title).toBe("Sleep");
      expect((await s.listProjects(a)).map(x => x.id)).toEqual([p.id]);
      expect(await s.listProjects(b)).toEqual([]);
      expect(await s.getProject(b, p.id)).toBeNull();
    });

    it("creates a document with revision 1 and reads it back", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 });
      expect(d).not.toBeNull();
      expect(d!.currentSeq).toBe(1);
      expect(d!.createdAt).toBeInstanceOf(Date);
      expect((await s.listDocuments(a, p.id))![0]!.createdAt).toBeInstanceOf(Date);
      const got = await s.getDocument(a, d!.id);
      expect(got?.bodyHtml).toBe("");
      expect(await s.getDocument(b, d!.id)).toBeNull();
      expect(await s.createDocument(b, p.id, "x", "draft", { bodyHtml: "", authorKind: "web", authorLabel: b, wordCount: 0, keyVersion: 0 })).toBeNull();
    });

    it("appends revisions with increasing seq and lists newest first", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 }))!;
      const r2 = await s.appendRevision(a, d.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: a, wordCount: 1, keyVersion: 0 });
      const r3 = await s.appendRevision(a, d.id, { bodyHtml: "<p>a b</p>", authorKind: "copilot", authorLabel: "Claude", wordCount: 2, keyVersion: 0 });
      expect(r2?.seq).toBe(2);
      expect(r3?.seq).toBe(3);
      const list = await s.listRevisions(a, d.id);
      expect(list?.map(r => r.seq)).toEqual([3, 2, 1]);
      expect((await s.getDocument(a, d.id))?.bodyHtml).toBe("<p>a b</p>");
      expect((await s.getRevision(a, d.id, 2))?.bodyHtml).toBe("<p>a</p>");
      expect(await s.appendRevision(b, d.id, { bodyHtml: "x", authorKind: "web", authorLabel: b, wordCount: 1, keyVersion: 0 })).toBeNull();
    });

    it("renames a document", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 }))!;
      expect((await s.renameDocument(a, d.id, "Final"))?.title).toBe("Final");
      expect(await s.renameDocument(b, d.id, "Nope")).toBeNull();
    });

    it("lists projects with document count and last edited time", async () => {
      const p = await s.createProject(a, "Sleep");
      let list = await s.listProjects(a);
      expect(list[0]?.documentCount).toBe(0);
      expect(list[0]?.lastEditedAt).toBeNull();
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 }))!;
      await s.appendRevision(a, d.id, { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: a, wordCount: 1, keyVersion: 0 });
      list = await s.listProjects(a);
      expect(list[0]?.documentCount).toBe(1);
      expect(list[0]?.lastEditedAt).toBeInstanceOf(Date);
    });

    it("updates title, stage and status, sorts complete projects last, and refuses other users", async () => {
      const p = await s.createProject(a, "Sleep");
      const q = await s.createProject(a, "Memory");
      expect(p.status).toBe("active");
      const u = await s.updateProject(a, p.id, { title: "Sleep and memory", stage: "lit" });
      expect(u?.title).toBe("Sleep and memory");
      expect(u?.stage).toBe("lit");
      expect((await s.getProject(a, p.id))?.stage).toBe("lit");
      await s.updateProject(a, q.id, { status: "complete" });
      const list = await s.listProjects(a);
      expect(list.map(x => x.id)).toEqual([p.id, q.id]);
      expect(list[1]?.status).toBe("complete");
      expect(await s.updateProject(b, p.id, { title: "Nope" })).toBeNull();
    });

    it("orders active projects by most recent edit (falling back to creation), complete ones last", async () => {
      const tick = () => new Promise(r => setTimeout(r, 15));
      const older = await s.createProject(a, "Older");
      await tick();
      const newer = await s.createProject(a, "Newer");
      await tick();
      const done = await s.createProject(a, "Done");
      await s.updateProject(a, done.id, { status: "complete" });
      expect((await s.listProjects(a)).map(x => x.id)).toEqual([newer.id, older.id, done.id]);
      await tick();
      const d = (await s.createDocument(a, older.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 }))!;
      await s.appendRevision(a, d.id, { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: a, wordCount: 1, keyVersion: 0 });
      expect((await s.listProjects(a)).map(x => x.id)).toEqual([older.id, newer.id, done.id]);
    });

    it("deletes a project with its documents, and refuses other users", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0, keyVersion: 0 }))!;
      expect(await s.deleteProject(b, p.id)).toBe(false);
      expect(await s.deleteProject(a, p.id)).toBe(true);
      expect(await s.getProject(a, p.id)).toBeNull();
      expect(await s.getDocument(a, d.id)).toBeNull();
      expect(await s.deleteProject(a, p.id)).toBe(false);
    });

    const first = { bodyHtml: "", authorKind: "web", authorLabel: "", wordCount: 0, keyVersion: 0 } as const;
    const em = (id: string) => `${id}@contract.local`;

    it("ensures a user row and merges settings", async () => {
      const id = "u-" + crypto.randomUUID();
      const u = await s.ensureUser(id, em(id));
      expect(u).toMatchObject({ id, email: em(id), locale: "en", settings: {}, activeProjectId: null, termsAcceptedAt: null, ageConfirmed: false });
      await s.updateSettings(id, { lang: "hi", draftFirst: true, stageGroupsCollapsed: ["lit", "design"] });
      const merged = await s.updateSettings(id, { provider: "groq", stageGroupsCollapsed: ["writing"] });
      expect(merged).toEqual({ lang: "hi", draftFirst: true, provider: "groq", stageGroupsCollapsed: ["writing"] });
      const untouched = await s.updateSettings(id, { lang: undefined });
      expect(untouched.lang).toBe("hi");
      expect((await s.getUser(id))?.settings).toEqual(merged);
    });

    it("ensureUser is idempotent and keeps settings and terms", async () => {
      await s.ensureUser(a, em(a));
      await s.updateSettings(a, { field: "biology" });
      await s.acceptTerms(a, new Date("2026-10-01T00:00:00Z"));
      const again = await s.ensureUser(a, "other@contract.local");
      expect(again.settings).toEqual({ field: "biology" });
      expect(again.termsAcceptedAt).toEqual(new Date("2026-10-01T00:00:00Z"));
      expect(again.ageConfirmed).toBe(true);
      expect(again.email).toBe(em(a));
    });

    it("returns null for an unknown user", async () => {
      expect(await s.getUser("u-" + crypto.randomUUID())).toBeNull();
    });

    it("sets the active project only if the user owns it", async () => {
      await s.ensureUser(a, em(a));
      await s.ensureUser(b, em(b));
      const p = await s.createProject(a, "T");
      expect(await s.setActiveProject(b, p.id)).toBe(false);
      expect(await s.setActiveProject(a, p.id)).toBe(true);
      expect((await s.getUser(a))?.activeProjectId).toBe(p.id);
      expect(await s.setActiveProject(a, null)).toBe(true);
      expect((await s.getUser(a))?.activeProjectId).toBeNull();
    });

    it("creates one scratch project per user and hides it from the list", async () => {
      await s.ensureUser(a, em(a));
      const x = await s.getScratchProject(a);
      const y = await s.getScratchProject(a);
      expect(x.id).toBe(y.id);
      expect(x.kind).toBe("scratch");
      expect(x.title).toBe("Scratch space");
      expect((await s.listProjects(a)).find(p => p.id === x.id)).toBeUndefined();
      expect((await s.createProject(a, "T")).kind).toBe("research");
    });

    it("moves a document into another project of the same user only", async () => {
      await s.ensureUser(a, em(a));
      await s.ensureUser(b, em(b));
      const scratch = await s.getScratchProject(a);
      const p = await s.createProject(a, "Thesis");
      const other = await s.createProject(b, "Theirs");
      const d = await s.createDocument(a, scratch.id, "Draft", "draft", { ...first, bodyHtml: "<p>x</p>", authorLabel: em(a), wordCount: 1, keyVersion: 0 });
      expect(await s.moveDocument(a, d!.id, other.id)).toBeNull();
      expect((await s.getDocument(a, d!.id))?.projectId).toBe(scratch.id);
      expect(await s.moveDocument(b, d!.id, other.id)).toBeNull();
      expect((await s.moveDocument(a, d!.id, p.id))?.projectId).toBe(p.id);
      expect((await s.listDocuments(a, p.id))!.map(x => x.id)).toEqual([d!.id]);
      expect((await s.listDocuments(a, scratch.id))).toEqual([]);
    });

    it("changes the kind of a document, for its owner only", async () => {
      const p = await s.createProject(a, "T");
      const d = (await s.createDocument(a, p.id, "A", "draft", first))!;
      expect((await s.setDocumentKind(a, d.id, "notes"))?.kind).toBe("notes");
      expect((await s.getDocument(a, d.id))?.kind).toBe("notes");
      expect(await s.setDocumentKind(b, d.id, "draft")).toBeNull();
    });

    it("soft-deletes all but the last document and restores", async () => {
      const p = await s.createProject(a, "T");
      const x = (await s.createDocument(a, p.id, "A", "draft", first))!;
      expect(await s.softDeleteDocument(a, x.id)).toBe("only-document");
      const y = (await s.createDocument(a, p.id, "B", "draft", first))!;
      expect(await s.softDeleteDocument(b, x.id)).toBeNull();
      expect(await s.softDeleteDocument(a, x.id)).toBe("deleted");
      expect((await s.listDocuments(a, p.id))!.map(d => d.id)).toEqual([y.id]);
      expect(await s.getDocument(a, x.id)).toBeNull();
      expect(await s.renameDocument(a, x.id, "Z")).toBeNull();
      expect(await s.appendRevision(a, x.id, first)).toBeNull();
      expect(await s.softDeleteDocument(a, y.id)).toBe("only-document");
      expect(await s.restoreDeletedDocument(b, x.id)).toBeNull();
      expect((await s.restoreDeletedDocument(a, x.id))?.id).toBe(x.id);
      expect((await s.listDocuments(a, p.id))!.length).toBe(2);
      expect((await s.getDocument(a, x.id))?.id).toBe(x.id);
    });

    it("keeps soft-deleted documents out of the project document count", async () => {
      const p = await s.createProject(a, "T");
      const x = (await s.createDocument(a, p.id, "A", "draft", first))!;
      await s.createDocument(a, p.id, "B", "draft", first);
      await s.softDeleteDocument(a, x.id);
      expect((await s.listProjects(a))[0]?.documentCount).toBe(1);
    });

    it("stores credentials as opaque blobs and lists per user", async () => {
      await s.ensureUser(a, em(a));
      await s.ensureUser(b, em(b));
      await s.putCredential(a, "gemini", "c2FsdA.aXY.Y3Q");
      await s.putCredential(a, "gemini", "c2FsdA.aXY.Y3Qy");
      await s.putCredential(b, "gemini", "other");
      const creds = await s.getCredentials(a);
      expect(creds.map(c => [c.provider, c.encryptedKey])).toEqual([["gemini", "c2FsdA.aXY.Y3Qy"]]);
      expect(creds[0]?.updatedAt).toBeInstanceOf(Date);
      expect(await s.deleteCredential(b, "groq")).toBe(false);
      expect(await s.deleteCredential(a, "gemini")).toBe(true);
      expect(await s.getCredentials(a)).toEqual([]);
      expect((await s.getCredentials(b)).length).toBe(1);
    });

    it("keeps an AI-use log of date, provider, model and kind only, filtered by date", async () => {
      await s.ensureUser(a, em(a));
      await s.ensureUser(b, em(b));
      const one = { d: "2026-10-01", p: "gemini", m: "gemini-3.8-flash", k: "continuing my draft", g: "text" } as const;
      const two = { d: "2026-10-15", p: "groq", m: "openai/gpt-oss-120b", k: "grammar and polish", g: "text" } as const;
      await s.appendAiUse(a, null, one);
      await s.appendAiUse(a, null, two);
      await s.appendAiUse(b, null, one);
      expect(await s.listAiUse(a)).toEqual([one, two]);
      expect(await s.listAiUse(a, "2026-10-10", "2026-10-31")).toEqual([two]);
      expect(await s.listAiUse(a, undefined, "2026-10-01")).toEqual([one]);
      await s.eraseAiUse(a);
      expect(await s.listAiUse(a)).toEqual([]);
      expect((await s.listAiUse(b)).length).toBe(1);
    });

    it("stores origin stats on a revision and returns them in summaries", async () => {
      const p = await s.createProject(a, "T");
      const d = (await s.createDocument(a, p.id, "A", "draft", first))!;
      const stats = { typed: 1, ai: 2, passages: 1, kept: 1, edited: 0, unknown: 0 };
      await s.appendRevision(a, d.id, { bodyHtml: "<p>a <span class=\"ai-ins\" data-h=\"z\">b c</span></p>", authorKind: "web", authorLabel: "", wordCount: 3, keyVersion: 0, originStats: stats });
      const revs = (await s.listRevisions(a, d.id))!;
      expect(revs[0]!.originStats).toEqual(stats);
      expect(revs[1]!.originStats).toBeNull();
      expect((await s.getRevision(a, d.id, 2))?.originStats).toEqual(stats);
      expect((await s.getRevision(a, d.id, 1))?.originStats).toBeNull();
    });

    it("updates a project's content language", async () => {
      const p = await s.createProject(a, "T");
      expect((await s.updateProject(a, p.id, { contentLang: "hi" }))?.contentLang).toBe("hi");
      expect((await s.getProject(a, p.id))?.contentLang).toBe("hi");
    });

    it("vault record: create once, update wraps, mark complete", async () => {
      expect(await s.getVault(a)).toBeNull();
      const v = await s.putVault(a, { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", publicKey: "pk", privateKeyWrapped: "i.p" });
      expect(v.complete).toBe(false);
      await expect(s.putVault(a, { passWrapped: "x", recoveryWrapped: "y", publicKey: "z", privateKeyWrapped: "w" })).rejects.toBeInstanceOf(VaultExistsError);
      expect((await s.updateVaultWraps(a, { passWrapped: "s2.i2.c2" }))!.passWrapped).toBe("s2.i2.c2");
      expect(await s.markVaultComplete(a)).toBe(true);
      expect((await s.getVault(a))!.complete).toBe(true);
      expect(await s.getVault(b)).toBeNull();
    });

    it("revisions carry a key version and deks attach to the document", async () => {
      const p = await s.createProject(a, "P");
      const d = (await s.createDocument(a, p.id, "D", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "t", wordCount: 1, keyVersion: 0 }))!;
      expect(d.keyVersion).toBe(0);
      expect(d.deks).toEqual([]);
      expect((await s.addDek(a, d.id, { v: 1, wrapped: "i.k" }))!.deks).toEqual([{ v: 1, wrapped: "i.k" }]);
      await expect(s.addDek(a, d.id, { v: 1, wrapped: "dup" })).rejects.toThrow(DekExistsError);
      const r = (await s.appendRevision(a, d.id, { bodyHtml: "aXYZ.bQ", authorKind: "web", authorLabel: "t", wordCount: 9, keyVersion: 1 }))!;
      expect(r.keyVersion).toBe(1);
      expect((await s.getDocument(a, d.id))!.bodyHtml).toBe("aXYZ.bQ");
      const rw = (await s.rewriteRevision(a, d.id, 1, { bodyHtml: "cT.dU", keyVersion: 1 }))!;
      expect(rw.keyVersion).toBe(1);
      expect((await s.getRevision(a, d.id, 1))!.bodyHtml).toBe("cT.dU");
      expect(await s.rewriteRevision(b, d.id, 1, { bodyHtml: "no", keyVersion: 1 })).toBeNull();
    });

    it("soft-deleted documents still take deks and rewrites (the vault migration reaches them), foreign users never do", async () => {
      const p = await s.createProject(a, "P");
      const rev = { bodyHtml: "<p>x</p>", authorKind: "web" as const, authorLabel: "t", wordCount: 1, keyVersion: 0 };
      await s.createDocument(a, p.id, "Keep", "draft", rev);
      const gone = (await s.createDocument(a, p.id, "Gone", "draft", rev))!;
      expect(await s.softDeleteDocument(a, gone.id)).toBe("deleted");
      expect(await s.getDocument(a, gone.id)).toBeNull();
      expect((await s.getDocument(a, gone.id, { includeDeleted: true }))!.id).toBe(gone.id);
      expect(await s.getDocument(b, gone.id, { includeDeleted: true })).toBeNull();
      expect((await s.addDek(a, gone.id, { v: 1, wrapped: "i.k" }))!.deks).toEqual([{ v: 1, wrapped: "i.k" }]);
      const rw = (await s.rewriteRevision(a, gone.id, 1, { bodyHtml: "cT.dU", keyVersion: 1 }))!;
      expect(rw.keyVersion).toBe(1);
      expect((await s.getDocument(a, gone.id, { includeDeleted: true }))).toMatchObject({ bodyHtml: "cT.dU", keyVersion: 1 });
      expect(await s.addDek(b, gone.id, { v: 2, wrapped: "no" })).toBeNull();
      expect(await s.rewriteRevision(b, gone.id, 1, { bodyHtml: "no", keyVersion: 1 })).toBeNull();
    });

    it("createDocument attaches the given deks together with the first revision", async () => {
      const p = await s.createProject(a, "P");
      const d = (await s.createDocument(a, p.id, "Enc", "draft", { bodyHtml: "aA.bB", authorKind: "web", authorLabel: "t", wordCount: 2, keyVersion: 1 }, [{ v: 1, wrapped: "i.k" }]))!;
      expect(d.deks).toEqual([{ v: 1, wrapped: "i.k" }]);
      expect(d.keyVersion).toBe(1);
      expect((await s.getDocument(a, d.id))!.deks).toEqual([{ v: 1, wrapped: "i.k" }]);
      const plain = (await s.createDocument(a, p.id, "Plain", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "t", wordCount: 1, keyVersion: 0 }))!;
      expect(plain.deks).toEqual([]);
    });

    it("audit survives erasure; erasure removes every other row", async () => {
      const p = await s.createProject(a, "P");
      await s.createDocument(a, p.id, "D", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "t", wordCount: 1, keyVersion: 0 });
      await s.putCredential(a, "groq", "s.i.c");
      await s.appendAudit(a, "export");
      expect(await s.eraseUser(a)).toBe(true);
      expect(await s.getUser(a)).toBeNull();
      expect(await s.listProjects(a)).toEqual([]);
      expect(await s.getCredentials(a)).toEqual([]);
      expect((await s.listAudit(a)).map((x) => x.action)).toEqual(["export", "account-erased"]);
      expect(await s.eraseUser(a)).toBe(false);
    });
  });
}
