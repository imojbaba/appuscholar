import { ProjectShell } from "@/components/frame/ProjectShell";
import { FirstRun } from "@/components/frame/FirstRun";

/** First run: a new project (Task 9 makes it the rough idea, its feasibility read and the project). `?move=<document id>` moves that document into it. */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ move?: string }> }) {
  const { move } = await searchParams;
  return <ProjectShell projectId={null}><FirstRun moveDocId={move || undefined} /></ProjectShell>;
}
