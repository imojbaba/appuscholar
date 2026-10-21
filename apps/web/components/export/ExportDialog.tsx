"use client";
import { useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { AiuEntry, CitationStyle } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { heldBlobs, shouldWarnOnUnloadBlobs } from "@/lib/blobs/held";
import { blobId, type BlobKind } from "@/lib/blobs/kinds";
import { blobPath, type BlobWire } from "@/lib/blobs/useProjectBlob";
import { CITE_STYLE_OPTIONS } from "@/lib/cite/form";
import { useLibrary } from "@/lib/cite/useLibrary";
import { downloadBlob } from "@/lib/export/download";
import { DEFAULT_EXPORT_PARTS, EXPORT_PARTS, saveProjectExport, type ExportPart, type ProjectExportDeps } from "@/lib/export/projectExport";
import { isPopout } from "@/lib/popout/mode";
import { shownNow } from "@/lib/research/useSearch";
import { useVault } from "@/lib/vault/useVault";
import type { ExportDoc, ExportDocSummary } from "@/lib/vault/export";
import { openTitle, useTitle } from "@/lib/vault/titles";
import type { WritingRecord } from "@/lib/writingRecord";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/frame/ProjectContext";

/** The ticks the dialog opens with: a tool's Export link ticks only its part (W11); the home and the account menu tick the defaults. */
export function exportPartsFor(preselect?: ExportPart): ExportPart[] {
  return preselect ? [preselect] : [...DEFAULT_EXPORT_PARTS];
}

/** Each part's format, as the canvas names it (the citations line says what this build writes until Task 38 adds RIS and BibTeX). */
const FORMAT: Record<ExportPart, string> = {
  documents: "exp_format_documents", question: "exp_format_text", citations: "exp_format_citations", search: "exp_format_csv", notes: "exp_format_text",
  compare: "exp_format_csv", record: "exp_format_text", aiuse: "exp_format_text", readingBackup: "exp_format_json"
};

/**
 * The export place of one project (wave B Task 12, register D-S2-42; canvas Export): what to include as ticks, the reference style, then
 * Download zip. `parts` opens it with those ticked (null: closed). While the zip is built the line under the parts names the part being made and
 * the button is disabled (W31); the zip is built from what the server holds, opened here (lib/export/projectExport), logged once per download.
 * In a place's own window it opens there too, over that window's project, and only reads.
 */
export function ExportDialog({ parts, onClose }: { parts: ExportPart[] | null; onClose(): void }) {
  return (
    <Dialog open={parts !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      {parts && <ExportBody initial={parts} onClose={onClose} />}
    </Dialog>
  );
}

function ExportBody({ initial, onClose }: { initial: ExportPart[]; onClose(): void }) {
  const t = useT();
  const { project, projectId, documents, currentDoc, flushOpen } = useProject();
  const vault = useVault();
  const library = useLibrary({ passive: true });
  const [on, setOn] = useState<ReadonlySet<ExportPart>>(() => new Set(initial));
  const [style, setStyle] = useState<CitationStyle>(library.style);
  // The part being built, "" before the first; null while idle.
  const [building, setBuilding] = useState<ExportPart | "" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Some edits could not be saved before the zip was built (offline, a locked vault, a conflict): the zip does not have them.
  const [unsaved, setUnsaved] = useState(false);
  const busy = useRef(false);
  const title = useTitle(project, "project");
  const firstDoc = currentDoc ?? documents[0] ?? null;
  const docName = useTitle(firstDoc, "document");
  const name = project ? title.text : t("scratch_name");

  const detail = (p: ExportPart): string => {
    if (p === "documents") return firstDoc ? t("exp_detail_documents", { name: docName.text }) : t("exp_detail_documents_none");
    if (p === "citations") return library.loading || library.locked ? t("exp_detail_citations_unknown") : t("exp_detail_citations", { n: library.lib.length });
    return t("exp_detail_" + p);
  };
  const toggle = (p: ExportPart, yes: boolean) => setOn((s) => { const n = new Set(s); if (yes) n.add(p); else n.delete(p); return n; });

  const download = async () => {
    if (busy.current || !projectId) return;
    busy.current = true;
    setProblem(null);
    setUnsaved(false);
    setBuilding("");
    try {
      if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) { setProblem(t("exp_locked")); return; }
      // The open document's latest words, and every panel's unsent or held blob value, are stored first, so the zip has them. A place's own
      // window only reads (D-S2-43): it stores nothing first, and the line under the parts says when something unsent is not in the zip.
      let docSaved = true;
      if (!isPopout()) {
        docSaved = await flushOpen();
        await heldBlobs.saveAll();
      }
      // The open document's last words that did not save are missing from the zip as much as a held blob value.
      const left = !docSaved || shouldWarnOnUnloadBlobs();
      const pid = projectId;
      const deps: ProjectExportDeps = {
        project: project ?? { id: pid, title: t("scratch_name"), titleKeyVersion: 0, deks: [] },
        t,
        listDocuments: () => apiFetch<ExportDocSummary[]>(`/projects/${pid}/documents`),
        getDocument: (id) => apiFetch<ExportDoc>(`/documents/${id}`),
        decrypt: (doc) => vault.decryptBody(doc),
        openTitle: (x, keyId) => openTitle(vault, x, keyId),
        readBlob: async (kind: BlobKind) => {
          let w: BlobWire;
          try { w = await apiFetch<BlobWire>(blobPath(pid, kind)); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
          return vault.decryptBody({ id: blobId(pid, kind), deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion });
        },
        writingRecord: () => apiFetch<WritingRecord>(`/projects/${pid}/writing-record`),
        aiUseLog: () => apiFetch<AiuEntry[]>(`/ai/log?projectId=${encodeURIComponent(pid)}`)
      };
      const ticked = EXPORT_PARTS.filter((p) => on.has(p));
      await saveProjectExport(deps, ticked, { style, now: new Date(), lastSearch: shownNow(), progress: setBuilding }, {
        audit: () => apiFetch<void>("/me/export-audit", { method: "POST" }),
        download: downloadBlob
      });
      // The zip is saved; the dialog stays open to say what it is missing.
      if (left) setUnsaved(true);
      else onClose();
    } catch {
      setProblem(t("export_fail"));
    } finally {
      busy.current = false;
      setBuilding(null);
    }
  };

  const working = building !== null;
  return (
    <DialogContent className="exp-dlg sm:max-w-[760px]" data-testid="export-dialog" showCloseButton={false}
      onEscapeKeyDown={(e) => { if (busy.current) e.preventDefault(); }} onInteractOutside={(e) => { if (busy.current) e.preventDefault(); }}>
      <div className="exp-head">
        <div>
          <DialogTitle id="exp-h" className="exp-h">{t("exp_title", { title: name })}</DialogTitle>
          <DialogDescription className="exp-sub">{t("exp_sub")}</DialogDescription>
        </div>
        <DialogClose asChild>
          <button type="button" className="exp-x" aria-label={t("exp_close")} disabled={working} data-testid="exp-close"><X size={16} aria-hidden="true" /></button>
        </DialogClose>
      </div>
      <fieldset className="exp-parts" disabled={working}>
        <legend>{t("exp_include")}</legend>
        {EXPORT_PARTS.map((p) => (
          <label key={p} className="exp-part">
            <input type="checkbox" checked={on.has(p)} data-testid={"exp-part-" + p} onChange={(e) => toggle(p, e.target.checked)} />
            <span><strong>{t("exp_part_" + p)}</strong><br /><span className="exp-muted">{detail(p)}</span></span>
            <span className="exp-muted">{t(FORMAT[p])}</span>
          </label>
        ))}
      </fieldset>
      {on.has("citations") && (
        <div className="exp-style">
          <label htmlFor="exp-style">{t("cite_style_label")}</label>
          <select className="input" id="exp-style" data-testid="exp-style" value={style} disabled={working} onChange={(e) => setStyle(e.target.value as CitationStyle)}>
            {CITE_STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      <div className="exp-foot">
        <span className="exp-muted">{t("exp_one_zip")}</span>
        <div className="exp-btns">
          <DialogClose asChild><Button type="button" variant="ghost" className="exp-btn" disabled={working} data-testid="exp-cancel">{t("exp_cancel")}</Button></DialogClose>
          <Button type="button" variant="primary" className="exp-btn" disabled={working || on.size === 0} data-testid="exp-download" onClick={() => { void download(); }}>{t("exp_download")}</Button>
        </div>
      </div>
      {working && <p className="exp-line" role="status" data-testid="exp-progress">{t("exp_building", { part: t("exp_part_" + (building || (EXPORT_PARTS.find((p) => on.has(p)) ?? "documents"))) })}</p>}
      {problem && <p className="exp-line exp-problem" role="alert" data-testid="exp-error">{problem}</p>}
      {unsaved && <p className="exp-line exp-problem" role="status" data-testid="exp-unsaved">{t("exp_unsaved")}</p>}
      <p className="exp-muted exp-all">{t("exp_all_note")}</p>
    </DialogContent>
  );
}
