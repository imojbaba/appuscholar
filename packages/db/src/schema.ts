import { pgTable, text, timestamp, integer, primaryKey, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  locale: text("locale").notNull().default("en"),
  termsAcceptedAt: timestamp("terms_accepted_at", { mode: "date" }),
  ageConfirmed: boolean("age_confirmed").notNull().default(false),
  settings: jsonb("settings").notNull().default({}),
  activeProjectId: text("active_project_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state")
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull()
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull()
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  field: text("field").notNull().default("psychology"),
  stage: text("stage").notNull().default("idea"),
  status: text("status").notNull().default("active"),
  contentLang: text("content_lang").notNull().default("en"),
  kind: text("kind").notNull().default("research"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("projects_user_idx").on(t.userId), index("projects_user_kind_idx").on(t.userId, t.kind)]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("draft"),
  currentRevisionId: text("current_revision_id"),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  deks: jsonb("deks").$type<{ v: number; wrapped: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("documents_project_idx").on(t.projectId)]);

export const documentRevisions = pgTable("document_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  bodyHtml: text("body_html").notNull(),
  authorKind: text("author_kind").notNull(),
  authorLabel: text("author_label").notNull(),
  wordCount: integer("word_count").notNull(),
  originStats: jsonb("origin_stats"),
  keyVersion: integer("key_version").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [uniqueIndex("revisions_doc_seq_idx").on(t.documentId, t.seq)]);

/**
 * One body per (project, kind) for a stage panel's data (the idea intake, the citation library, caches, shelf text, paper notes). Sealed in
 * the browser like a document's revisions: key_version 0 is plaintext JSON (only while the user has no vault), 1 or more is ciphertext under
 * one of `deks`, which the server stores and never opens.
 */
export const projectBlobs = pgTable("project_blobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  keyVersion: integer("key_version").notNull().default(0),
  deks: jsonb("deks").$type<{ v: number; wrapped: string }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [uniqueIndex("project_blobs_project_kind_idx").on(t.projectId, t.kind)]);

export const credentials = pgTable("credentials", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.userId, t.provider] })]);

export const aiUseLog = pgTable("ai_use_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  day: text("day").notNull(),          // YYYY-MM-DD in the student's local date as sent by the client
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  kind: text("kind").notNull(),
  grp: text("grp").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("ai_use_user_day_idx").on(t.userId, t.day)]);

export const vaultKeys = pgTable("vault_keys", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passWrapped: text("pass_wrapped").notNull(),
  recoveryWrapped: text("recovery_wrapped").notNull(),
  // The sharing keypair (Phase 7). Null where the browser had no X25519 at setup; a later unlock adds it when it can.
  publicKey: text("public_key"),
  privateKeyWrapped: text("private_key_wrapped"),
  // A fixed sentinel encrypted under the vault key: opening it proves a candidate vault key is this vault's.
  checkWrapped: text("check_wrapped").notNull(),
  complete: boolean("complete").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
});

// No foreign key on user_id: audit rows must survive account erasure.
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  at: timestamp("at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("audit_log_user_idx").on(t.userId)]);

export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type ProjectBlobRow = typeof projectBlobs.$inferSelect;
