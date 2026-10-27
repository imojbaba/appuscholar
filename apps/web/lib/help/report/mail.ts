/** Hands the report to the student's own mail app (v1 repSend sets `location.href`). The one place that navigates, so a test can stand in for it. */
export function openMail(href: string): void { window.location.href = href; }
