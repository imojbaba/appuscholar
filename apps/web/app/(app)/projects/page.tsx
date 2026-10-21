import { ProjectShell } from "@/components/frame/ProjectShell";
import { ProjectList } from "@/components/frame/ProjectList";

/** All projects. `?import=1` (the old /import link, through `/`) opens the v1 backup import here. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const { import: imp } = await searchParams;
  return <ProjectShell projectId={null} openImportV1={imp === "1"}><ProjectList /></ProjectShell>;
}
