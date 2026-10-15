/** Progress of the "Save as research project" create flow, kept across retries so a failed step never repeats an earlier one. */
export type SaveAsProgress = { projectId?: string; title?: string; moved?: boolean };

/**
 * The create flow is several requests. Each step that succeeded is recorded in `progress`, so running this again after a failure
 * resumes at the failed step: the project is created at most once and the document is moved at most once.
 */
export async function runCreateFlow(progress: SaveAsProgress, steps: { create(): Promise<{ id: string; title: string }>; move: ((projectId: string) => Promise<void>) | null; activate(projectId: string): Promise<void> }): Promise<{ id: string; title: string }> {
  if (!progress.projectId) {
    const p = await steps.create();
    progress.projectId = p.id; progress.title = p.title;
  }
  const id = progress.projectId;
  if (steps.move && !progress.moved) { await steps.move(id); progress.moved = true; }
  await steps.activate(id);
  return { id, title: progress.title ?? "" };
}
