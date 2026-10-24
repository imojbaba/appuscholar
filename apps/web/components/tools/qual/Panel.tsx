"use client";
import { useEffect, useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { qualDescendantIds } from "@appuscholar/core";
import { plainText, useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useProject } from "@/components/frame/ProjectContext";
import { downloadBlob } from "@/lib/export/download";
import { qualExportName, qualMarkdown } from "@/lib/tools/qual/exportPart";
import { publishCodes, publishColors } from "@/lib/tools/qual/liveStore";
import { stripFromDocuments } from "@/lib/tools/qual/strip";
import { useCodes } from "@/lib/tools/qual/useCodes";
import { Button } from "@/components/ui/button";
import { PanelLoading } from "../PanelLoading";
import { CodeTree, type Editing } from "./CodeTree";
import { NameField } from "./NameField";
import { Passages } from "./Passages";

/**
 * Coding's code tree (v1 782-792, qualRenderTree 6269-6288): the description, "Show code colors in the document" (kind qual_prefs, `showcolors`; no value means shown;
 * a toggle never asks), the tree, "+ New top-level code" (an inline field, not v1's prompt(): register row D-S2-80), and v1's note while there are no codes.
 * What v1 told in a toast ("Code added: NAME", "Deleted", "Tagged as ...") is a line under the tree that screen readers announce.
 * Tapping a code tags the selected passage of the open document (v1 qualTagSelection; wrapSelection of the shared document access). The eye button replaces the tree with the code's
 * passages (an inline view, D-S2-83). Delete takes the code's tags (and its sub-codes') out of every document of the project first, and only when all of them could be updated does it
 * remove the codes (D-S2-81). The panel also tells lib/tools/qual/liveStore what the codes and the toggle are, for the DocumentLayer in this window.
 * "Export all coded passages (Markdown)" (v1 qualExportMarkdown) downloads core's qualBuildMarkdown over the passages found in the documents read now (D-S2-84); with no codes it says so inline
 * and downloads nothing, and, like the delete, it refuses when a document of the project could not be read, since the file would silently lack its passages.
 * The codes (kind qual_codes) are guarded (R16): while the stored list is being read there is the loading sign (W8), while the vault is locked or the list does not open
 * there is a line saying so and nothing can be added, and for a list that does not open the student must choose to replace it before they can. A list whose parents loop
 * is not drawn at all (core's tree walkers would overflow the stack on it).
 */
function Coding({ projectId }: { projectId: string }) {
  const t = useT();
  const codes = useCodes(projectId);
  const prefs = useProjectBlob("qual_prefs", projectId);
  const access = useDocAccess();
  const { documents } = useProject();
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState("");
  // The code whose passages are shown in place of the tree, and whether a delete is taking the tags out of the documents.
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The student has chosen to replace a list that does not open (R16): until then nothing is set over it.
  const [replaceOk, setReplaceOk] = useState(false);
  const showColors = prefs.value?.showcolors !== false;
  const { loading: codesLoading, locked: codesLocked, codes: codeList } = codes;
  const prefsLoading = prefs.loading;
  // What the DocumentLayer in this window draws from (its own blobs do not hear this panel's saves).
  useEffect(() => { if (!codesLoading && !codesLocked) publishCodes(projectId, codeList); }, [projectId, codesLoading, codesLocked, codeList]);
  useEffect(() => { if (!prefsLoading) publishColors(projectId, showColors); }, [projectId, prefsLoading, showColors]);
  const unreadable = codes.locked || (codes.broken && !replaceOk);
  const viewCode = viewId ? codeList.find((c) => c.id === viewId) ?? null : null;
  const open = (e: Editing) => { setStatus(""); setEditing(e); };
  // Focus goes back to the button that opened a field or question when it closes: the test id is kept here and the element focused once the panel has drawn.
  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    // Found by comparing the attribute, not through a selector: the id of a code is a stored string.
    Array.from(root.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? []).find((el) => el.dataset.testid === id)?.focus();
  });
  const trigger = (e: Editing) => (!e ? null : e.kind === "top" ? "qual-add-top" : e.kind === "sub" ? "qual-add-sub-" + e.id : e.kind === "rename" ? "qual-rename-" + e.id : "qual-delete-" + e.id);
  /** Closes the open field or question; focus goes to `to`, or to the button that opened it. */
  const close = (to?: string) => { refocus.current = to ?? trigger(editing); setEditing(null); };
  const tag = async (id: string) => {
    const c = codeList.find((x) => x.id === id);
    if (!c || unreadable || busy) return;
    const r = await access.wrapSelection("qual-tag", { "data-qcode": c.id, title: c.name });
    setStatus(r === "done" ? t("qual_status_tagged", { name: c.name }) : r === "no-selection" ? t("qual_status_no_selection") : t("qual_status_crosses"));
  };
  const openPassages = (id: string) => { setStatus(""); setEditing(null); setViewId(id); };
  const closePassages = () => { refocus.current = viewId ? "qual-passages-" + viewId : null; setViewId(null); };
  const remove = async (id: string) => {
    if (busy) return;
    const ids = qualDescendantIds(id, codeList);
    setBusy(true);
    setStatus(t("qual_status_deleting"));
    // Every live document of the project must have been read: allDocuments() is [] when they could not be, and leaves out one that does not open.
    const { failed, unread } = await stripFromDocuments(access, ids, documents.map((d) => d.id));
    setBusy(false);
    if (unread) {
      close();
      setStatus(t("qual_status_delete_unread"));
      return;
    }
    if (failed.length > 0) {
      // A document could not be rewritten (deleted, or this tab holds text of it that is not saved): the code is kept, and trying again is safe.
      close();
      setStatus(t("qual_status_delete_held", { docs: failed.map((n) => "\u201c" + n + "\u201d").join(", ") }));
      return;
    }
    if (codes.remove(id)) { close("qual-add-top"); setStatus(t("qual_status_deleted")); }
  };
  /** v1 qualExportMarkdown: every code with its passages, as one Markdown file. Reads the documents; changes nothing. */
  const exportMd = async () => {
    if (busy || unreadable || codes.damaged) return;
    if (codeList.length === 0) { setStatus(t("qual_export_none")); return; }
    setBusy(true);
    setStatus("");
    let docs: Awaited<ReturnType<typeof access.allDocuments>> = [];
    try { docs = await access.allDocuments(); } catch { docs = []; }
    setBusy(false);
    // allDocuments() is [] when they could not be read and leaves out one that does not open: a file made from fewer would silently lack passages.
    const read = new Set(docs.map((d) => d.id));
    if (documents.some((d) => !read.has(d.id))) { setStatus(t("qual_status_export_unread")); return; }
    downloadBlob(qualExportName(new Date()), new Blob([qualMarkdown(codeList, docs)], { type: "text/markdown;charset=utf-8" }));
  };
  const add = (name: string, parentId: string | null) => {
    const c = codes.add(name, parentId);
    if (!c) return;
    close();
    setStatus(t("qual_status_added", { name: c.name }));
  };
  return (
    <div className="panel" data-testid="panel-qual" ref={root}>
      <h3>{plainText(t("tab_qual"))}</h3>
      <p className="desc">{t("qual_panel_desc")}</p>
      <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[13.5px]">
        <input
          type="checkbox"
          className="size-[17px] accent-purple-800"
          data-testid="qual-show-colors"
          checked={showColors}
          onChange={(e) => { const showcolors = e.target.checked; prefs.set((prev) => ({ ...(prev ?? {}), showcolors })); }}
        />
        <b>{t("qual_show_colors_label")}</b>
      </label>
      {codes.loading ? <PanelLoading /> : (
        <>
          {codes.locked && <p className="note" role="status" data-testid="qual-locked">{t("qual_codes_locked")}</p>}
          {codes.broken && (
            <div className="note" data-testid="qual-broken-box">
              <p className="m-0" role="status" data-testid="qual-broken">{t("qual_codes_broken")}</p>
              {!replaceOk && <Button type="button" variant="ghost" size="sm" className="mt-1.5" data-testid="qual-replace-broken" onClick={() => setReplaceOk(true)}>{t("qual_replace_broken_btn")}</Button>}
            </div>
          )}
          {codes.damaged ? <p className="note" role="status" data-testid="qual-damaged">{t("qual_damaged")}</p> : viewCode ? (
            <Passages code={viewCode} onBack={closePassages} />
          ) : (
            <>
              {codes.codes.length > 0 && (
                <CodeTree
                  codes={codes.codes}
                  editing={editing}
                  setEditing={(e) => (e ? open(e) : close())}
                  disabled={unreadable || busy}
                  busy={busy}
                  onAdd={add}
                  onRename={(id, name) => { if (codes.rename(id, name)) close(); }}
                  onDelete={(id) => void remove(id)}
                  onTag={(id) => void tag(id)}
                  onPassages={openPassages}
                  confirmFor={codes.confirmFor}
                />
              )}
              <div className="mt-2 flex">
                {editing?.kind === "top" ? (
                  <NameField label={t("qual_label_new_top")} saveLabel={t("qual_btn_add")} onSave={(n) => add(n, null)} onCancel={() => close()} />
                ) : (
                  <Button type="button" variant="ghost" className="flex-1" disabled={unreadable || busy} data-testid="qual-add-top" onClick={() => open({ kind: "top" })}>{t("qual_add_top_btn")}</Button>
                )}
              </div>
              <div className="mt-2 flex">
                <Button type="button" variant="ghost" className="flex-1" disabled={unreadable || busy} data-testid="qual-export" onClick={() => void exportMd()}>
                  <DownloadSimple aria-hidden="true" />{plainText(t("qual_export_btn"))}
                </Button>
              </div>
              {codes.codes.length === 0 && !unreadable && <p className="desc mt-2" data-testid="qual-empty">{t("qual_empty_note")}</p>}
            </>
          )}
        </>
      )}
      <p className="note" role="status" aria-live="polite" data-testid="qual-status">{status}</p>
    </div>
  );
}

export function Panel({ tab, projectId }: { tab: string; projectId: string }) {
  if (tab !== "coding") return null;
  return <Coding projectId={projectId} />;
}
