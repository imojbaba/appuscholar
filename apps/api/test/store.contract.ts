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
  });
}
