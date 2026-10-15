import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import { users, projects, documents, documentRevisions } from "../src/schema";

describe("schema", () => {
  it("names tables as in the spec", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(projects)).toBe("projects");
    expect(getTableName(documents)).toBe("documents");
    expect(getTableName(documentRevisions)).toBe("document_revisions");
  });
  it("revisions carry author_kind and seq", () => {
    const cols = Object.keys(documentRevisions);
    expect(cols).toEqual(expect.arrayContaining(["seq", "authorKind", "authorLabel", "bodyHtml", "wordCount"]));
  });
});
