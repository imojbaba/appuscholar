"use client";
import { useEffect, useState } from "react";
import { originCount } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useSuggestion } from "@/lib/ai/suggestion";
import { APP_VERSION } from "@/lib/version";
import { downloadBlob } from "@/lib/export/download";
import { buildRecordText, type WritingRecord } from "@/lib/writingRecord";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);
const localDay = () => { const d = new Date(), z = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

/** v1 `provShow`: where the words came from (typed versus inserted from AI), per document and week by week, with the writing-process record to download. */
export function MyWriting() {
  const t = useT();
  const { me } = useSettings();
  const { dialog, closeDialog, project, currentDoc } = useWorkspace();
  const docId = currentDoc?.id;
  const { editor } = useSuggestion();
  const open = dialog === "myWriting";
  const projectId = project?.id ?? me?.scratchProjectId;
  const [rec, setRec] = useState<WritingRecord | null>(null);
  const [failed, setFailed] = useState(false);

  // The stored counts lag the editor by an autosave: the open document is counted from what is on screen now (v1 provScan).
  useEffect(() => {
    if (!open || !projectId) return;
    let live = true;
    apiFetch<WritingRecord>(`/projects/${projectId}/writing-record`).then((r) => {
      if (!live) return;
      const mine = editor && docId ? originCount(editor.getHTML()) : null;
      setRec(mine ? { ...r, docs: r.docs.map((d) => (d.id === docId ? { ...d, stats: mine } : d)) } : r);
    }, () => { if (live) setFailed(true); });
    return () => { live = false; setRec(null); setFailed(false); };
  }, [open, projectId, editor, docId]);

  const docs = rec?.docs ?? [];
  const typed = docs.reduce((a, d) => a + d.stats.typed, 0), ai = docs.reduce((a, d) => a + d.stats.ai, 0), total = typed + ai;
  const download = () => {
    if (!rec) return;
    downloadBlob("writing-process-record.txt", new Blob([buildRecordText(rec, APP_VERSION, localDay())], { type: "text/plain;charset=utf-8" }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="my-writing">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("prov_h")}</DialogTitle>
          <DialogDescription>{t("prov_desc")}</DialogDescription>
        </DialogHeader>
        {failed ? <p role="alert" className="text-sm text-destructive">Could not load your writing record.</p>
          : !rec ? <p className="text-sm text-muted-foreground" aria-busy="true">…</p>
          : (
            <div className="grid gap-3 text-sm">
              {total === 0 ? <p data-testid="my-writing-none">{t("prov_none")}</p> : (
                <>
                  <p className="font-medium" data-testid="my-writing-total">{t("prov_total", { w: total, t: pct(typed, total), a: 100 - pct(typed, total) })}</p>
                  <ul className="grid gap-1.5" data-testid="my-writing-docs">
                    {docs.filter((d) => d.stats.typed + d.stats.ai > 0).map((d) => {
                      const s = d.stats, n = s.typed + s.ai;
                      return (
                        <li key={d.id}>
                          <b>{d.title}</b>{" "}
                          <span className="text-muted-foreground">
                            {s.passages > 0
                              ? t("prov_doc_fmt", { n, t: pct(s.typed, n), p: s.passages, k: s.kept, e: s.edited, u: s.unknown > 0 ? t("prov_unknown", { u: s.unknown }) : "" })
                              : t("prov_doc_plain", { n, t: pct(s.typed, n) })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div data-testid="my-writing-weekly">
                <p className="font-medium">{t("prov_trend")}</p>
                {rec.weekly.length < 2 ? <p className="text-muted-foreground">{t("prov_trend_none")}</p> : (
                  <ul className="mt-1 grid gap-1">
                    {rec.weekly.map((w) => {
                      const p = pct(w.typed, w.typed + w.ai);
                      return (
                        <li key={w.weekStart} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2" data-testid="weekly-row">
                          <span className="text-muted-foreground">{t("prov_week", { d: w.weekStart })}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-chip"><span className="block h-full rounded-full bg-purple-800" style={{ width: p + "%" }} /></span>
                          <span className="text-right tabular-nums">{p}%</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {rec.sources.length > 0 && <p className="text-muted-foreground" data-testid="my-writing-sources">{t("prov_src_line", { w: rec.sources.reduce((a, x) => a + x.words, 0), n: rec.sources.length })}</p>}
            </div>
          )}
        <DialogFooter>
          <Button variant="primary" data-testid="record-download" disabled={!rec} onClick={download}>⬇ Download my writing-process record (.txt)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
