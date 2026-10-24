import { describe, it, expect } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { users, projects, documents, documentRevisions, credentials, aiUseLog, vaultKeys, projectBlobs } from "../src/schema";

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
  it("vault_keys: the sharing keypair may be absent (no X25519 in the browser), the vault-key check never is", () => {
    const c = getTableColumns(vaultKeys);
    expect(c.publicKey.notNull).toBe(false);
    expect(c.privateKeyWrapped.notNull).toBe(false);
    expect(c.checkWrapped.notNull).toBe(true);
    expect(c.checkWrapped.name).toBe("check_wrapped");
  });
  it("project_blobs: one body per (project, kind), with its key version and wrapped data keys", () => {
    expect(getTableName(projectBlobs)).toBe("project_blobs");
    const c = getTableColumns(projectBlobs);
    expect(Object.keys(c).sort()).toEqual(["body", "deks", "id", "keyVersion", "kind", "projectId", "updatedAt", "version"]);
    expect(c.version.name).toBe("version");
    expect(c.version.default).toBe(0);
    expect(c.projectId.name).toBe("project_id");
    expect(c.keyVersion.name).toBe("key_version");
    expect(c.updatedAt.name).toBe("updated_at");
    for (const k of ["projectId", "kind", "body", "keyVersion", "deks", "updatedAt", "version"] as const) expect(c[k].notNull, k).toBe(true);
  });
});
