"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useTitle } from "@/lib/vault/titles";
import { PLACE_TABS, homeHref, placeHref } from "@/lib/frame/places";
import { Button } from "@/components/ui/button";
import type { StageKey } from "@/lib/tools";
import { useProject } from "./ProjectContext";

/**
 * The top of a place (canvas Find): "{project title} / {stage name}", the title linking home; the place's tabs, each a link; and the question as
 * a strip, closed by default, that opens to the topic with Edit (to the Idea place); and "Open my document" (Task 11) while the document is not
 * beside the place (Writing always shows it). "Open in a new window" (Task 13) and the feasibility verdict (the stored read, Task 9) join it later. A place that draws its own tabs (Literature, with its counts) passes them as `tabs`.
 */
export function PlaceHeader({ stage, tab, tabs: own }: { stage: StageKey; tab: string | null; tabs?: ReactNode }) {
  const t = useT();
  const { me } = useSettings();
  const { project, projectId, docOpen, openDocument } = useProject();
  const title = useTitle(project, "project");
  const id = projectId ?? "";
  const name = project ? title.text : projectId === me?.scratchProjectId ? t("scratch_name") : "";
  const tabs = PLACE_TABS[stage];
  return (
    <div className="place-hdr" data-testid="place-header">
      <div className="place-top">
        <nav className="place-crumbs" aria-label={t("place_crumbs")}>
          <Link href={homeHref(id)} data-testid="place-home">{name}</Link>
          <span aria-hidden="true">/</span>
          <span className="here" aria-current={tabs.length ? undefined : true} data-testid="place-name">{t("stage_name_" + stage)}</span>
        </nav>
        {stage !== "writing" && !docOpen && (
          <Button variant="ghost" size="sm" className="place-open-doc" data-testid="place-open-doc" onClick={openDocument}><FileText aria-hidden="true" />{t("place_open_doc")}</Button>
        )}
      </div>
      {own ?? (tabs.length > 0 && (
        <nav className="place-tabs" aria-label={t("stage_name_" + stage)} data-testid="place-tabs">
          {tabs.map((x) => (
            <Link key={x} href={placeHref(id, stage, x)} aria-current={x === tab || undefined} data-testid={"place-tab-" + x}>{t("tab_name_" + x)}</Link>
          ))}
        </nav>
      ))}
      {stage !== "idea" && <QuestionStrip />}
    </div>
  );
}

/** "Your question" (draft §5): closed by default; open, the topic as the student wrote it in the Idea place, and Edit. Read only once opened. */
function QuestionStrip() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <details className="place-q" data-testid="question-strip" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t("place_question")}</summary>
      {open && <QuestionBody />}
    </details>
  );
}

function QuestionBody() {
  const t = useT();
  const { projectId } = useProject();
  const { value, loading, locked } = useProjectBlob("idea_intake", projectId);
  const topic = value?.topic.trim() ?? "";
  return (
    <div className="place-q-body">
      <p data-testid="question-topic">{locked ? t("place_question_locked") : loading ? "" : topic || t("place_question_none")}</p>
      <Link href={placeHref(projectId ?? "", "idea")} data-testid="question-edit">{t("place_question_edit")}</Link>
    </div>
  );
}
