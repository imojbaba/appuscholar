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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("projects_user_idx").on(t.userId)]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("draft"),
  currentRevisionId: text("current_revision_id"),
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
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [uniqueIndex("revisions_doc_seq_idx").on(t.documentId, t.seq)]);

export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
