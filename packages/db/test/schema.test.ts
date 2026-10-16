import { describe, it, expect } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { users, projects, documents, documentRevisions, credentials, aiUseLog } from "../src/schema";

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
  it("users carry settings and the active project", () => {
    expect(Object.keys(getTableColumns(users))).toEqual(expect.arrayContaining(["settings", "activeProjectId", "termsAcceptedAt", "ageConfirmed"]));
  });
  it("projects have a kind and documents a soft-delete stamp", () => {
    expect(Object.keys(getTableColumns(projects))).toContain("kind");
    expect(Object.keys(getTableColumns(documents))).toContain("deletedAt");
  });
  it("credentials and the AI-use log hold no text sent or returned", () => {
    expect(getTableName(credentials)).toBe("credentials");
    expect(Object.keys(getTableColumns(credentials)).sort()).toEqual(["encryptedKey", "provider", "updatedAt", "userId"]);
    expect(getTableName(aiUseLog)).toBe("ai_use_log");
    expect(Object.keys(getTableColumns(aiUseLog)).sort()).toEqual(["createdAt", "day", "grp", "id", "kind", "model", "projectId", "provider", "userId"]);
  });
});
