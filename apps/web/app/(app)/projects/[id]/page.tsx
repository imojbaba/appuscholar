"use client";
import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { StageStrip } from "@/components/projects/StageStrip";
import { StageIntro } from "@/components/projects/StageIntro";
import { DocumentList } from "@/components/documents/DocumentList";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
type Project = { id: string; title: string; stage: string; status: string };

function ProjectPageInner({ id }: { id: string }) {
  const intro = useSearchParams().get("intro") === "1";
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  useEffect(() => {
    apiFetch<Project[]>("/projects").then(list => setProject(list.find(p => p.id === id) ?? null)).catch(() => setProject(null));
  }, [id]);
  if (project === undefined) return <div className="grid gap-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-24" /></div>;
  if (project === null) return <p role="alert" data-testid="error-msg">This project could not be loaded. It may have been deleted.</p>;
  return (
    <div className="grid gap-6">
      <Breadcrumb items={[{ href: "/projects", label: "Research Projects" }, { label: project.title }]} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        {project.status === "complete" ? <Badge className="bg-emerald-700 text-white" data-testid="project-complete-badge">Complete</Badge> : null}
      </div>
      <StageStrip projectId={project.id} stage={project.stage} />
      <DocumentList projectId={project.id} />
      {intro ? <StageIntro projectId={project.id} projectTitle={project.title} stage={project.stage} open /> : null}
    </div>
  );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={null}><ProjectPageInner id={id} /></Suspense>;
}
