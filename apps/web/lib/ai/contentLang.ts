/**
 * The content language a request is written in: the open project's, else the default in Settings (v1 getContentLang 2472); a default never set
 * follows the page's language (first-run build spec, OJ 2026-10-27).
 */
export function contentLangOf(project: { contentLang?: string } | null | undefined, settings: { contentLang?: string; lang?: string }): "en" | "hi" {
  if (project) return project.contentLang === "hi" ? "hi" : "en";
  return (settings.contentLang ?? settings.lang) === "hi" ? "hi" : "en";
}
