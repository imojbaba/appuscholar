import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { stageLabel } from "@/lib/stages";
import { plural, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProjectActions } from "./ProjectActions";
export type ProjectRow = { id: string; title: string; stage: string; status: string; createdAt: string; documentCount: number; lastEditedAt: string | null };
export function ProjectCard({ p, onRename, onDelete, onStatus }: { p: ProjectRow; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void>; onStatus: (s: "active" | "complete") => Promise<void> }) {
  return (
    <Card className={cn("flex items-start justify-between gap-3 p-4", p.status === "complete" && "opacity-80")} data-testid="project-card">
      <div className="min-w-0">
        <Link href={`/projects/${p.id}`} className="block truncate text-base font-medium hover:underline" data-testid="project-link">{p.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Badge variant="secondary">{stageLabel(p.stage)}</Badge>
          {p.status === "complete" ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600" data-testid="project-complete-badge">Complete</Badge> : null}
          <span>{p.documentCount === 0 ? "No documents yet" : plural(p.documentCount, "document", "documents")}</span>
          <span>Edited {relativeTime(p.lastEditedAt ?? p.createdAt)}</span>
        </div>
      </div>
      <ProjectActions title={p.title} documentCount={p.documentCount} status={p.status} onRename={onRename} onDelete={onDelete} onStatus={onStatus} />
    </Card>
  );
}
