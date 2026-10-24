"use client";
import { useState } from "react";
import { Copy, DownloadSimple, Trash } from "@phosphor-icons/react";
import { RECORD_FIELDS } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";
import { useProject } from "@/components/frame/ProjectContext";
import { downloadBlob } from "@/lib/export/download";
import { useTitle } from "@/lib/vault/titles";
import { todayIso } from "@/lib/tools/participants/dates";
import { listFileName } from "@/lib/tools/participants/file";
import { characteristicsTable, clearAbout, clearWho, destroyList, listCsv } from "@/lib/tools/participants/list";
import { driftKey, planDrift, type DriftItem, type ParticipantsPlan } from "@/lib/tools/participants/plan";
import { Button } from "@/components/ui/button";
import { DestroyDialog } from "./DestroyDialog";

/*
 * What the tab does with the whole list (spec 2026-10-24-participants-design.md §5; calls C7, C9 and C15; ruling R25), for a list that has people on it:
 *
 * - Copy as table (codes, no names): the code, the made-up name in made-up names mode and the about-them columns, tab-separated so it pastes into Word and Excel. Never a name, a spelling,
 *   contact or roll (list.ts characteristicsTable leaves them out by construction). "Copied" is a line in the page, never a toast: no name goes near one.
 * - Download the list: every field, as a CSV named participant-list-<project title>.csv, UTF-8 with a byte-order mark as Statistics' key file is. The file holds names, and the line beside
 *   the button says so.
 * - Destroy the list: a dialog in the page that asks twice (DestroyDialog), then the list is written with nobody on it (list.ts destroyList), keeping the next code and the date.
 * - The switch "Highlight names in my documents" (C9): `highlight` on the list; absent is on.
 *
 * PlanNotes is the other half: what the plan no longer records but the list still holds (C15). Plan changes never delete; each field gets its line with "Remove these values", which
 * clears that field for everyone in one save, and an anonymous plan with people on the list says so and points to Destroy.
 */

/** A change that did not land says the same thing everywhere on the tab: the line the tab gives (a window that may not write says where the list can be changed). */
type Refused = () => string;

export function Actions({ list, plan, labels, save, refused, onDestroyed }: {
  list: ParticipantList;
  plan: ParticipantsPlan;
  /** The headings of the about-them fields, by key. */
  labels: Record<string, string>;
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  refused: Refused;
  /** The list was destroyed: the tab moves focus to where the student goes on. */
  onDestroyed(): void;
}) {
  const t = useT();
  const { project } = useProject();
  const title = useTitle(project, "project");
  // The result of the last copy, for the list it copied: the line goes when the list changes, since it would then speak of a table that is no longer the list's.
  const [copy, setCopy] = useState<{ of: ParticipantList; ok: boolean } | null>(null);
  const copied = copy && copy.of === list ? (copy.ok ? "ok" : "failed") : "";
  const [error, setError] = useState("");
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [destroyError, setDestroyError] = useState("");

  const copyTable = () => {
    setError("");
    const table = characteristicsTable(list, plan.aboutKeys, plan.pseudonyms, labels);
    let done: Promise<void> | undefined;
    try { done = navigator.clipboard?.writeText(table); } catch { done = undefined; }
    if (!done) { setCopy({ of: list, ok: false }); return; }
    done.then(() => setCopy({ of: list, ok: true }), () => setCopy({ of: list, ok: false }));
  };

  const download = () => {
    setError("");
    // A value still stored for a field the plan no longer ticks has its column too (list.ts listCsv), headed as the tab heads it.
    const csv = listCsv(list, plan.aboutKeys, { ...Object.fromEntries(RECORD_FIELDS.filter((f) => f.group === "about").map((f) => [f.id, t("pp_f_" + f.id)])), ...labels });
    downloadBlob(listFileName(title.state === "open" ? title.text : ""), new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  };

  const destroy = () => {
    const now = todayIso();
    if (!save((prev) => destroyList(prev, now))) { setDestroyError(refused()); return; }
    setDestroyError("");
    setDestroyOpen(false);
    onDestroyed();
  };

  const highlight = (on: boolean) => {
    if (!save((prev) => ({ ...prev, highlight: on }))) { setError(refused()); return; }
    setError("");
  };

  return (
    <div data-testid="pp-actions">
      <div className="my-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="button" variant="ghost" size="sm" data-testid="pp-copy" onClick={copyTable}><Copy aria-hidden="true" />{t("pp_copy")}</Button>
        <span className="inline-flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" data-testid="pp-download" onClick={download}><DownloadSimple aria-hidden="true" />{t("pp_download")}</Button>
          <span className="text-xs text-muted-foreground" data-testid="pp-download-note">{t("pp_download_note")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="text-danger-ink" data-testid="pp-destroy" onClick={() => { setDestroyError(""); setDestroyOpen(true); }}>
          <Trash aria-hidden="true" />{t("pp_destroy")}
        </Button>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px]" data-testid="pp-highlight-label">
        <input
          type="checkbox"
          role="switch"
          className="size-4 accent-purple-800"
          data-testid="pp-highlight"
          checked={list.highlight !== false}
          onChange={(e) => highlight(e.target.checked)}
        />
        {t("pp_highlight")}
      </label>
      <div role="status" aria-live="polite">
        {copied && <p className="note" data-testid="pp-copy-status">{t(copied === "ok" ? "pp_copied" : "pp_copy_failed")}</p>}
        {error && <p className="note text-danger-ink" data-testid="pp-actions-error">{error}</p>}
      </div>
      <DestroyDialog open={destroyOpen} onOpenChange={(o) => { setDestroyOpen(o); if (!o) setDestroyError(""); }} onConfirm={destroy} error={destroyError} />
    </div>
  );
}

/**
 * The name a drifting field goes by in its line: the Ethics tab's name for a menu field and for the other spellings (design_rec_<id>), the tab's own heading for contact, roll and the
 * made-up name (the table's headings), and a label the student typed as it was typed.
 */
function fieldName(t: (key: string) => string, d: DriftItem): string {
  if (d.kind === "who") return d.id === "spellings" ? t("design_rec_spellings") : t("pp_f_" + d.id);
  return RECORD_FIELDS.some((f) => f.id === d.key) ? t("design_rec_" + d.key) : d.key;
}

/**
 * The notes for a plan that has moved on (C15), above the list: one line for each field the plan no longer records that people still have values in, with "Remove these values"; and for
 * an anonymous plan with people on the list, that a list is stored and what to do. Nothing here deletes by itself.
 */
export function PlanNotes({ list, plan, save, refused, onCleared }: {
  list: ParticipantList;
  plan: ParticipantsPlan;
  save(update: (prev: ParticipantList) => ParticipantList): boolean;
  refused: Refused;
  /** A field was cleared: the page says which. */
  onCleared(message: string): void;
}) {
  const t = useT();
  const [error, setError] = useState("");
  const drift = planDrift(list, plan);
  const n = list.people.length;
  const anonymous = plan.mode === "anonymous" && n > 0;
  if (!anonymous && drift.length === 0) return null;

  const clear = (d: DriftItem) => {
    if (!save((prev) => (d.kind === "who" ? clearWho(prev, d.id) : clearAbout(prev, d.key)))) { setError(refused()); return; }
    setError("");
    onCleared(t("pp_drift_cleared", { field: fieldName(t, d) }));
  };

  return (
    <div className="my-3 flex flex-col gap-2 rounded-[10px] bg-flag-bg px-3 py-2.5 text-[13.5px] text-flag-ink" data-testid="pp-plan-drift">
      {anonymous && <p className="m-0" data-testid="pp-drift-anonymous">{n === 1 ? t("pp_anonymous_note_one") : t("pp_anonymous_note_many", { n })}</p>}
      {drift.map((d) => {
        const field = fieldName(t, d);
        const plural = d.kind === "who" && d.id === "spellings" ? "_pl" : "";
        return (
          <p key={d.kind + ":" + driftKey(d)} className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={"pp-drift-" + driftKey(d)}>
            <span>{t((d.n === 1 ? "pp_drift_one" : "pp_drift_many") + plural, { field, n: d.n })}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-testid={"pp-drift-clear-" + driftKey(d)}
              aria-label={t("pp_drift_clear_aria", { field })}
              onClick={() => clear(d)}
            >{t("pp_drift_clear")}</Button>
          </p>
        );
      })}
      {error && <p className="m-0 text-danger-ink" role="alert" data-testid="pp-drift-error">{error}</p>}
    </div>
  );
}
