"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings, type Settings } from "@/lib/settings";
import { STAGE_FIRST_TOOL, TOOL_TO_STAGE, isStageKey, isToolId, type StageKey, type ToolId } from "@/lib/tools";
import { Editor } from "@/components/editor/Editor";
import { TitleField } from "@/components/editor/TitleField";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dock } from "./Dock";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Subbar } from "./Subbar";
import { WorkspaceProvider, type DocumentSummary, type DocumentWithBody, type Project, type WorkspaceValue } from "./WorkspaceContext";

type Loaded = { project: Project | null; projectId: string; documents: DocumentSummary[]; doc: DocumentWithBody | null };

async function listOrSeed(projectId: string): Promise<DocumentSummary[]> {
  const list = await apiFetch<DocumentSummary[]>(`/projects/${projectId}/documents`);
  if (list.length) return list;
  // A project always has a document to write in (v1 always had one).
  const made = await apiFetch<DocumentWithBody>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title: "Untitled" }) });
  return [made];
}

export function Workspace() {
  const t = useT();
  const { me, settings, update } = useSettings();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocumentWithBody | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("idea");
  const [dock, setDock] = useState<"tools" | "ai">("tools");
  const [aiWaiting] = useState(false); // Task 14 raises this when an AI suggestion is waiting.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const docToken = useRef(0);
  // One load per project even when React runs the effect twice in development, so the first document is never created twice.
  const loading = useRef<{ key: string; p: Promise<Loaded> } | null>(null);

  const userId = me?.id;
  const activeProjectId = me?.activeProjectId ?? null;
  const scratchProjectId = me?.scratchProjectId;

  useEffect(() => {
    if (!userId || !scratchProjectId) return;
    const key = `${userId}:${activeProjectId}:${scratchProjectId}`;
    if (loading.current?.key !== key) {
      loading.current = {
        key,
        p: (async (): Promise<Loaded> => {
          let proj: Project | null = null;
          if (activeProjectId) proj = (await apiFetch<Project[]>("/projects")).find((x) => x.id === activeProjectId) ?? null;
          const pid = proj ? proj.id : scratchProjectId;
          const docs = await listOrSeed(pid);
          const first = docs[0];
          const doc = first ? await apiFetch<DocumentWithBody>(`/documents/${first.id}`) : null;
          return { project: proj, projectId: pid, documents: docs, doc };
        })()
      };
    }
    let live = true;
    loading.current.p.then((r) => {
      if (!live) return;
      setProject(r.project);
      setProjectId(r.projectId);
      setDocuments(r.documents);
      setCurrentDoc(r.doc);
      const remembered = settingsRef.current.toolTab;
      setActiveTool(isToolId(remembered) ? remembered : r.project && isStageKey(r.project.stage) ? STAGE_FIRST_TOOL[r.project.stage] : "idea");
      setReady(true);
    }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [userId, activeProjectId, scratchProjectId]);

  const collapsed = useMemo(() => (settings.stageGroupsCollapsed ?? []).filter(isStageKey) as StageKey[], [settings.stageGroupsCollapsed]);
  const sidebarCollapsed = settings.sidebarCollapsed ?? false;

  const showTool = useCallback((id: ToolId) => {
    setActiveTool(id);
    setDock("tools");
    const patch: Settings = { toolTab: id };
    // Opening a tool whose group was collapsed expands that one group (v1 showTool).
    const stage = TOOL_TO_STAGE[id];
    const open = (settingsRef.current.stageGroupsCollapsed ?? []);
    if (open.includes(stage)) patch.stageGroupsCollapsed = open.filter((s) => s !== stage);
    void update(patch);
  }, [update]);

  const selectDoc = useCallback(async (id: string) => {
    const mine = ++docToken.current;
    const doc = await apiFetch<DocumentWithBody>(`/documents/${id}`);
    if (mine === docToken.current) setCurrentDoc(doc);
  }, []);

  const reloadDocs = useCallback(async () => {
    if (!projectId) return;
    const list = await listOrSeed(projectId);
    setDocuments(list);
    const keep = currentDoc && list.some((d) => d.id === currentDoc.id) ? currentDoc.id : list[0]?.id;
    if (keep && keep !== currentDoc?.id) await selectDoc(keep);
  }, [projectId, currentDoc, selectDoc]);

  const currentStage: StageKey | null = project && project.status !== "complete" && isStageKey(project.stage) ? project.stage : null;

  const value: WorkspaceValue = {
    activeTool, showTool, dock, dockShow: setDock, aiWaiting, sidebarCollapsed, stageGroupsCollapsed: collapsed,
    currentStage, project, documents, currentDoc, selectDoc, reloadDocs
  };

  const dockW = settings.dockW ?? 440;
  return (
    <WorkspaceProvider value={value}>
      <Header />
      <Subbar />
      <div className="projbar" data-testid="project-bar">
        {project ? (
          <div className="label"><span>{project.title}</span>{isStageKey(project.stage) && <Badge variant="stage">{t("stage_" + project.stage)}</Badge>}</div>
        ) : (
          <div className="label scratch">{t("project_bar_empty")}</div>
        )}
      </div>
      {ready ? (
        <main className={"ws" + (sidebarCollapsed ? " rail" : "")} style={{ "--dock-w": dockW + "px" } as React.CSSProperties}>
          <Sidebar />
          <section className="doc" aria-label="Your document">
            {currentDoc && (
              <>
                <TitleField key={"t" + currentDoc.id} docId={currentDoc.id} title={currentDoc.title} onRenamed={(title) => {
                  setCurrentDoc((d) => (d ? { ...d, title } : d));
                  setDocuments((list) => list.map((d) => (d.id === currentDoc.id ? { ...d, title } : d)));
                }} />
                <Editor key={currentDoc.id} docId={currentDoc.id} initialHtml={currentDoc.bodyHtml} initialSeq={currentDoc.currentSeq} />
              </>
            )}
          </section>
          <Dock />
        </main>
      ) : error ? (
        <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">Could not load your workspace.</p>
      ) : (
        <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>
      )}
    </WorkspaceProvider>
  );
}
