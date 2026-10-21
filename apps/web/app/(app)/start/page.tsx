import { ProjectShell } from "@/components/frame/ProjectShell";
import { FirstRun } from "@/components/frame/FirstRun";

/** First run: a new project (Task 9 makes it the rough idea, its feasibility read and the project). */
export default function StartPage() {
  return <ProjectShell projectId={null}><FirstRun /></ProjectShell>;
}
