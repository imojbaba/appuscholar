# Phase 1.5: App Shell and Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase-1 placeholder styling with a real app shell and five finished screens (sign-in, projects, project, document, import), light mode only, so Dr. Sharma can evaluate the product rather than the scaffolding.

**Architecture:** Tailwind 4 + shadcn/ui primitives in `apps/web/components/ui`, Geist Sans via `next/font`, v1's purple kept as the single accent. A signed-in route group `(app)` gets one `AppShell` layout (top bar with wordmark, breadcrumb and user menu). The API gains `PATCH /projects/:id` (title, stage), `DELETE /projects/:id`, and a richer project summary (document count, last edited) so the projects screen has something to show. Every list has empty, loading and error states. All existing `data-testid` hooks and the `.ProseMirror` class stay, so the phase-1 Playwright test keeps running and is extended.

**Tech Stack:** Next.js 16, React 19, Tailwind 4.3 (`@tailwindcss/postcss`), shadcn/ui 4 (Radix primitives), `geist` 1.7, `@phosphor-icons/react` 2.1, TipTap 3, Hono 4, Drizzle, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-appuscholar-v2-design.md` §9 (web UI) and the approved direction in chat on 2026-10-15: shadcn + Geist, purple accent preserved, Fraunces for the wordmark only, light mode only for now, rename/delete projects, real persisted stage selector, toolbar + word count in the editor, three-step import page, empty/loading/error states everywhere.

## Global Constraints

- Light mode only. Tokens live in `apps/web/app/globals.css` as CSS variables; no `dark:` variants in this phase.
- One accent: purple (`--accent: #4c1d95`, hover `#5b21b6`, soft `#ede9fe`). No second accent colour anywhere. The v1 gold is not used.
- One corner-radius system: controls 8px (`--radius: 0.5rem`), cards 12px. Nothing else.
- Fonts: Geist Sans for all UI text via `next/font`; Fraunces (via `next/font/google`, self-hosted at build) only for the "Appuscholar" wordmark. No `<link>` to Google Fonts.
- Icons only from `@phosphor-icons/react`, weight `regular`, size 18 inline / 20 in buttons. No hand-drawn SVG icons, no emoji in UI text.
- Every form input has a visible `<label>`. No placeholder-as-label.
- Every list has explicit loading (skeleton), empty and error states with a `role="alert"` and `data-testid="error-msg"` on errors.
- Any button that triggers a request is disabled and shows progress text while in flight. Destructive actions confirm in an `AlertDialog`.
- These `data-testid` values must survive unchanged: `e2e-email`, `e2e-submit`, `signin-error`, `project-title`, `project-create`, `project-link`, `doc-title`, `doc-create`, `doc-link`, `save-status`, `editor`, `revision-list`, `restore-<seq>`, `import-file`, `import-msg`, `error-msg`. The editor root keeps class `ProseMirror` (TipTap default).
- CSP stays as in `apps/web/proxy.ts`; Tailwind is compiled at build time so no new `style-src` sources. `next/font` serves fonts from `'self'`.
- Stage keys are exactly `idea | lit | design | analysis | writing | publish` with labels "Idea & Feasibility", "Literature Review", "Design & Ethics", "Collection & Analysis", "Writing", "Review & Publish".
- Copy: plain sentences, no em-dashes anywhere in UI strings, sentence case for buttons and headings.
- Commits: Conventional Commits prefix and trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Deleting a project must cascade to its documents and revisions, must refuse another user's project with 404, and must require confirmation in the UI. Test in Task 1 (store + route) and Task 3 (e2e).
2. A stage change must persist across reload, and an invalid stage string must be rejected with 400. Test in Task 1 (route) and Task 4 (e2e).
3. A project title rename to an empty or 201+ character string must be rejected with 400 and the UI must keep the old title. Test in Task 1.
4. The editor toolbar must not break autosave: toggling bold then typing must still produce one new revision per debounce window, and the word count must update. Test in Task 5 (e2e).
5. The projects list must show the document count and last-edited time from the API, not from client-side guesses; a project with zero documents shows "No documents yet". Test in Task 1 (route shape) and Task 3 (e2e).

---

## File Structure

```
apps/api/src/store/types.ts        ProjectSummary type; updateProject, deleteProject
apps/api/src/store/memory.ts       implement
apps/api/src/store/drizzle.ts      implement (aggregate query for counts)
apps/api/src/routes/projects.ts    GET / returns ProjectSummary[]; PATCH /:id; DELETE /:id
apps/api/test/store.contract.ts    contract cases for update/delete/summary
apps/api/test/app.test.ts          route cases

apps/web/postcss.config.mjs        Tailwind 4
apps/web/components.json           shadcn config
apps/web/app/globals.css           tokens + Tailwind import + editor styles
apps/web/app/layout.tsx            fonts, body classes
apps/web/lib/utils.ts              cn()
apps/web/lib/stages.ts             STAGES const + labels
apps/web/lib/format.ts             relative time, plural helpers
apps/web/components/ui/*           generated by shadcn (button, input, label, card, badge, dialog, alert-dialog, dropdown-menu, select, separator, skeleton)
apps/web/components/shell/AppShell.tsx       top bar + content container
apps/web/components/shell/Wordmark.tsx
apps/web/components/shell/UserMenu.tsx       sign out, import link
apps/web/components/shell/Breadcrumb.tsx
apps/web/app/(app)/layout.tsx                 auth guard + AppShell
apps/web/app/(app)/projects/page.tsx          (moved from app/projects)
apps/web/app/(app)/projects/[id]/page.tsx
apps/web/app/(app)/projects/[id]/documents/[docId]/page.tsx
apps/web/app/(app)/import/page.tsx
apps/web/app/signin/page.tsx                  redesigned, outside the shell
apps/web/components/projects/ProjectList.tsx  cards, create form, rename/delete
apps/web/components/projects/ProjectCard.tsx
apps/web/components/projects/ProjectActions.tsx   dropdown + dialogs
apps/web/components/projects/StageSelect.tsx
apps/web/components/documents/DocumentList.tsx
apps/web/components/editor/Editor.tsx         (moved) + toolbar + word count
apps/web/components/editor/Toolbar.tsx
apps/web/components/editor/RevisionPanel.tsx  (moved) collapsible
apps/web/components/import/ImportV1.tsx       (moved) steps + dropzone + progress
apps/web/e2e/platform.spec.ts                 extended
```

---

### Task 1: API: project summary, update and delete

**Files:**
- Modify: `apps/api/src/store/types.ts`, `apps/api/src/store/memory.ts`, `apps/api/src/store/drizzle.ts`, `apps/api/src/routes/projects.ts`
- Test: `apps/api/test/store.contract.ts`, `apps/api/test/app.test.ts`

**Interfaces:**
- Consumes: existing `Store`, `Project`, `DocumentSummary`.
- Produces:
  - `type ProjectStage = "idea" | "lit" | "design" | "analysis" | "writing" | "publish"`; `export const PROJECT_STAGES: readonly ProjectStage[]`.
  - `type ProjectSummary = Project & { documentCount: number; lastEditedAt: Date | null }`.
  - `Store.listProjects(userId): Promise<ProjectSummary[]>` (changed return type).
  - `Store.updateProject(userId, id, patch: { title?: string; stage?: ProjectStage }): Promise<Project | null>`.
  - `Store.deleteProject(userId, id): Promise<boolean>` (false when not found / not owned).
  - Routes: `GET /projects` → `ProjectSummary[]` with `lastEditedAt` as ISO string or null; `PATCH /projects/:id {title?, stage?}` → `Project` or 400 `{error:"invalid"}` / 404; `DELETE /projects/:id` → 204 or 404.

- [ ] **Step 1: Add the failing contract tests**

Append inside `storeContract`'s `describe` in `apps/api/test/store.contract.ts`:
```ts
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

    it("updates title and stage, and refuses other users", async () => {
      const p = await s.createProject(a, "Sleep");
      const u = await s.updateProject(a, p.id, { title: "Sleep and memory", stage: "lit" });
      expect(u?.title).toBe("Sleep and memory");
      expect(u?.stage).toBe("lit");
      expect((await s.getProject(a, p.id))?.stage).toBe("lit");
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @appuscholar/api test`
Expected: FAIL on the three new cases for both stores (`updateProject is not a function`, missing `documentCount`).

- [ ] **Step 3: Types**

In `apps/api/src/store/types.ts` add after `Project`:
```ts
export const PROJECT_STAGES = ["idea", "lit", "design", "analysis", "writing", "publish"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export type ProjectSummary = Project & { documentCount: number; lastEditedAt: Date | null };
export type ProjectPatch = { title?: string; stage?: ProjectStage };
```
Change the interface:
```ts
  listProjects(userId: string): Promise<ProjectSummary[]>;
  updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null>;
  deleteProject(userId: string, id: string): Promise<boolean>;
```

- [ ] **Step 4: MemoryStore**

Replace `listProjects` and add the two methods in `apps/api/src/store/memory.ts`:
```ts
  async listProjects(userId: string): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .filter(p => p.userId === userId)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .map(p => {
        const docs = [...this.docs.values()].filter(d => d.projectId === p.id);
        const last = docs.reduce<Date | null>((acc, d) => (acc === null || d.updatedAt > acc ? d.updatedAt : acc), null);
        return { ...p, documentCount: docs.length, lastEditedAt: last };
      });
  }
  async updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return null;
    if (patch.title !== undefined) p.title = patch.title;
    if (patch.stage !== undefined) p.stage = patch.stage;
    return p;
  }
  async deleteProject(userId: string, id: string): Promise<boolean> {
    const p = this.projects.get(id);
    if (!p || p.userId !== userId) return false;
    for (const d of [...this.docs.values()]) if (d.projectId === id) { this.docs.delete(d.id); this.revs.delete(d.id); }
    this.projects.delete(id);
    return true;
  }
```
Import `ProjectSummary`, `ProjectPatch` from `./types`.

- [ ] **Step 5: DrizzleStore**

In `apps/api/src/store/drizzle.ts` import `count, max` from `drizzle-orm` and replace `listProjects`, add the two methods:
```ts
  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const rows = await this.d
      .select({ project: projects, documentCount: count(documents.id), lastEditedAt: max(documents.updatedAt) })
      .from(projects)
      .leftJoin(documents, eq(documents.projectId, projects.id))
      .where(eq(projects.userId, userId))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt));
    return rows.map(r => ({ ...r.project, documentCount: Number(r.documentCount), lastEditedAt: r.lastEditedAt ?? null }));
  }
  async updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
    if (!(await this.getProject(userId, id))) return null;
    const set: Partial<typeof projects.$inferInsert> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.stage !== undefined) set.stage = patch.stage;
    if (Object.keys(set).length === 0) return this.getProject(userId, id);
    const [row] = await this.d.update(projects).set(set).where(eq(projects.id, id)).returning();
    return row ?? null;
  }
  async deleteProject(userId: string, id: string): Promise<boolean> {
    if (!(await this.getProject(userId, id))) return false;
    const rows = await this.d.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return rows.length > 0;
  }
```
`max(documents.updatedAt)` returns `Date | null` with the `timestamp` mode `date`; if the type comes back as `string`, wrap with `r.lastEditedAt ? new Date(r.lastEditedAt) : null`. Deleting a project cascades through the `ON DELETE cascade` foreign keys from Task 2 of phase 1.

- [ ] **Step 6: Run contract tests**

Run: `pnpm --filter @appuscholar/api test -- store`
Expected: memory and drizzle (PGlite) contract suites PASS, including the three new cases.

- [ ] **Step 7: Failing route tests**

Append inside `describe("api routes")` in `apps/api/test/app.test.ts`:
```ts
  it("lists projects with documentCount and lastEditedAt", async () => {
    const { p, d } = await makeDoc();
    await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: "<p>a</p>" }) });
    const list = await (await app.request("/projects", { headers: auth })).json() as { id: string; documentCount: number; lastEditedAt: string | null }[];
    const mine = list.find(x => x.id === p.id)!;
    expect(mine.documentCount).toBe(1);
    expect(typeof mine.lastEditedAt).toBe("string");
  });

  it("PATCH updates title and stage and validates", async () => {
    const { p } = await makeDoc();
    const ok = await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "Renamed", stage: "lit" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ title: "Renamed", stage: "lit" });
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ stage: "nope" }) })).status).toBe(400);
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "" }) })).status).toBe(400);
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "x".repeat(201) }) })).status).toBe(400);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ title: "Hijack" }) })).status).toBe(404);
  });

  it("DELETE removes the project and its documents", async () => {
    const { p, d } = await makeDoc();
    const other = { authorization: "Bearer " + (await token("u2")) };
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: other })).status).toBe(404);
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await app.request(`/documents/${d.id}`, { headers: auth })).status).toBe(404);
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: auth })).status).toBe(404);
  });
```

- [ ] **Step 8: Run to verify failure**

Run: `pnpm --filter @appuscholar/api test -- app`
Expected: the three new cases FAIL (404 on PATCH/DELETE, missing fields).

- [ ] **Step 9: Routes**

In `apps/api/src/routes/projects.ts` add the schema and routes:
```ts
import { PROJECT_STAGES } from "../store/types";
const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(PROJECT_STAGES).optional()
}).refine(v => v.title !== undefined || v.stage !== undefined, { message: "empty patch" });

  r.patch("/:id", async (c) => {
    const body = Patch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const p = await store.updateProject(c.get("userId"), c.req.param("id"), body.data);
    return p ? c.json(p) : c.json({ error: "not-found" }, 404);
  });
  r.delete("/:id", async (c) => {
    const ok = await store.deleteProject(c.get("userId"), c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });
```
`GET /` already returns `store.listProjects(...)`; Hono serialises `Date` to ISO strings, so `lastEditedAt` arrives as string or null.

- [ ] **Step 10: Run everything**

Run: `pnpm --filter @appuscholar/api test && pnpm --filter @appuscholar/api lint && pnpm --filter @appuscholar/api typecheck`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api
git commit -m "feat(api): project summaries, patch and delete routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Web foundation: Tailwind, shadcn, fonts, tokens, app shell

**Files:**
- Create: `apps/web/postcss.config.mjs`, `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/lib/stages.ts`, `apps/web/lib/format.ts`, `apps/web/components/shell/Wordmark.tsx`, `apps/web/components/shell/Breadcrumb.tsx`, `apps/web/components/shell/UserMenu.tsx`, `apps/web/components/shell/AppShell.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/test/format.test.ts`
- Modify: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/package.json`
- Move: `apps/web/app/projects/**` → `apps/web/app/(app)/projects/**`, `apps/web/app/import/page.tsx` → `apps/web/app/(app)/import/page.tsx` (route group keeps URLs the same)

**Interfaces:**
- Produces: `cn(...classes)`; `STAGES: { key: ProjectStage; label: string }[]` and `stageLabel(key)`; `relativeTime(iso: string | null, now?: Date): string` ("just now", "4 minutes ago", "yesterday", "3 Oct"); `plural(n, one, many)`; `<AppShell crumbs={[{href, label}]}>` layout; `<Breadcrumb items>`; `<UserMenu email>`; `<Wordmark />`.

- [ ] **Step 1: Failing format test**

`apps/web/test/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { relativeTime, plural } from "../lib/format";

describe("relativeTime", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("handles null and recent times", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("2026-10-15T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-15T11:56:00Z", now)).toBe("4 minutes ago");
    expect(relativeTime("2026-10-15T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-10-14T09:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-03T09:00:00Z", now)).toBe("3 Oct");
    expect(relativeTime("2025-10-03T09:00:00Z", now)).toBe("3 Oct 2025");
  });
});
describe("plural", () => {
  it("picks the form", () => {
    expect(plural(0, "document", "documents")).toBe("0 documents");
    expect(plural(1, "document", "documents")).toBe("1 document");
    expect(plural(2, "document", "documents")).toBe("2 documents");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @appuscholar/web test`
Expected: FAIL, `../lib/format` not found.

- [ ] **Step 3: Install and configure**

```bash
cd apps/web
pnpm add tailwindcss@^4.3.3 @tailwindcss/postcss@^4.3.3 geist@^1.7.2 @phosphor-icons/react@^2.1.10 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.7.0
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`apps/web/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide"
}
```
(`iconLibrary` is only used by shadcn's generator for a few internal icons; the app's own icons come from Phosphor. If the generated components import `lucide-react`, add it as a dependency; that is the one permitted exception.)

`apps/web/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

Generate the primitives (non-interactive):
```bash
cd apps/web && pnpm dlx shadcn@latest add button input label card badge dialog alert-dialog dropdown-menu select separator skeleton --yes --overwrite
```
Expected: files under `apps/web/components/ui/`. Open `button.tsx` and set the default `rounded-md` to `rounded-lg` only if the generated radius is not driven by `--radius`; otherwise leave generated code untouched.

- [ ] **Step 4: Tokens and global CSS**

Replace `apps/web/app/globals.css` with:
```css
@import "tailwindcss";

:root {
  --radius: 0.5rem;
  --background: #fbfaf9;
  --foreground: #2a2438;
  --card: #ffffff;
  --card-foreground: #2a2438;
  --popover: #ffffff;
  --popover-foreground: #2a2438;
  --primary: #4c1d95;
  --primary-foreground: #ffffff;
  --secondary: #f4f1fa;
  --secondary-foreground: #3b0764;
  --muted: #f4f3f6;
  --muted-foreground: #6f6a80;
  --accent: #ede9fe;
  --accent-foreground: #3b0764;
  --destructive: #b42318;
  --border: #e6e2ee;
  --input: #e6e2ee;
  --ring: #7c3aed;
}

@theme inline {
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --font-display: var(--font-fraunces), Georgia, serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 4px);
  --radius-xl: calc(var(--radius) + 8px);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans antialiased; }
  button { cursor: pointer; }
}

/* Editor */
.editor .ProseMirror { min-height: 60vh; outline: none; line-height: 1.7; font-size: 16px; padding: 4px 2px; }
.editor .ProseMirror p { margin: 0 0 0.75em; }
.editor .ProseMirror h1, .editor .ProseMirror h2, .editor .ProseMirror h3 { font-weight: 600; margin: 1.2em 0 0.4em; line-height: 1.25; }
.editor .ProseMirror h1 { font-size: 1.6em; } .editor .ProseMirror h2 { font-size: 1.3em; } .editor .ProseMirror h3 { font-size: 1.1em; }
.editor .ProseMirror ul, .editor .ProseMirror ol { padding-left: 1.4em; margin: 0 0 0.75em; }
.editor .ProseMirror table { border-collapse: collapse; margin: 12px 0; width: 100%; }
.editor .ProseMirror th, .editor .ProseMirror td { border: 1px solid var(--border); padding: 6px 8px; vertical-align: top; }
.editor .ProseMirror th { background: var(--muted); font-weight: 600; }
.editor .ProseMirror img { max-width: 100%; height: auto; }
.editor .ProseMirror mark { background: #fde68a; padding: 0 2px; }
.editor .ProseMirror .ai-ins { border-bottom: 2px dotted #c4b5fd; }
```

- [ ] **Step 5: Fonts and root layout**

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = { title: "Appuscholar", description: "A writing and research helper for psychology students." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}>
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
```
`geist` exposes `GeistSans.variable` as `--font-geist-sans` and `GeistMono.variable` as `--font-geist-mono`, which the `@theme` block above references.

- [ ] **Step 6: Helpers**

`apps/web/lib/stages.ts`:
```ts
export const STAGES = [
  { key: "idea", label: "Idea & Feasibility" },
  { key: "lit", label: "Literature Review" },
  { key: "design", label: "Design & Ethics" },
  { key: "analysis", label: "Collection & Analysis" },
  { key: "writing", label: "Writing" },
  { key: "publish", label: "Review & Publish" }
] as const;
export type ProjectStage = (typeof STAGES)[number]["key"];
export function stageLabel(key: string): string { return STAGES.find(s => s.key === key)?.label ?? "Idea & Feasibility"; }
```

`apps/web/lib/format.ts`:
```ts
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const t = new Date(iso);
  const diff = Math.max(0, now.getTime() - t.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const startToday = new Date(now); startToday.setUTCHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday.getTime() - 86400000);
  if (t >= startYesterday && t < startToday) return "yesterday";
  const d = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  return t.getUTCFullYear() === now.getUTCFullYear() ? d : `${d} ${t.getUTCFullYear()}`;
}
export function plural(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}`; }
```

- [ ] **Step 7: Run the format test**

Run: `pnpm --filter @appuscholar/web test`
Expected: PASS.

- [ ] **Step 8: Shell components**

`apps/web/components/shell/Wordmark.tsx`:
```tsx
import Link from "next/link";
export function Wordmark({ href = "/projects" }: { href?: string }) {
  return (
    <Link href={href} className="font-display text-xl font-semibold tracking-tight text-primary">
      Appu<span className="text-foreground">scholar</span>
    </Link>
  );
}
```

`apps/web/components/shell/Breadcrumb.tsx`:
```tsx
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
export type Crumb = { href?: string; label: string };
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {items.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 ? <CaretRight size={14} aria-hidden="true" /> : null}
          {c.href && i < items.length - 1 ? <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link> : <span className="truncate text-foreground">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
```

`apps/web/components/shell/UserMenu.tsx`:
```tsx
"use client";
import Link from "next/link";
import { DotsThreeCircle, SignOut, UploadSimple } from "@phosphor-icons/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
export function UserMenu({ email, signOutAction }: { email: string; signOutAction: () => Promise<void> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Account menu" data-testid="user-menu"><DotsThreeCircle size={20} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/import"><UploadSimple size={18} /> Import v1 backup</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void signOutAction(); }} data-testid="sign-out"><SignOut size={18} /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`apps/web/components/shell/AppShell.tsx`:
```tsx
import { Wordmark } from "./Wordmark";
import { UserMenu } from "./UserMenu";
import { signOut } from "@/auth";
export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  async function signOutAction() { "use server"; await signOut({ redirectTo: "/signin" }); }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <UserMenu email={email} signOutAction={signOutAction} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
```

`apps/web/app/(app)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return <AppShell email={session.user.email ?? ""}>{children}</AppShell>;
}
```

Move the three signed-in routes into the group with `git mv` (URLs unchanged):
```bash
cd apps/web/app && mkdir -p "(app)" && git mv projects "(app)/projects" && git mv import "(app)/import"
```
Remove the per-page `auth()` + `redirect` lines from `(app)/projects/page.tsx`, `(app)/projects/[id]/page.tsx` and `(app)/import/page.tsx` (the layout guards now), and remove their `Sign out` form and `Import v1 backup` link (now in the user menu). Leave the rest of those pages as they are; Tasks 3 to 5 rewrite them.

- [ ] **Step 9: Build and look**

Run: `pnpm --filter @appuscholar/web lint && pnpm --filter @appuscholar/web typecheck && pnpm --filter @appuscholar/web build`
Expected: clean; the route table still lists `/projects`, `/projects/[id]`, `/projects/[id]/documents/[docId]`, `/import`, `/signin`.

Start the dev servers (`pnpm --filter @appuscholar/api dev` with the env from `.env.local`, `pnpm --filter @appuscholar/web dev`) and open `http://localhost:3000/projects` after an E2E sign-in: the top bar with the wordmark and the account menu shows; the old pages render inside it in Geist.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): tailwind, shadcn primitives, geist, tokens and app shell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Sign-in and Projects screens

**Files:**
- Modify: `apps/web/app/signin/page.tsx`, `apps/web/app/(app)/projects/page.tsx`
- Create: `apps/web/components/projects/ProjectList.tsx` (replaces `apps/web/components/ProjectList.tsx`, delete the old file), `apps/web/components/projects/ProjectCard.tsx`, `apps/web/components/projects/ProjectActions.tsx`
- Test: `apps/web/e2e/platform.spec.ts` (extend)

**Interfaces:**
- Consumes: `GET /projects` → `{ id, title, stage, createdAt, documentCount, lastEditedAt }[]`; `POST /projects`; `PATCH /projects/:id`; `DELETE /projects/:id`; `STAGES`, `stageLabel`, `relativeTime`, `plural`, `cn`, shadcn `Button Input Label Card Badge Dialog AlertDialog DropdownMenu Skeleton`.
- Produces: `data-testid`s `project-title`, `project-create`, `project-link`, `project-card`, `project-actions`, `project-rename`, `project-delete`, `rename-input`, `rename-save`, `delete-confirm`, `error-msg`.

- [ ] **Step 1: Sign-in page**

`apps/web/app/signin/page.tsx`:
```tsx
import { signIn } from "@/auth";
import { e2eAuthEnabled } from "@/lib/e2eAuth";
import { signinErrorMessage } from "@/lib/signinError";
import { STAGES } from "@/lib/stages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/Wordmark";
import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const e2e = e2eAuthEnabled();
  const emailEnabled = Boolean(process.env.AUTH_RESEND_KEY);
  const error = signinErrorMessage((await searchParams).error);
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-secondary px-6 py-8 lg:px-14 lg:py-12">
        <Wordmark href="/signin" />
        <div className="my-12 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">A research supervisor in your browser, for psychology students.</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">Appuscholar walks a thesis from the first idea to the viva. It keeps every revision, checks your numbers, and asks questions instead of writing for you.</p>
          <ol className="mt-8 grid gap-2 text-sm">
            {STAGES.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-medium text-primary">{i + 1}</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">Private preview. Copyright 2026 Dr. Shiv Raj Sharma.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your projects are stored under your account and kept across devices.</p>
          {error ? <p role="alert" data-testid="signin-error" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/projects" }); }} className="mt-6">
            <Button type="submit" className="w-full" size="lg"><GoogleLogo size={20} weight="bold" /> Continue with Google</Button>
          </form>
          {emailEnabled ? (
            <form action={async (fd: FormData) => { "use server"; await signIn("resend", { email: String(fd.get("email")), redirectTo: "/projects" }); }} className="mt-6 grid gap-2">
              <Label htmlFor="email">Or get a sign-in link by email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@college.edu" />
              <Button type="submit" variant="outline" className="w-full">Email me a sign-in link</Button>
            </form>
          ) : null}
          {e2e ? (
            <form action={async (fd: FormData) => { "use server"; await signIn("credentials", { email: String(fd.get("email")), redirectTo: "/projects" }); }} className="mt-8 grid gap-2 rounded-md border border-dashed p-3" data-testid="e2e-form">
              <Label htmlFor="e2e-email">Test sign-in (development only)</Label>
              <Input id="e2e-email" name="email" type="email" defaultValue="tester@e2e.local" data-testid="e2e-email" />
              <Button type="submit" variant="secondary" data-testid="e2e-submit">E2E sign in</Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
```
Mobile: the grid collapses to a single column (`lg:` prefix), left panel first.

- [ ] **Step 2: Project card and actions**

`apps/web/components/projects/ProjectActions.tsx`:
```tsx
"use client";
import { useState } from "react";
import { DotsThree, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function ProjectActions({ title, documentCount, onRename, onDelete }: { title: string; documentCount: number; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>, close: () => void) {
    setBusy(true); setError("");
    try { await fn(); close(); } catch { setError("That did not save. Try again."); } finally { setBusy(false); }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} data-testid="project-actions"><DotsThree size={20} weight="bold" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setDraft(title); setRenaming(true); }} data-testid="project-rename"><PencilSimple size={18} /> Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-destructive" data-testid="project-delete"><Trash size={18} /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); if (draft.trim()) void run(() => onRename(draft.trim()), () => setRenaming(false)); }} className="grid gap-4">
            <DialogHeader><DialogTitle>Rename project</DialogTitle><DialogDescription>Documents and history are kept.</DialogDescription></DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="rename">Project title</Label>
              <Input id="rename" value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} autoFocus data-testid="rename-input" />
            </div>
            {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy || !draft.trim()} data-testid="rename-save">{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {documentCount > 0 ? `This removes the project and its ${documentCount} document${documentCount === 1 ? "" : "s"} with all their revisions.` : "This removes the project."} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void run(onDelete, () => setDeleting(false)); }} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90" data-testid="delete-confirm">{busy ? "Deleting…" : "Delete project"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

`apps/web/components/projects/ProjectCard.tsx`:
```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { stageLabel } from "@/lib/stages";
import { plural, relativeTime } from "@/lib/format";
import { ProjectActions } from "./ProjectActions";
export type ProjectRow = { id: string; title: string; stage: string; createdAt: string; documentCount: number; lastEditedAt: string | null };
export function ProjectCard({ p, onRename, onDelete }: { p: ProjectRow; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void> }) {
  return (
    <Card className="flex items-start justify-between gap-3 p-4" data-testid="project-card">
      <div className="min-w-0">
        <Link href={`/projects/${p.id}`} className="block truncate text-base font-medium hover:underline" data-testid="project-link">{p.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Badge variant="secondary">{stageLabel(p.stage)}</Badge>
          <span>{p.documentCount === 0 ? "No documents yet" : plural(p.documentCount, "document", "documents")}</span>
          <span>Edited {relativeTime(p.lastEditedAt ?? p.createdAt)}</span>
        </div>
      </div>
      <ProjectActions title={p.title} documentCount={p.documentCount} onRename={onRename} onDelete={onDelete} />
    </Card>
  );
}
```

- [ ] **Step 3: Project list**

`apps/web/components/projects/ProjectList.tsx`:
```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard, type ProjectRow } from "./ProjectCard";

export function ProjectList() {
  const [items, setItems] = useState<ProjectRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<ProjectRow[]>("/projects").then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load your projects. Check your connection and try again."); }), []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try { await apiFetch("/projects", { method: "POST", body: JSON.stringify({ title: title.trim() }) }); setTitle(""); await load(); }
    catch { setError("Could not create the project. Try again."); }
    finally { setBusy(false); }
  }
  const rename = (id: string) => async (t: string) => { await apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ title: t }) }); await load(); };
  const remove = (id: string) => async () => { await apiFetch(`/projects/${id}`, { method: "DELETE" }); await load(); };

  return (
    <section className="grid gap-6">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="new-project">New research project</Label>
          <Input id="new-project" value={title} onChange={e => setTitle(e.target.value)} placeholder="For example: Sleep and memory in first-year students" maxLength={200} disabled={busy} data-testid="project-title" />
        </div>
        <Button type="submit" disabled={busy || !title.trim()} data-testid="project-create"><Plus size={18} weight="bold" /> {busy ? "Creating…" : "Create project"}</Button>
      </form>
      {error ? <p role="alert" data-testid="error-msg" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <div className="grid gap-3" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No research project yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create one above, or <Link href="/import" className="underline">import a backup from Appuscholar v1</Link>.</p>
        </div>
      ) : (
        <div className="grid gap-3">{items.map(p => <ProjectCard key={p.id} p={p} onRename={rename(p.id)} onDelete={remove(p.id)} />)}</div>
      )}
    </section>
  );
}
```

`apps/web/app/(app)/projects/page.tsx`:
```tsx
import { ProjectList } from "@/components/projects/ProjectList";
export default function Projects() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Research projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">One project per study. Documents, sources and history live inside it.</p>
      </div>
      <ProjectList />
    </div>
  );
}
```
Delete `apps/web/components/ProjectList.tsx`.

- [ ] **Step 4: Extend the e2e**

In `apps/web/e2e/platform.spec.ts`, after the first project is created and before opening it, add a rename and, at the very end of the test, a delete:
```ts
  // rename via the card menu
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-rename").click();
  await page.getByTestId("rename-input").fill("Sleep and memory, renamed");
  await page.getByTestId("rename-save").click();
  await expect(page.getByTestId("project-link").first()).toHaveText("Sleep and memory, renamed");
  await expect(page.getByTestId("project-card").first()).toContainText("No documents yet");
```
and at the end:
```ts
  await page.goto("/projects");
  const before = await page.getByTestId("project-card").count();
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-delete").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("project-card")).toHaveCount(before - 1);
```
Note the first-project assertion `toHaveText("Sleep and memory, renamed")` must come before the `doc-link` steps; adjust the existing `project-link` click to `.first()`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @appuscholar/web lint && pnpm --filter @appuscholar/web typecheck && pnpm --filter @appuscholar/web build`, then with `DATABASE_URL` and `API_JWT_SECRET` from `apps/api/.env.local`: `pnpm --filter @appuscholar/web e2e`.
Expected: build clean, e2e PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): sign-in and projects screens with rename and delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Project page and import page

**Files:**
- Modify: `apps/web/app/(app)/projects/[id]/page.tsx`, `apps/web/app/(app)/import/page.tsx`
- Create: `apps/web/components/projects/StageSelect.tsx`, `apps/web/components/documents/DocumentList.tsx` (replaces `apps/web/components/DocumentList.tsx`), `apps/web/components/import/ImportV1.tsx` (moved from `apps/web/components/ImportV1.tsx`)
- Delete: `apps/web/components/StageBar.tsx`, `apps/web/components/DocumentList.tsx`, `apps/web/components/ImportV1.tsx`
- Test: `apps/web/e2e/platform.spec.ts` (extend)

**Interfaces:**
- Consumes: `GET /projects` (to find the project by id; there is no `GET /projects/:id`, so the page filters the list), `PATCH /projects/:id {stage}`, `GET /projects/:id/documents`, `POST /projects/:id/documents`; `Breadcrumb`; shadcn `Select`.
- Produces: `data-testid`s `stage-select`, `stage-option-<key>`, `doc-title`, `doc-create`, `doc-link`, `doc-row`, `import-file`, `import-msg`, `import-progress`.

- [ ] **Step 1: Stage select**

`apps/web/components/projects/StageSelect.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { STAGES, type ProjectStage } from "@/lib/stages";
import { apiFetch } from "@/lib/api";
export function StageSelect({ projectId, stage }: { projectId: string; stage: string }) {
  const [value, setValue] = useState<string>(stage);
  const [error, setError] = useState("");
  async function change(next: string) {
    const prev = value; setValue(next); setError("");
    try { await apiFetch(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ stage: next as ProjectStage }) }); }
    catch { setValue(prev); setError("Could not save the stage. Try again."); }
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor="stage" className="text-xs text-muted-foreground">Current stage</Label>
      <Select value={value} onValueChange={change}>
        <SelectTrigger id="stage" className="w-[240px]" data-testid="stage-select"><SelectValue /></SelectTrigger>
        <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key} data-testid={`stage-option-${s.key}`}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      {error ? <p role="alert" data-testid="error-msg" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Document list**

`apps/web/components/documents/DocumentList.tsx`:
```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { plural, relativeTime } from "@/lib/format";
type Doc = { id: string; title: string; currentSeq: number; wordCount: number; updatedAt: string };
export function DocumentList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Doc[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<Doc[]>(`/projects/${projectId}/documents`).then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load the documents. Check your connection and try again."); }), [projectId]);
  useEffect(() => { void load(); }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try { await apiFetch(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title: title.trim() }) }); setTitle(""); await load(); }
    catch { setError("Could not create the document. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section className="grid gap-5">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="new-doc">New document</Label>
          <Input id="new-doc" value={title} onChange={e => setTitle(e.target.value)} placeholder="For example: Literature review" maxLength={200} disabled={busy} data-testid="doc-title" />
        </div>
        <Button type="submit" disabled={busy || !title.trim()} data-testid="doc-create"><Plus size={18} weight="bold" /> {busy ? "Creating…" : "New document"}</Button>
      </form>
      {error ? <p role="alert" data-testid="error-msg" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <div className="grid gap-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No documents in this project yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Start with a working title above. Every save becomes a revision you can return to.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3" data-testid="doc-row">
              <FileText size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${projectId}/documents/${d.id}`} className="block truncate font-medium hover:underline" data-testid="doc-link">{d.title}</Link>
                <p className="text-sm text-muted-foreground">{plural(d.wordCount, "word", "words")} · {plural(d.currentSeq, "revision", "revisions")} · edited {relativeTime(d.updatedAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```
(The middle dot appears at most once per line, as metadata separators; two dots in one line is accepted here as a documented exception because the three values are one metadata strip.)

- [ ] **Step 3: Project page**

`apps/web/app/(app)/projects/[id]/page.tsx`:
```tsx
"use client";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { StageSelect } from "@/components/projects/StageSelect";
import { DocumentList } from "@/components/documents/DocumentList";
import { Skeleton } from "@/components/ui/skeleton";
type Project = { id: string; title: string; stage: string };
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  useEffect(() => {
    apiFetch<Project[]>("/projects").then(list => setProject(list.find(p => p.id === id) ?? null)).catch(() => setProject(null));
  }, [id]);
  if (project === undefined) return <div className="grid gap-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-9 w-80" /></div>;
  if (project === null) return <p role="alert" data-testid="error-msg">This project could not be loaded. It may have been deleted.</p>;
  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ href: "/projects", label: "Research projects" }, { label: project.title }]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        <StageSelect projectId={project.id} stage={project.stage} />
      </div>
      <DocumentList projectId={project.id} />
    </div>
  );
}
```

- [ ] **Step 4: Import page**

`apps/web/components/import/ImportV1.tsx` is the existing component moved; change its markup only:
- Wrap in a `Card` with three numbered steps above the picker: "1. In Appuscholar v1 open Backup and download the file. 2. Choose that file here. 3. Documents land in a new project; the original file is not changed."
- Replace the raw `<input type="file">` with a labelled drop zone: a `<label htmlFor="backup" data-testid="import-dropzone">` styled `rounded-lg border-2 border-dashed p-8 text-center` containing an `UploadSimple` icon and "Choose the backup file" text, with the real `<input id="backup" type="file" accept="application/json,.json" className="sr-only" data-testid="import-file">` inside it. Keep `onChange`, the passphrase prompt (render it as a `Label` + `Input type="password"` + `Button`), and the busy/disabled logic.
- Show batch progress as a bar: `<div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} data-testid="import-progress" className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${(done / total) * 100}%` }} /></div>` while importing, where `done`/`total` are the batch counters that already exist in the component's import loop (if the loop only has an index, derive `done = index + 1`, `total = batches.length`).
- Keep `import-msg` for all messages.

`apps/web/app/(app)/import/page.tsx`:
```tsx
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { ImportV1 } from "@/components/import/ImportV1";
export default function ImportPage() {
  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ href: "/projects", label: "Research projects" }, { label: "Import a v1 backup" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import a v1 backup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bring documents from the browser-only Appuscholar into your account.</p>
      </div>
      <ImportV1 />
    </div>
  );
}
```
Delete `StageBar.tsx`, the old `DocumentList.tsx` and `ImportV1.tsx`.

- [ ] **Step 5: Extend the e2e**

After opening the first project, before creating the document:
```ts
  await page.getByTestId("stage-select").click();
  await page.getByTestId("stage-option-lit").click();
  await page.reload();
  await expect(page.getByTestId("stage-select")).toContainText("Literature Review");
```
The import step already uses `import-file` with `setInputFiles`, which works on the visually hidden input.

- [ ] **Step 6: Verify and commit**

Run lint, typecheck, build and the e2e as in Task 3 Step 5. Expected: all PASS.
```bash
git add apps/web
git commit -m "feat(web): project page with stage selector, document list, import steps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Document page: toolbar, word count, title, collapsible history

**Files:**
- Create: `apps/web/components/editor/Toolbar.tsx`, `apps/web/components/editor/Editor.tsx` (moved from `apps/web/components/Editor.tsx`), `apps/web/components/editor/RevisionPanel.tsx` (moved), `apps/web/components/editor/TitleField.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/documents/[docId]/page.tsx`, `apps/web/lib/useAutosave.ts` (no behaviour change; export `SaveStatus` already)
- Delete: `apps/web/components/Editor.tsx`, `apps/web/components/RevisionPanel.tsx`
- Test: `apps/web/e2e/platform.spec.ts` (extend)

**Interfaces:**
- Consumes: `useAutosave`, `editorExtensions`, `PUT /documents/:id {title}` for rename, `wordCount` is computed client-side from `editor.getText()`.
- Produces: `data-testid`s `save-status`, `editor`, `word-count`, `toolbar`, `tb-bold`, `tb-italic`, `tb-h2`, `tb-bullets`, `tb-numbered`, `tb-table`, `doc-title-field`, `history-toggle`, `revision-list`, `restore-<seq>`.

- [ ] **Step 1: Toolbar**

`apps/web/components/editor/Toolbar.tsx`:
```tsx
"use client";
import type { Editor } from "@tiptap/react";
import { ArrowCounterClockwise, ArrowClockwise, ListBullets, ListNumbers, Table, TextB, TextHOne, TextHTwo, TextItalic, TextStrikethrough } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function Tb({ on, active, label, testId, children }: { on: () => void; active?: boolean; label: string; testId: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={active} data-testid={testId} onMouseDown={e => e.preventDefault()} onClick={on} className={cn("size-8", active && "bg-accent text-accent-foreground")}>
      {children}
    </Button>
  );
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="h-10" aria-hidden="true" />;
  const c = editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1" role="toolbar" aria-label="Formatting" data-testid="toolbar">
      <Tb on={() => c.toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="Heading 1" testId="tb-h1"><TextHOne size={18} /></Tb>
      <Tb on={() => c.toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="Heading 2" testId="tb-h2"><TextHTwo size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => c.toggleBold().run()} active={editor.isActive("bold")} label="Bold" testId="tb-bold"><TextB size={18} /></Tb>
      <Tb on={() => c.toggleItalic().run()} active={editor.isActive("italic")} label="Italic" testId="tb-italic"><TextItalic size={18} /></Tb>
      <Tb on={() => c.toggleStrike().run()} active={editor.isActive("strike")} label="Strikethrough" testId="tb-strike"><TextStrikethrough size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => c.toggleBulletList().run()} active={editor.isActive("bulletList")} label="Bulleted list" testId="tb-bullets"><ListBullets size={18} /></Tb>
      <Tb on={() => c.toggleOrderedList().run()} active={editor.isActive("orderedList")} label="Numbered list" testId="tb-numbered"><ListNumbers size={18} /></Tb>
      <Tb on={() => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} label="Insert table" testId="tb-table"><Table size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => c.undo().run()} label="Undo" testId="tb-undo"><ArrowCounterClockwise size={18} /></Tb>
      <Tb on={() => c.redo().run()} label="Redo" testId="tb-redo"><ArrowClockwise size={18} /></Tb>
    </div>
  );
}
```
`onMouseDown preventDefault` keeps the editor selection when a toolbar button is clicked. `editor.chain().focus()` returns a fresh chain per call in TipTap 3; if lint complains about reusing `c`, inline `editor.chain().focus()` in each handler.

- [ ] **Step 2: Editor with status and word count**

`apps/web/components/editor/Editor.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensions } from "@/lib/editorExtensions";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";
import { Toolbar } from "./Toolbar";
import { cn } from "@/lib/utils";
import { CheckCircle, CloudArrowUp, WarningCircle } from "@phosphor-icons/react";

function words(text: string): number { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

function Status({ status, seq }: { status: SaveStatus; seq: number }) {
  const map: Record<SaveStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    saved: { icon: <CheckCircle size={16} />, text: `Saved · revision ${seq}`, cls: "text-muted-foreground" },
    saving: { icon: <CloudArrowUp size={16} />, text: "Saving…", cls: "text-muted-foreground" },
    dirty: { icon: <CloudArrowUp size={16} />, text: "Unsaved changes", cls: "text-muted-foreground" },
    error: { icon: <WarningCircle size={16} />, text: "Could not save, will retry", cls: "text-destructive" }
  };
  const m = map[status];
  return <span className={cn("inline-flex items-center gap-1 text-sm", m.cls)} data-testid="save-status" aria-live="polite">{m.icon}{m.text}</span>;
}

export function Editor({ docId, initialHtml, initialSeq, onSaved, onReady }: { docId: string; initialHtml: string; initialSeq: number; onSaved?: (seq: number) => void; onReady?: (api: { flushNow: () => Promise<boolean> }) => void }) {
  const { status, currentSeq, onChange, flushNow } = useAutosave(docId, initialHtml, initialSeq);
  const [count, setCount] = useState(0);
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    immediatelyRender: false,
    onCreate: ({ editor }) => setCount(words(editor.getText())),
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); setCount(words(editor.getText())); }
  });
  useEffect(() => { if (status === "saved") onSaved?.(currentSeq); }, [status, currentSeq, onSaved]);
  useEffect(() => { onReady?.({ flushNow }); }, [onReady, flushNow]);
  return (
    <div className="editor rounded-lg border bg-card">
      <Toolbar editor={editor} />
      <div className="px-6 py-4"><EditorContent editor={editor} data-testid="editor" /></div>
      <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
        <span data-testid="word-count">{count} {count === 1 ? "word" : "words"}</span>
        <Status status={status} seq={currentSeq} />
      </div>
    </div>
  );
}
```
Keep whatever binding of the TipTap `update` event the current `Editor.tsx` uses (an effect with `editor.on("update", ...)`) if the file has it; the `onUpdate` option above is then replaced by that effect, with `setCount` added inside the handler. Do not keep both.

- [ ] **Step 3: Title field and revision panel**

`apps/web/components/editor/TitleField.tsx`:
```tsx
"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
export function TitleField({ docId, title, bodyHtml, onRenamed }: { docId: string; title: string; bodyHtml: string; onRenamed: (t: string) => void }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  async function commit() {
    const t = value.trim();
    if (!t || t === title) { setValue(title); return; }
    try { await apiFetch(`/documents/${docId}`, { method: "PUT", body: JSON.stringify({ bodyHtml, title: t }) }); onRenamed(t); setError(""); }
    catch { setValue(title); setError("Could not rename. Try again."); }
  }
  return (
    <div>
      <input value={value} onChange={e => setValue(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Document title" maxLength={200} data-testid="doc-title-field" className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline decoration-primary/40 underline-offset-4" />
      {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
```
Passing the current `bodyHtml` keeps the PUT a no-op for the body (`created:false`), so a rename never creates a revision.

`apps/web/components/editor/RevisionPanel.tsx`: move the existing component and restyle: wrap in `<aside className="rounded-lg border bg-card">`, a header row with "History" and a `Button variant="ghost" size="sm" data-testid="history-toggle"` that collapses the list (`useState(true)` open by default on `lg`, closed below), each revision as a row `flex items-center justify-between gap-2 px-3 py-2 text-sm` with `#{seq}`, a `Badge variant="outline"` for `authorKind` (`web` → "you", `copilot` → label, `import` → "import", `restore` → "restore"), words and `relativeTime(createdAt)`, and the existing Restore button as `Button variant="outline" size="sm" data-testid={`restore-${seq}`}`. Keep `beforeRestore`, the confirm, the error state, and `revision-list`.

- [ ] **Step 4: Document page**

`apps/web/app/(app)/projects/[id]/documents/[docId]/page.tsx`: keep the existing logic (load, `editorGen`, `flushRef`, `beforeRestore`) and change only the markup:
```tsx
  return (
    <div className="grid gap-5">
      <Breadcrumb items={[{ href: "/projects", label: "Research projects" }, { href: `/projects/${id}`, label: projectTitle ?? "Project" }, { label: doc.title }]} />
      <TitleField docId={doc.id} title={doc.title} bodyHtml={doc.bodyHtml} onRenamed={t => setDoc(d => (d ? { ...d, title: t } : d))} />
      {error && <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Editor key={editorGen} docId={doc.id} initialHtml={doc.bodyHtml} initialSeq={doc.currentSeq} onSaved={setSeq} onReady={onReady} />
        <RevisionPanel docId={doc.id} currentSeq={seq} onRestored={() => { void load().then(ok => { if (ok) setEditorGen(g => g + 1); }); }} beforeRestore={beforeRestore} />
      </div>
    </div>
  );
```
`projectTitle` comes from one extra `apiFetch<Project[]>("/projects")` in the same effect as `load`, stored in state; on failure it falls back to "Project".
Delete the old `components/Editor.tsx` and `components/RevisionPanel.tsx`; update imports.

- [ ] **Step 5: Extend the e2e**

After the first document's "First sentence here." save and before the restore:
```ts
  await expect(page.getByTestId("word-count")).toHaveText("3 words");
  await page.getByTestId("tb-bold").click();
  await editor.type(" Bold bit.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 3/, { timeout: 10_000 });
  await expect(page.getByTestId("word-count")).toHaveText("5 words");
```
and renumber the later revision expectations (+1): the second sentence becomes revision 4, restore of revision 2 becomes revision 5 with text "First sentence here.".
Add a rename check right after the document opens:
```ts
  await page.getByTestId("doc-title-field").fill("Draft, renamed");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 1/);
```

- [ ] **Step 6: Verify, mobile check, commit**

Run lint, typecheck, build, e2e. Then open the document page at 390px wide (Playwright `page.setViewportSize` in a scratch script or the browser pane) and confirm: toolbar wraps, history collapses below the editor, no horizontal scroll.
```bash
git add apps/web
git commit -m "feat(web): editor toolbar, word count, title field, collapsible history

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage (§9 and the approved direction): shadcn + Tailwind (T2), Geist with Fraunces wordmark (T2), purple accent (T2 tokens), app shell (T2), sign-in with product explanation (T3), projects cards with meta + rename/delete (T1, T3), stage selector persisted (T1, T4), documents list meta (T4), toolbar + word count + title + collapsible history (T5), import steps + dropzone + progress (T4), empty/loading/error states (T3, T4, T5). Dark mode deliberately out (user choice).
- Review Focus: 1 → T1 contract + route, T3 e2e; 2 → T1 route, T4 e2e; 3 → T1 route; 4 → T5 e2e; 5 → T1 contract, T3 e2e.
- Type consistency: `ProjectSummary` fields `documentCount`, `lastEditedAt` used by `ProjectRow` in T3 (as ISO string); `PROJECT_STAGES` keys equal `STAGES` keys in T2; `restore-<seq>`, `revision-list`, `save-status` preserved.
- Known limits: no `GET /projects/:id`, so pages filter the list (fine for tens of projects; add the route in phase 2). Document delete is not in scope. Dark mode not in scope.
