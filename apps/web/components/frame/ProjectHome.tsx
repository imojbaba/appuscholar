"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { projectBlobClient, useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { shelfPaperKind } from "@/lib/blobs/kinds";
import { useVault } from "@/lib/vault/useVault";
import { useTitle } from "@/lib/vault/titles";
import { homeFacts } from "@/lib/frame/homeFacts";
import { suggestNext } from "@/lib/frame/suggest";
import { stageStates, type StageWork } from "@/lib/frame/stages";
import { placeHref } from "@/lib/frame/places";
import { useProjectWork } from "@/lib/frame/useProjectWork";
import type { StageKey } from "@/lib/tools";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { useProject, type ProjectValue } from "./ProjectContext";
import { QuestionCard } from "./QuestionCard";
import { StageRows } from "./StageRows";
import { SuggestedNext } from "./SuggestedNext";

const NO_WORK: StageWork = { blobs: [], draftWords: 0, draftEditedAt: null, stageMarks: {} };

/**
 * Each shelf paper's highlight count, by its shelf id. The highlights live in the `shelf_paper:<id>` blobs, so each paper is read once (read-only,
 * the shelf's own client); the stage states never wait for them (they come from the one `?include=work` request).
 */
function useHighlightCounts(projectId: string | null, ids: string[]): Record<string, number> {
  const vault = useVault();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const [counts, setCounts] = useState<{ projectId: string | null; map: Record<string, number> }>({ projectId, map: {} });
  const key = ids.join("\n");
  useEffect(() => {
    if (!projectId || !key) return;
    const clients = key.split("\n").map((id) => {
      const c = projectBlobClient(shelfPaperKind(id), projectId, () => vaultRef.current, (s) => {
        if (!s.value) return;
        const n = s.value.notes.length;
        setCounts((prev) => ({ projectId, map: { ...(prev.projectId === projectId ? prev.map : {}), [id]: n } }));
      }, { readOnly: true });
      void c.start();
      return c;
    });
    return () => { for (const c of clients) c.dispose(); };
  }, [projectId, key]);
  return counts.projectId === projectId ? counts.map : {};
}

/**
 * The project's home (canvas Main): the question, a suggested next step, the six stages with their states, and the way to take the work out.
 * Every stage's state comes from one `GET /projects?include=work`; the facts from the project's idea, library, shelf and notes. Not here yet:
 * "Needs your attention" (Task 24) and "Recent work" (nothing records activity).
 */
export function ProjectHome() {
  const t = useT();
  const { me } = useSettings();
  const vault = useVault();
  const pv = useProject();
  const { project, projectId, go } = pv;
  const title = useTitle(project, "project");
  const { work, reload } = useProjectWork();
  const idea = useProjectBlob("idea_intake", projectId);
  const citations = useProjectBlob("citations", projectId);
  const shelf = useProjectBlob("shelf_index", projectId);
  const notes = useProjectBlob("ap_notes", projectId);
  const ids = useMemo(() => (shelf.value ?? []).map((p) => p.id), [shelf.value]);
  const highlights = useHighlightCounts(projectId, ids);
  if (!projectId) return null;

  const mine = work?.find((w) => w.id === projectId) ?? null;
  const facts = homeFacts({ idea: idea.value, citations: citations.value, shelfIndex: shelf.value, apNotes: notes.value }, mine?.draftWords ?? 0, project?.field ?? "", highlights);
  const blobs = [idea, citations, shelf, notes];
  const locked = blobs.some((b) => b.locked);
  const loading = work === null || blobs.some((b) => b.loading);
  const name = project ? title.text : projectId === me?.scratchProjectId ? t("scratch_name") : "";
  const open = (stage: StageKey, tab?: string) => { void go(placeHref(projectId, stage, tab)); };
  const mark = async (stage: StageKey, ready: boolean) => {
    try {
      await apiFetch(`/projects/${projectId}/stages/${stage}/ready`, { method: ready ? "POST" : "DELETE" });
      await reload();
    } catch { toast(t("home_mark_fail")); }
  };

  return (
    <section className="home" data-testid="project-home">
      <h1 className="sr-only" data-testid="home-title">{name}</h1>
      {locked ? (
        <div className="home-card home-locked" data-testid="home-locked">
          <p>{t("home_locked")}</p>
          <button type="button" className="home-btn" onClick={() => { void vault.ensureUnlocked(); }} data-testid="home-unlock">{t("home_unlock")}</button>
        </div>
      ) : loading ? (
        <PanelLoading testId="home-loading" />
      ) : (
        <HomeBody pv={pv} facts={facts} states={stageStates(mine ?? NO_WORK)} open={open} mark={mark} />
      )}
    </section>
  );
}

function HomeBody({ pv, facts, states, open, mark }: {
  pv: ProjectValue;
  facts: ReturnType<typeof homeFacts>;
  states: ReturnType<typeof stageStates>;
  open(stage: StageKey, tab?: string): void;
  mark(stage: StageKey, ready: boolean): Promise<void>;
}) {
  const t = useT();
  const next = suggestNext(facts);
  // The export place arrives with Task 12 (`openExport` on the project's value); until then the button says where the account export is.
  const openExport = (pv as ProjectValue & { openExport?: () => void }).openExport;
  return (
    <div className="home-grid">
      <div className="home-side">
        <QuestionCard facts={facts} onEdit={() => open("idea")} />
        <section className="home-card home-out" data-testid="home-out">
          <h2>{t("home_out_h")}</h2>
          <p>{t("home_out_desc")}</p>
          <button type="button" className="home-btn" disabled={!openExport} title={openExport ? undefined : t("home_out_soon")}
            onClick={() => openExport?.()} data-testid="home-export">{t("home_out_btn")}</button>
          {!openExport && <p className="home-out-soon">{t("home_out_soon")}</p>}
        </section>
      </div>
      <div className="home-main">
        <SuggestedNext next={next} facts={facts} onOpen={() => open(next.to.stage, next.to.tab)} />
        <StageRows states={states} facts={facts} onOpen={(s) => open(s)} onMark={(s, r) => { void mark(s, r); }} />
      </div>
    </div>
  );
}
