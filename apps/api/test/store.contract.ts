import { describe, it, expect, beforeEach } from "vitest";
import type { Store } from "../src/store/types";

export function storeContract(name: string, make: () => Promise<Store>) {
  describe(`Store contract: ${name}`, () => {
    let s: Store;
    beforeEach(async () => { s = await make(); });

    it("creates and lists projects per user", async () => {
      const p = await s.createProject("u1", "Sleep");
      expect(p.title).toBe("Sleep");
      expect((await s.listProjects("u1")).map(x => x.id)).toEqual([p.id]);
      expect(await s.listProjects("u2")).toEqual([]);
      expect(await s.getProject("u2", p.id)).toBeNull();
    });

    it("creates a document with revision 1 and reads it back", async () => {
      const p = await s.createProject("u1", "Sleep");
      const d = await s.createDocument("u1", p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "u1", wordCount: 0 });
      expect(d).not.toBeNull();
      expect(d!.currentSeq).toBe(1);
      const got = await s.getDocument("u1", d!.id);
      expect(got?.bodyHtml).toBe("");
      expect(await s.getDocument("u2", d!.id)).toBeNull();
      expect(await s.createDocument("u2", p.id, "x", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "u2", wordCount: 0 })).toBeNull();
    });

    it("appends revisions with increasing seq and lists newest first", async () => {
      const p = await s.createProject("u1", "Sleep");
      const d = (await s.createDocument("u1", p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "u1", wordCount: 0 }))!;
      const r2 = await s.appendRevision("u1", d.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: "u1", wordCount: 1 });
      const r3 = await s.appendRevision("u1", d.id, { bodyHtml: "<p>a b</p>", authorKind: "copilot", authorLabel: "Claude", wordCount: 2 });
      expect(r2?.seq).toBe(2);
      expect(r3?.seq).toBe(3);
      const list = await s.listRevisions("u1", d.id);
      expect(list?.map(r => r.seq)).toEqual([3, 2, 1]);
      expect((await s.getDocument("u1", d.id))?.bodyHtml).toBe("<p>a b</p>");
      expect((await s.getRevision("u1", d.id, 2))?.bodyHtml).toBe("<p>a</p>");
      expect(await s.appendRevision("u2", d.id, { bodyHtml: "x", authorKind: "web", authorLabel: "u2", wordCount: 1 })).toBeNull();
    });

    it("renames a document", async () => {
      const p = await s.createProject("u1", "Sleep");
      const d = (await s.createDocument("u1", p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "u1", wordCount: 0 }))!;
      expect((await s.renameDocument("u1", d.id, "Final"))?.title).toBe("Final");
      expect(await s.renameDocument("u2", d.id, "Nope")).toBeNull();
    });
  });
}
