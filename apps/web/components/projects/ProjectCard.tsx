"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { stageLabel } from "@/lib/stages";
import { plural, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProjectActions } from "./ProjectActions";
import { useT } from "@/lib/i18n";
export type ProjectRow = { id: string; title: string; stage: string; status: string; createdAt: string; documentCount: number; lastEditedAt: string | null };
export function ProjectCard({ p, onRename, onDelete, onStatus }: { p: ProjectRow; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void>; onStatus: (s: "active" | "complete") => Promise<void> }) {
  const t = useT();
  const complete = p.status === "complete";
  return (
    <Card className="flex min-w-0 flex-row items-start justify-between gap-3 rounded-lg p-4" data-testid="project-card">
      <div className="min-w-0 flex-1">
        <Link href={`/projects/${p.id}`} className={cn("block truncate text-base font-medium hover:underline", complete && "text-muted-foreground")} data-testid="project-link">{p.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {complete
            ? <Badge className="bg-emerald-700 text-white" data-testid="project-complete-badge">{t("project_complete_badge")}</Badge>
            : <Badge variant="secondary">{stageLabel(p.stage)}</Badge>}
          <span>{p.documentCount === 0 ? "No documents yet" : plural(p.documentCount, "document", "documents")}</span>
          <span>Edited {relativeTime(p.lastEditedAt ?? p.createdAt)}</span>
        </div>
      </div>
      <ProjectActions title={p.title} documentCount={p.documentCount} status={p.status} onRename={onRename} onDelete={onDelete} onStatus={onStatus} />
    </Card>
  );
}
