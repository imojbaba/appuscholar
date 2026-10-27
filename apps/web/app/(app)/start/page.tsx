import { ProjectShell } from "@/components/frame/ProjectShell";
import { NewStudy } from "@/components/frame/NewStudy";

/** Start a new study: its name, type and field, then it opens on Shape your study. `?move=<document id>` moves that document into it. */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ move?: string }> }) {
  const { move } = await searchParams;
  return <ProjectShell projectId={null}><NewStudy moveDocId={move || undefined} /></ProjectShell>;
}
