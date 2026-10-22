"use client";
import { useState } from "react";
import { CheckCircle, Question, Warning } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProject } from "@/components/frame/ProjectContext";
import { resultCounts, type ResultItem } from "@/lib/tools/stats/checkResults";
import { selectNth } from "@/lib/tools/stats/checkGo";
import { useCheckActions } from "@/lib/tools/stats/checkActions";
import { Button } from "@/components/ui/button";

const TONE = { cur: "var(--ok-ink)", stale: "var(--flag-ink)", unk: "var(--muted)" } as const;
const LABEL = { cur: "rt_cur", stale: "rt_stale", unk: "rt_unk" } as const;
const ICON = { cur: CheckCircle, stale: Warning, unk: Question } as const;
const key = (it: ResultItem) => it.docId + "|" + it.id + "|" + it.nth;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/**
 * Results linked to their data (v1 rtDlg and rtOpen 12287-12305, rtRerun 12331, rtRerunAll 12340): every result inserted from the Data tab carries a hidden tag. The list
 * shows, for every document of the project, whether the data under the result's data set name is still the data it was run on. "Re-run on current data" needs that data
 * loaded in the Data tab under that name; it replaces only the tagged sentence. A result marked current is not a check that its words still fit the number: the note says so.
 */
export function ResultsLinking({ projectId }: { projectId: string }) {
  const t = useT();
  const actions = useCheckActions(projectId);
  const { editor } = useSuggestion();
  const { currentDoc, docOpen, openDocument, selectDoc } = useProject();
  const [msgs, setMsgs] = useState<Record<string, { text: string; flip: boolean }>>({});
  const [all, setAll] = useState<{ text: string; flip: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const items = actions.items;
  const counts = items ? resultCounts(items) : null;
  const stale = (items ?? []).filter((i) => i.status === "stale");
  const off = busy || actions.scanning || actions.readOnly || !!actions.waiting;
  const docs = new Set((items ?? []).map((i) => i.docId)).size;

  const scan = async () => { setMsgs({}); setAll(null); setSaid(""); await actions.scan(); };
  const rerun = async (it: ResultItem) => {
    setBusy(true); setAll(null); setSaid("");
    try {
      const r = await actions.rerunOne(it);
      if (r.kind === "skipped") return;
      const text = r.kind === "done" ? t("rt_done") : r.msg;
      const flip = r.kind === "done" && r.flip;
      // Only a re-run that changed the document is followed by a new scan; a refusal leaves the list as it was, with its words under the result.
      if (r.kind === "done") await actions.scan();
      setMsgs({ [key(it)]: { text, flip } });
    } finally { setBusy(false); }
  };
  const rerunAll = async () => {
    setBusy(true); setMsgs({}); setSaid("");
    try {
      const r = await actions.rerunAll(stale);
      await actions.scan();
      const text = t("stats_check_all_summary", { done: r.done, n: r.n, skipped: r.skipped, failed: r.failed }) + (r.msg ? " " + r.msg : "");
      setAll({ text, flip: r.flips > 0 });
    } finally { setBusy(false); }
  };
  const go = (it: ResultItem) => {
    if (!editor || editor.isDestroyed) { setSaid(t("stats_check_text_nowhere")); return; }
    if (!docOpen) openDocument();
    setSaid(selectNth(editor, it.text, it.at) ? "" : t("stats_check_text_gone"));
  };
  const open = async (it: ResultItem) => { await selectDoc(it.docId); if (!docOpen) openDocument(); };

  return (
    <section data-testid="check-rt" aria-labelledby="checkRtTitle" style={{ marginTop: 22 }}>
      <h3 id="checkRtTitle">{t("stats_check_rt_title")}</h3>
      <p className="desc">{t("stats_check_rt_desc")}</p>
      {actions.waiting ? (
        <p className="ap-small" role="status" data-testid="check-rt-waiting">{t("stats_check_rt_" + actions.waiting)}</p>
      ) : (
        <div className="ap-row ap-wrap">
          <Button variant="primary" size="sm" data-testid="check-rt-run" disabled={actions.scanning || busy} onClick={() => { void scan(); }}>{t(items ? "nc_rescan" : "stats_check_rt_run")}</Button>
          {stale.length > 0 && <Button variant="ghost" size="sm" data-testid="check-rt-all" disabled={off} onClick={() => { void rerunAll(); }}>{t("rt_all")}</Button>}
        </div>
      )}
      {actions.scanning && <p className="ap-small" role="status" data-testid="check-rt-reading">{t("stats_check_rt_reading")}</p>}
      {actions.readOnly && stale.length > 0 && <p className="ap-small" data-testid="check-rt-readonly">{t("stats_check_rt_readonly")}</p>}
      {items && counts && (
        <div data-testid="check-rt-result">
          {/* Never "none found" when some documents were not read: that would be a reassurance nothing supports (rule 8). */}
          {(counts.n > 0 || actions.unread === 0) && <p role="status" data-testid="check-rt-sum" style={{ fontWeight: 700 }}>{counts.n ? t("rt_sum", counts) : t("stats_check_rt_none")}</p>}
          {actions.unread > 0 && <p role="alert" className="ap-banner" data-testid="check-rt-unread">{t("stats_check_rt_unread", { n: actions.unread })}</p>}
          {all && (
            <p role="status" data-testid="check-rt-all-msg" className="ap-box">{all.text}{all.flip && <> {t("rt_sig_flip")}</>}</p>
          )}
          {items.map((it) => {
            const run = (actions.runs ?? {})[it.id];
            const Icon = ICON[it.status];
            const m = msgs[key(it)];
            const edited = !!run && it.text !== run.sentence;
            const why = it.why === "rt_why_noset" ? t("stats_check_why_noset", { n: run?.ds ?? "" })
              : it.why ? t(it.why, { d: it.when ? new Date(it.when).toLocaleString() : "", n: run?.ds ?? "" }) : "";
            const here = currentDoc?.id === it.docId;
            return (
              <div key={key(it)} className="ap-box" data-testid="check-rt-card" data-status={it.status} style={{ borderLeft: "4px solid " + TONE[it.status] }}>
                <div>
                  <b style={{ color: TONE[it.status] }}><Icon aria-hidden="true" weight="fill" style={{ verticalAlign: "-2px" }} /> <span data-testid="check-rt-label">{t(LABEL[it.status])}</span></b>
                  {run && <span data-testid="check-rt-meta"> · {run.label} · {t("rt_dataset")}: <i>{run.ds}</i> · {t("rt_inserted")} {new Date(run.ts).toLocaleDateString()}</span>}
                </div>
                {docs > 1 && <div className="ap-small" data-testid="check-rt-doc">{t("stats_check_in_doc", { title: it.docTitle })}</div>}
                <div data-testid="check-rt-text" style={{ marginTop: 4, color: "var(--muted)" }}>{clip(it.text, 260)}</div>
                {why && <div data-testid="check-rt-why" style={{ marginTop: 4 }}>{why}</div>}
                {edited && <div data-testid="check-rt-edited" style={{ marginTop: 3 }}>{t("rt_edited")}</div>}
                <div className="ap-row ap-wrap">
                  {here
                    ? <Button variant="ghost" size="sm" data-testid="check-rt-go" onClick={() => go(it)}>{t("nc_go")}</Button>
                    : <Button variant="ghost" size="sm" data-testid="check-rt-open" onClick={() => { void open(it); }}>{t("stats_check_open_doc")}</Button>}
                  {it.status === "stale" && <Button variant="primary" size="sm" data-testid="check-rt-rerun" disabled={off} onClick={() => { void rerun(it); }}>{t("rt_rerun")}</Button>}
                </div>
                {m && <p role="status" data-testid="check-rt-msg" style={{ margin: "4px 0 0" }}>{m.text}{m.flip && <> <b data-testid="check-rt-flip">{t("rt_sig_flip")}</b></>}</p>}
              </div>
            );
          })}
          {said && <p className="ap-small" role="status" data-testid="check-rt-said">{said}</p>}
          <p className="desc" data-testid="check-rt-note">{t("rt_note")}</p>
        </div>
      )}
    </section>
  );
}
