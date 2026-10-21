"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { clEnoughWords, clK, clMin } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useDocAccess, type ProjectDocument } from "@/lib/editor/docAccess";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { downloadBlob } from "@/lib/export/download";
import { useShelf } from "@/lib/shelf/useShelf";
import { CLOSE_FILE, closeReport } from "@/lib/tools/close/report";
import { createRunner, type CloseRunner } from "@/lib/tools/close/runner";
import { gatherSources, otherDocuments } from "@/lib/tools/close/sources";
import { useProject } from "@/components/frame/ProjectContext";
import { Button } from "@/components/ui/button";
import { Result, type Checked } from "./Result";
import { Sources } from "./Sources";

type Note = { key: string; vars?: Record<string, number> };

/**
 * Review's Closeness tab (v1 panel 795-815, closeInit 6901, clRun 6937-6948): the open document against papers on the Reading shelf, the student's other documents and a pasted passage.
 * Nothing is sent anywhere and no AI is used. The comparison runs in a Web Worker (lib/tools/close/runner.ts) so a long document never freezes typing: the button is disabled and says
 * "Checking…" meanwhile, and a result that arrives after the panel went away or the project changed is dropped. The two settings are the project's close_prefs (v1: localStorage).
 * The body is keyed by project (Panel.tsx), so another project starts clean.
 */
export default function CloseBody({ projectId }: { projectId: string }) {
  const t = useT();
  const shelf = useShelf();
  const access = useDocAccess();
  const { currentDoc } = useProject();
  const prefs = useProjectBlob("close_prefs", projectId || null);
  const stored = (n: number | undefined) => (n === undefined ? null : String(n));
  const k = clK(stored(prefs.value?.k));
  const minRun = clMin(stored(prefs.value?.min));

  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [pasted, setPasted] = useState("");
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const runner = useRef<CloseRunner | null>(null);
  const token = useRef(0);

  // closeInit lists the other documents when the tab opens.
  useEffect(() => {
    let live = true;
    void access.allDocuments().then((d) => { if (live) setDocs(d); }, () => {});
    return () => { live = false; };
  }, [access]);
  // The worker goes with the panel, and so does any run still out: its result is dropped.
  useEffect(() => () => { token.current++; runner.current?.dispose(); runner.current = null; }, []);

  const currentId = currentDoc?.id ?? null;
  const others = useMemo(() => otherDocuments(docs, currentId, currentId === null ? access.text() : ""), [docs, currentId, access]);
  const notRead = shelf.projectId === null || shelf.loading || shelf.locked || shelf.broken || shelf.error;

  const toggle = (v: string) => setOff((o) => { const n = new Set(o); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const setPref = (key: "k" | "min", v: string) => prefs.set((prev) => ({ ...prev, [key]: Number(v) }));

  async function start() {
    if (busy) return;
    const text = access.text();
    setNote(null);
    // clRun's first guard (6938): about 30 words.
    if (!clEnoughWords(text)) { setNote({ key: "close_need_words" }); return; }
    const mine = ++token.current;
    setBusy(true);
    setChecked(null);
    try {
      const fresh = otherDocuments(await access.allDocuments().catch(() => docs), currentId, currentId === null ? text : "");
      const picked = [...(shelf.index ?? []).map((p) => "s:" + p.id), ...fresh.map((d) => "d:" + d.id)].filter((v) => !off.has(v));
      const g = await gatherSources({ picked, index: shelf.index, loadPaper: shelf.loadPaper, docs: fresh, pasted });
      if (mine !== token.current) return;
      // clRun's second guard (6941): at least one source.
      if (g.sources.length === 0) {
        setNote(g.unreadable > 0 ? (g.unreadable === 1 ? { key: "close_skipped_one" } : { key: "close_skipped_many", vars: { n: g.unreadable } }) : { key: "close_need_source" });
        setBusy(false);
        return;
      }
      runner.current ??= createRunner();
      const r = await runner.current.run(text, g.sources, k, minRun);
      if (mine !== token.current) return;
      setChecked({ r, text, unreadable: g.unreadable });
      setBusy(false);
    } catch {
      if (mine !== token.current) return;
      setNote({ key: "close_failed" });
      setBusy(false);
    }
  }

  // clDownload (6973): v1's pdDownload, a byte-order mark and then the report, dated today.
  const download = () => { if (checked) downloadBlob(CLOSE_FILE, new Blob(["﻿" + closeReport(checked.r, new Date())], { type: "text/csv;charset=utf-8" })); };

  return (
    <div className="panel" data-testid="panel-close">
      <h3>{t("close_heading")}</h3>
      <p className="desc">{t("close_intro")}</p>
      <div className="ap-box"><b>{t("close_cannot_lead")}</b> {t("close_cannot_body")}</div>
      <Sources index={shelf.index} notRead={notRead} locked={shelf.locked} broken={shelf.broken} docs={others} off={off} onToggle={toggle} />
      <div className="field">
        <label htmlFor="clPaste">{t("close_paste_label")}</label>
        <textarea className="input" id="clPaste" data-testid="close-paste" rows={3} placeholder={t("close_paste_ph")} value={pasted} onChange={(e) => setPasted(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        <label className="flex items-center gap-1.5">{t("close_k_label")}
          <select className="input !w-auto" data-testid="close-k" value={String(k)} onChange={(e) => setPref("k", e.target.value)}>
            {[5, 6, 8].map((n) => <option key={n} value={n}>{t("close_k_" + n)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">{t("close_min_label")}
          <select className="input !w-auto" data-testid="close-min" value={String(minRun)} onChange={(e) => setPref("min", e.target.value)}>
            {[8, 10, 15].map((n) => <option key={n} value={n}>{t("close_min_" + n)}</option>)}
          </select>
        </label>
      </div>
      <div className="ap-row mt-2">
        <Button variant="primary" size="sm" data-testid="close-run" disabled={busy} aria-busy={busy} onClick={() => void start()}>
          <MagnifyingGlass aria-hidden="true" />{busy ? t("close_running") : t("close_run")}
        </Button>
        {busy && <span role="status" className="ap-small" data-testid="close-status">{t("close_running")}</span>}
      </div>
      {note && <p role="status" className="ap-warn" data-testid="close-note">{t(note.key, note.vars)}</p>}
      {checked && <Result c={checked} onDownload={download} />}
    </div>
  );
}
