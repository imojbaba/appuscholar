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
import { useProjectWork, type ProjectWork } from "@/lib/frame/useProjectWork";
import type { StageKey } from "@/lib/tools";
import { PHONE_QUERY, useMedia } from "@/lib/useMedia";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { useProject, type ProjectValue } from "./ProjectContext";
import { QuestionCard, QuestionFold } from "./QuestionCard";
import { Switcher } from "./AppHeader";
import { StageRows } from "./StageRows";
import { SuggestedNext } from "./SuggestedNext";

const NO_WORK: StageWork = { blobs: [], draftWords: 0, draftEditedAt: null, stageMarks: {} };

/**
 * Each shelf paper's highlight count, by `projectId:paperId:version`, kept across visits home. The highlights live in the `shelf_paper:<id>`
 * blobs (each the paper's whole text), so a paper is read again only when its version moves; entries of papers gone, or of older versions, are dropped.
 */
export const highlightCache = new Map<string, number>();
const SHELF_PAPER = "shelf_paper:";
const cacheKey = (projectId: string, id: string, version: number): string => `${projectId}:${id}:${version}`;

/**
 * Each shelf paper's highlight count, by its shelf id. The papers and their versions come from the `?include=work` entry's `shelf_paper:*` blobs;
 * a paper not in highlightCache at that version is read once (read-only, the shelf's own client), again after the vault opens if it was locked.
 * The stage states never wait for them.
 */
function useHighlightCounts(projectId: string | null, mine: ProjectWork | null): Record<string, number> {
  const vault = useVault();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const open = vault.status === "unlocked" || vault.status === "migrating";
  const [, setTick] = useState(0);
  const papers = useMemo(() => (mine?.blobs ?? []).filter((b) => b.kind.startsWith(SHELF_PAPER)).map((b) => ({ id: b.kind.slice(SHELF_PAPER.length), version: b.version })), [mine]);
  const key = papers.map((p) => `${p.id}:${p.version}`).join("\n");
  // Before the work answers nothing is known of the papers, so nothing is read or dropped.
  const have = mine !== null;
  useEffect(() => {
    if (!projectId || !have) return;
    const live = new Set(papers.map((p) => cacheKey(projectId, p.id, p.version)));
    for (const k of [...highlightCache.keys()]) if (k.startsWith(projectId + ":") && !live.has(k)) highlightCache.delete(k);
    const clients = papers.filter((p) => !highlightCache.has(cacheKey(projectId, p.id, p.version))).map((p) => {
      const c = projectBlobClient(shelfPaperKind(p.id), projectId, () => vaultRef.current, (s) => {
        // A paper that does not open counts no highlights; a failed or locked read is not kept, so the next visit (or the vault opening) reads it again.
        if (s.loading || s.locked || s.error) return;
        highlightCache.set(cacheKey(projectId, p.id, p.version), s.value?.notes.length ?? 0);
        setTick((n) => n + 1);
      }, { readOnly: true });
      void c.start();
      return c;
    });
    return () => { for (const c of clients) c.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `papers`; `open` reads a paper that was locked again once the vault opens
  }, [projectId, key, have, open]);
  const counts: Record<string, number> = {};
  if (projectId) for (const p of papers) { const n = highlightCache.get(cacheKey(projectId, p.id, p.version)); if (n !== undefined) counts[p.id] = n; }
  return counts;
}

/**
 * The project's home (canvas Main): the question, a suggested next step, the six stages with their states, and the way to take the work out.
 * Every stage's state comes from one `GET /projects?include=work`; the facts from the project's idea, library, shelf and notes. A failed load says
 * so with Retry (which reads it all again), never an empty card. Not here yet: "Needs your attention" (Task 24) and "Recent work" (nothing records activity).
 * On a phone (canvas Phone) it is one column: the project button, the question closed, the suggestion, the stages, Export project.
 */
export function ProjectHome() {
  const [attempt, setAttempt] = useState(0);
  return <HomeLoad key={attempt} retry={() => setAttempt((n) => n + 1)} />;
}

function HomeLoad({ retry }: { retry(): void }) {
  const t = useT();
  const { me } = useSettings();
  const vault = useVault();
  const pv = useProject();
  const { project, projectId, go } = pv;
  const title = useTitle(project, "project");
  const { work, error: workFailed, reload } = useProjectWork();
  const idea = useProjectBlob("idea_intake", projectId);
  const citations = useProjectBlob("citations", projectId);
  const shelf = useProjectBlob("shelf_index", projectId);
  const notes = useProjectBlob("ap_notes", projectId);
  const mine = work?.find((w) => w.id === projectId) ?? null;
  const highlights = useHighlightCounts(projectId, mine);
  if (!projectId) return null;

  const facts = homeFacts({ idea: idea.value, citations: citations.value, shelfIndex: shelf.value, apNotes: notes.value }, mine?.draftWords ?? 0, project?.field ?? "", highlights);
  const blobs = [idea, citations, shelf, notes];
  const locked = blobs.some((b) => b.locked);
  // A read that failed has no value: shown as empty it would say "No question yet" of a project that has one.
  const failed = workFailed || blobs.some((b) => b.error && !b.loading);
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
      ) : failed ? (
        <div className="home-card home-locked" role="alert" data-testid="home-error">
          <p>{t("home_load_fail")}</p>
          <button type="button" className="home-btn" onClick={retry} data-testid="home-retry">{t("home_retry")}</button>
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
  const phone = useMedia(PHONE_QUERY);
  const next = suggestNext(facts);
  if (phone) return (
    <div className="home-phone" data-testid="home-phone">
      <Switcher home />
      <QuestionFold facts={facts} onEdit={() => open("idea")} />
      <SuggestedNext next={next} facts={facts} onOpen={() => open(next.to.stage, next.to.tab)} />
      <StageRows compact states={states} facts={facts} onOpen={(s) => open(s)} onMark={(s, r) => { void mark(s, r); }} />
      {/* "Needs your attention" comes here with Task 24. */}
      <button type="button" className="home-btn home-export" onClick={() => pv.openExport()} data-testid="home-export">{t("home_out_btn")}</button>
    </div>
  );
  return (
    <div className="home-grid">
      <div className="home-side">
        <QuestionCard facts={facts} onEdit={() => open("idea")} />
        <section className="home-card home-out" data-testid="home-out">
          <h2>{t("home_out_h")}</h2>
          <p>{t("home_out_desc")}</p>
          {/* The project's export place (Task 12), with the default parts ticked. */}
          <button type="button" className="home-btn" onClick={() => pv.openExport()} data-testid="home-export">{t("home_out_btn")}</button>
        </section>
      </div>
      <div className="home-main">
        <SuggestedNext next={next} facts={facts} onOpen={() => open(next.to.stage, next.to.tab)} />
        <StageRows states={states} facts={facts} onOpen={(s) => open(s)} onMark={(s, r) => { void mark(s, r); }} />
      </div>
    </div>
  );
}
