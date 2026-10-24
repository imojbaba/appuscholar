/**
 * Participants (spec 2026-10-24-participants-design.md §5): Collection and analysis' first tab, the student's list of the people in the study with their
 * names, stored sealed in the vault and used to swap names for codes in the study's data, documents and AI requests. Task 5 builds the module, its place
 * and the list's state (lib/tools/participants: list.ts, useParticipants.ts, store.ts); the Panel is Task 6, so the tab reads "Not built yet" until it turns `built` on.
 * The module's shape is in lib/tools/registry.ts; this file stays light and imports the registry for types only.
 */
export const built = false;
