/**
 * The project first run has just made, so its home can say once what was saved and where things are (the first session: Dr. Sharma, 2026-10-26,
 * could not tell what had been made or where he was). Kept for this tab (sessionStorage, so a reload of the home still shows it) until the panel is
 * dismissed; storage that is blocked keeps it in memory for the page.
 */
export type JustMade = { id: string; checked: boolean };

const KEY = "appu_just_made";
let memory: JustMade | null = null;

export function markJustMade(id: string, checked: boolean): void {
  memory = { id, checked };
  try { sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* storage blocked: memory only */ }
}

/** What first run made, when it is `projectId`; else null. */
export function readJustMade(projectId: string): JustMade | null {
  let v = memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) v = JSON.parse(raw) as JustMade;
  } catch { /* storage blocked or not JSON: memory */ }
  return v && v.id === projectId ? v : null;
}

export function clearJustMade(): void {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
