"use client";
import Link from "next/link";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { designDashboard, type DesignKey } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { placeHref } from "@/lib/frame/places";
import { TOOL_TABS } from "@/lib/tools/tabs";
import { useDesignStatus } from "@/lib/tools/design/useDesign";
import { Notes } from "./Notes";

/** Each of core's six items opens its own tab (v1's rows opened that sub-tool's dialog). */
const TAB_OF: Record<DesignKey, string> = { reg: "pathway", proto: "protocol", ec: "ethics", ctri: "registration", pi: "investigator", budget: "budget" };

/** The stage each tab id belongs to, read from the registry's tab data (so the place's address is never spelled out here). */
const STAGE_OF = Object.fromEntries(TOOL_TABS.map((x) => [x.tab, x.stage]));

/**
 * The Design and ethics overview (v1 designRenderDash 5884-5897 and the panel 756-766): the panel's sentence, "N of 6 ready" from designDashboard over
 * the six blobs' done flags, six rows each a link to its tab with a mark that is a word as well as an icon, and the AI-use statement as a seventh row
 * that has no mark and is not counted (v1: the seventh button was outside the count). Nothing here rules on anything; the committee decides.
 */
export function Overview({ projectId }: { projectId: string }) {
  const t = useT();
  const s = useDesignStatus(projectId);
  const dash = designDashboard(s.done);
  const link = (key: string, tab: string, mark: boolean | null) => (
    <li key={key}>
      <Link href={placeHref(projectId, STAGE_OF[tab]!, tab)} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-[13.5px] text-ink hover:bg-soft" data-testid={"design-row-" + key}>
        {mark === null
          ? <span className="inline-block size-[18px] shrink-0" aria-hidden="true" />
          : mark
            ? <CheckCircle size={18} weight="fill" className="shrink-0 text-ok-ink" aria-hidden="true" />
            : <Circle size={18} className="shrink-0 text-muted" aria-hidden="true" />}
        {mark !== null && <span className="sr-only">{mark ? t("design_mark_ready") : t("design_mark_not_ready")}</span>}
        <span data-testid="design-label">{t("design_row_" + key)}</span>
      </Link>
    </li>
  );
  return (
    <div className="panel" data-testid="panel-design-overview">
      <h3>{t("tab_name_overview")}</h3>
      <p className="desc" data-testid="design-desc">{t("design_panel_desc")}</p>
      <Notes loading={s.loading} locked={s.locked} broken={s.broken} readFailed={s.readFailed} saveFailed={s.saveFailed} />
      {/* While the saved work is opening, locked or could not be read the count would be a false "0 of 6" over work that may exist: the notes above say why. */}
      {!(s.loading || s.locked || s.readFailed) && (
        <p className="desc" style={{ marginBottom: 6 }}><b data-testid="design-count">{t("design_home_ready", { done: dash.done, total: dash.total })}</b></p>
      )}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label={t("design_rows_label")} data-testid="design-rows">
        {dash.items.map((i) => link(i.key, TAB_OF[i.key], i.done))}
        {link("aiuse", "aiuse", null)}
      </ul>
    </div>
  );
}
