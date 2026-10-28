import { ProjectShell } from "@/components/frame/ProjectShell";

/**
 * A project's layout: the shell keeps the project, its documents and the open editor mounted while the student moves between its home and its
 * places. Keyed by the project, so opening another one starts from a fresh load.
 */
export default async function ProjectLayout({ params, children }: { params: Promise<{ projectId: string }>; children: React.ReactNode }) {
  const { projectId } = await params;
  return <ProjectShell key={projectId} projectId={projectId}>{children}</ProjectShell>;
}
