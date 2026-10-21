"use client";
import { useEffect, useRef, useState } from "react";
import { plainText, useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useCodes } from "@/lib/tools/qual/useCodes";
import { Button } from "@/components/ui/button";
import { PanelLoading } from "../PanelLoading";
import { CodeTree, type Editing } from "./CodeTree";
import { NameField } from "./NameField";

/**
 * Coding's code tree (v1 782-792, qualRenderTree 6269-6288): the description, "Show code colors in the document" (kind qual_prefs, `showcolors`; no value means shown;
 * a toggle never asks), the tree, "+ New top-level code" (an inline field, not v1's prompt(): register row D-S2-80), and v1's note while there are no codes.
 * What v1 told in a toast ("Code added: NAME", "Deleted") is a line under the tree that screen readers announce.
 * The codes (kind qual_codes) are guarded (R16): while the stored list is being read there is the loading sign (W8), while the vault is locked or the list does not open
 * there is a line saying so and nothing can be added, and for a list that does not open the student must choose to replace it before they can. A list whose parents loop
 * is not drawn at all (core's tree walkers would overflow the stack on it).
 */
function Coding({ projectId }: { projectId: string }) {
  const t = useT();
  const codes = useCodes(projectId);
  const prefs = useProjectBlob("qual_prefs", projectId);
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState("");
  // The student has chosen to replace a list that does not open (R16): until then nothing is set over it.
  const [replaceOk, setReplaceOk] = useState(false);
  const showColors = prefs.value?.showcolors !== false;
  const unreadable = codes.locked || (codes.broken && !replaceOk);
  const open = (e: Editing) => { setStatus(""); setEditing(e); };
  // Focus goes back to the button that opened a field or question when it closes: the test id is kept here and the element focused once the panel has drawn.
  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.focus();
  });
  const trigger = (e: Editing) => (!e ? null : e.kind === "top" ? "qual-add-top" : e.kind === "sub" ? "qual-add-sub-" + e.id : e.kind === "rename" ? "qual-rename-" + e.id : "qual-delete-" + e.id);
  /** Closes the open field or question; focus goes to `to`, or to the button that opened it. */
  const close = (to?: string) => { refocus.current = to ?? trigger(editing); setEditing(null); };
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
          {codes.damaged ? <p className="note" role="status" data-testid="qual-damaged">{t("qual_damaged")}</p> : (
            <>
              {codes.codes.length > 0 && (
                <CodeTree
                  codes={codes.codes}
                  editing={editing}
                  setEditing={(e) => (e ? open(e) : close())}
                  disabled={unreadable}
                  onAdd={add}
                  onRename={(id, name) => { if (codes.rename(id, name)) close(); }}
                  onDelete={(id) => { if (codes.remove(id)) { close("qual-add-top"); setStatus(t("qual_status_deleted")); } }}
                  confirmFor={codes.confirmFor}
                />
              )}
              <div className="mt-2 flex">
                {editing?.kind === "top" ? (
                  <NameField label={t("qual_label_new_top")} saveLabel={t("qual_btn_add")} onSave={(n) => add(n, null)} onCancel={() => close()} />
                ) : (
                  <Button type="button" variant="ghost" className="flex-1" disabled={unreadable} data-testid="qual-add-top" onClick={() => open({ kind: "top" })}>{t("qual_add_top_btn")}</Button>
                )}
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
