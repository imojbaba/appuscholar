"use client";
import { useCallback, useEffect, useState } from "react";
import type { ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { SuggestionProvider } from "@/lib/ai/suggestion";
import { CiteLibraryProvider } from "@/lib/cite/useLibrary";
import { isPopoutTool, type PopoutTool } from "@/lib/popout/sync";
import type { ToolId } from "@/lib/tools";
import { Skeleton } from "@/components/ui/skeleton";
import { CitePanel } from "@/components/tools/cite/CitePanel";
import { ResearchPanel } from "@/components/tools/research/ResearchPanel";
import { AnalysePanel } from "@/components/tools/analyse/AnalysePanel";
import { ChromeDialogs } from "@/components/workspace/ChromeDialogs";
import { byCreated } from "@/components/frame/ProjectShell";
import { ProjectProvider, type DocumentSummary, type PendingAnalyse, type Project, type ProjectValue } from "@/components/frame/ProjectContext";

/**
 * The pop-out window (v1 boot 13692-13696: `body.popout`, `showTool(POPOUT)`): one tool alone, the Citation Manager or Research, with no sidebar, dock,
 * document or editor. Any other `tool` shows v1's pop_unsupported. Its inserts go to the writing window (lib/popout/sync.ts); it writes only the
 * citations, the retraction cache and the Reading shelf's papers (the guard in the blob client, R29). Register row D-S2-17.
 */
export function Popout({ tool }: { tool: string | undefined }) {
  const t = useT();
  if (!isPopoutTool(tool)) return <main className="popout"><p className="desc" data-testid="popout-unsupported">{t("pop_unsupported")}</p></main>;
  return <PopoutWorkspace tool={tool} />;
}

const noop = () => {};

/** The tool a Literature place's address names here: Find is Research, Reading list is Analyse a paper, Citations the Citation Manager. */
function toolOf(href: string): ToolId | null {
  const tab = /\/lit\/([^/?#]+)/.exec(href)?.[1];
  return tab === "find" ? "research" : tab === "reading" ? "analyse" : tab === "citations" ? "cite" : null;
}

/**
 * The workspace the panels read, made small: the student's active project (the scratch project in scratch space) and its documents list (for the
 * Citation Manager's "Cited in"), never a document created or opened, no editor. The panels' workspace actions do what v1's do in a pop-out:
 * `go` to a Literature place switches the tool this window shows (v1 showTool there; Research's "📄 Analyse this paper" opens Analyse a paper
 * here), the AI pane and the document list have nothing to act on, and the dialogs (the AI key, the vault's passphrase) open here. It shows no
 * stage (Task 13 rebuilds it as a pop-out of any place).
 */
function PopoutWorkspace({ tool }: { tool: PopoutTool }) {
  const t = useT();
  const { me } = useSettings();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId>(tool);
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  const [pendingAnalyse, setPendingAnalyse] = useState<PendingAnalyse | null>(null);
  const [dialog, setDialog] = useState<ProjectValue["dialog"]>(null);
  const [settingsProvider, setSettingsProvider] = useState<ProviderId | null>(null);

  const userId = me?.id;
  const activeProjectId = me?.activeProjectId ?? null;
  const scratchProjectId = me?.scratchProjectId;

  useEffect(() => {
    if (!userId || !scratchProjectId) return;
    let live = true;
    (async () => {
      const proj = activeProjectId ? (await apiFetch<Project[]>("/projects")).find((x) => x.id === activeProjectId) ?? null : null;
      const pid = proj ? proj.id : scratchProjectId;
      // Read only: unlike the writing window, an empty project gets no first document from here.
      const docs = await apiFetch<DocumentSummary[]>(`/projects/${pid}/documents`);
      return { proj, pid, docs };
    })().then((r) => {
      if (!live) return;
      setProject(r.proj);
      setProjectId(r.pid);
      setDocuments(byCreated(r.docs));
      setReady(true);
    }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [userId, activeProjectId, scratchProjectId]);

  const reloadDocs = useCallback(async () => {
    if (projectId) setDocuments(byCreated(await apiFetch<DocumentSummary[]>(`/projects/${projectId}/documents`)));
  }, [projectId]);
  const reloadProject = useCallback(async () => {
    if (activeProjectId) setProject((await apiFetch<Project[]>("/projects")).find((x) => x.id === activeProjectId) ?? null);
  }, [activeProjectId]);

  const value: ProjectValue = {
    place: null, go: async (href) => { const tool = toolOf(href); if (tool) setActiveTool(tool); return true; }, openProject: async () => false,
    pendingSearch, setPendingSearch, pendingAnalyse, setPendingAnalyse, dockShow: noop, aiWaiting: false, setAiWaiting: noop,
    project, projectId, documents, currentDoc: null,
    // No document is shown in a pop-out (v1's docSwitch there loads the hidden editor and saves nothing).
    selectDoc: async () => false, restoreDocument: async () => false, reloadDocs, patchDoc: noop, registerFlush: noop, flushOpen: async () => true,
    wordCount: null, setWordCount: noop, reloadProject,
    dialog, startImport: noop, importNames: [], runImport: async () => {},
    openHelp: () => setDialog("help"), openImportV1: noop, openTerms: () => setDialog("terms"), openWelcome: () => setDialog("welcome"), openMyWriting: noop,
    openSettings: (provider) => { setSettingsProvider(provider ?? null); setDialog("settings"); }, settingsProvider, closeDialog: () => setDialog(null)
  };

  const panel = activeTool === "cite" ? <CitePanel /> : activeTool === "research" ? <ResearchPanel /> : activeTool === "analyse" ? <AnalysePanel /> : <p className="desc">{t("pop_unsupported")}</p>;
  return (
    <ProjectProvider value={value}>
      <SuggestionProvider>
        <CiteLibraryProvider>
          <ChromeDialogs />
          {ready ? (
            <main className="popout" data-testid="popout">{panel}</main>
          ) : error ? (
            <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">Could not load your workspace.</p>
          ) : (
            <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>
          )}
        </CiteLibraryProvider>
      </SuggestionProvider>
    </ProjectProvider>
  );
}
