import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";

/**
 * Participants (spec 2026-10-24-participants-design.md §5): Collection and analysis' first tab, the student's list of the people in the study with their
 * names, stored sealed in the vault and used to swap names for codes in the study's data, documents and AI requests. Task 5 builds the module, its place
 * and the list's state (lib/tools/participants: list.ts, useParticipants.ts, store.ts); Task 6 draws the tab (list, add, edit and paste) and turns the module on; Task 9 adds Find names
 * and the DocumentLayer, which paints the names of the open document (CSS Custom Highlight API, mounted once by the project shell in the writing window); Task 11 adds the home's line
 * (`facts`) and the AI request's check (lib/ai/names.ts, callAI.ts).
 * The module's shape is in lib/tools/registry.ts; this file stays light and imports the registry for types only.
 */
export const built = true;
export { Panel } from "./Panel";
export { DocumentLayer } from "./DocumentLayer";

/**
 * The home's line for Collection and analysis: how many people are on the list ("5 participants"). Counts only, never a name (spec §2 anti-goals and §5). The people on the list, a person
 * who withdrew included: the same number the Participants tab's count line starts with ("5 people · 1 withdrawn"). None until somebody is on the list; a destroyed list holds nobody.
 * The blob is read by the home (it is a stage kind), so a list that is locked or does not open gives no value and no line.
 */
export function facts(b: StageBlobs): ToolFacts {
  const people = (b.participants?.value as { people?: unknown } | null | undefined)?.people;
  const n = Array.isArray(people) ? people.length : 0;
  return n > 0 ? { started: true, detail: n === 1 ? "pp_facts_one" : "pp_facts", vars: { n } } : { started: false };
}
