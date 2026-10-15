import { ProjectList } from "@/components/projects/ProjectList";
export default function Projects() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Research Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">One project per study. It names your work, then walks you through its six stages.</p>
      </div>
      <ProjectList />
    </div>
  );
}
