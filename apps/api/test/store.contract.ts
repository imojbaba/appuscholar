import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "../src/store/types";

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
      const d = await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0 });
      expect(d).not.toBeNull();
      expect(d!.currentSeq).toBe(1);
      const got = await s.getDocument(a, d!.id);
      expect(got?.bodyHtml).toBe("");
      expect(await s.getDocument(b, d!.id)).toBeNull();
      expect(await s.createDocument(b, p.id, "x", "draft", { bodyHtml: "", authorKind: "web", authorLabel: b, wordCount: 0 })).toBeNull();
    });

    it("appends revisions with increasing seq and lists newest first", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0 }))!;
      const r2 = await s.appendRevision(a, d.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: a, wordCount: 1 });
      const r3 = await s.appendRevision(a, d.id, { bodyHtml: "<p>a b</p>", authorKind: "copilot", authorLabel: "Claude", wordCount: 2 });
      expect(r2?.seq).toBe(2);
      expect(r3?.seq).toBe(3);
      const list = await s.listRevisions(a, d.id);
      expect(list?.map(r => r.seq)).toEqual([3, 2, 1]);
      expect((await s.getDocument(a, d.id))?.bodyHtml).toBe("<p>a b</p>");
      expect((await s.getRevision(a, d.id, 2))?.bodyHtml).toBe("<p>a</p>");
      expect(await s.appendRevision(b, d.id, { bodyHtml: "x", authorKind: "web", authorLabel: b, wordCount: 1 })).toBeNull();
    });

    it("renames a document", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0 }))!;
      expect((await s.renameDocument(a, d.id, "Final"))?.title).toBe("Final");
      expect(await s.renameDocument(b, d.id, "Nope")).toBeNull();
    });

    it("lists projects with document count and last edited time", async () => {
      const p = await s.createProject(a, "Sleep");
      let list = await s.listProjects(a);
      expect(list[0]?.documentCount).toBe(0);
      expect(list[0]?.lastEditedAt).toBeNull();
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0 }))!;
      await s.appendRevision(a, d.id, { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: a, wordCount: 1 });
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

    it("deletes a project with its documents, and refuses other users", async () => {
      const p = await s.createProject(a, "Sleep");
      const d = (await s.createDocument(a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: a, wordCount: 0 }))!;
      expect(await s.deleteProject(b, p.id)).toBe(false);
      expect(await s.deleteProject(a, p.id)).toBe(true);
      expect(await s.getProject(a, p.id)).toBeNull();
      expect(await s.getDocument(a, d.id)).toBeNull();
      expect(await s.deleteProject(a, p.id)).toBe(false);
    });
  });
}
