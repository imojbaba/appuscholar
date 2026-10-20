"use client";
import { useRef, useState } from "react";
import { tHtml, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ShelfItem } from "@/lib/shelf/actions";

/**
 * Papers (shPapersRender 11616-11620): "➕ Add PDFs" (several at once), "Back up the shelf", "Restore a shelf backup", the status line (shStatusHTML 11614), then each paper: its
 * title in a box (renamed when the box is left), the file, the pages and highlights, "Read" and "Remove from shelf", which asks to be pressed again ("Press again to remove it and
 * its highlights"; a removal the server refuses says so in the status line); while a paper's blob is not read yet its line gives the pages only, its highlights being unknown;
 * "The shelf is empty. Add a PDF to start." when it is; v1's note that the shelf is kept apart from the normal backup. v1's storage line (shUsage 11615) is not
 * shown: v2 keeps the shelf on the server, not in the browser's storage (register row D-S2-14).
 */
export function Papers({ items, status, busy, canWrite, onAdd, onBackup, onRestore, onRename, onRead, onRemove }: {
  items: ShelfItem[]; status: string; busy: boolean; canWrite: boolean;
  onAdd(files: File[]): void; onBackup(): void; onRestore(file: File): void; onRename(id: string, title: string): void; onRead(id: string): void; onRemove(id: string): Promise<boolean>;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  /** The papers whose "Remove from shelf" was pressed once (v1's data-sure, 11623). */
  const [sure, setSure] = useState<ReadonlySet<string>>(new Set());
  const remove = async (id: string) => {
    if (!sure.has(id)) { setSure(new Set(sure).add(id)); return; }
    if (await onRemove(id)) setSure((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  return (
    <>
      <div className="sh-row sh-wrap">
        <Button variant="primary" data-testid="sh-add" disabled={busy || !canWrite} onClick={() => fileRef.current?.click()}>{t("sh2_add_pdfs")}</Button>
        <input ref={fileRef} type="file" id="shFile" data-testid="sh-file" accept=".pdf,application/pdf" multiple hidden
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onAdd(files); }} />
        <Button variant="ghost" data-testid="sh-backup" onClick={onBackup}>{t("sh2_back_up_the_shelf")}</Button>
        <Button variant="ghost" data-testid="sh-restore" disabled={busy || !canWrite} onClick={() => restoreRef.current?.click()}>{t("sh2_restore_a_shelf_backup")}</Button>
        <input ref={restoreRef} type="file" id="shRest" data-testid="sh-rest" accept=".json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onRestore(f); }} />
      </div>
      {status && <p className="sh-status" role="status" data-testid="sh-status">{status}</p>}
      {items.length ? items.map((p) => (
        <div className="sh-paper" data-testid="sh-paper" key={p.id}>
          <input className="input sh-title" type="text" defaultValue={p.title} key={p.title} aria-label={t("sh2_title_aria")} data-testid="sh-title"
            onBlur={(e) => { if (e.target.value !== p.title) onRename(p.id, e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          <div className="sh-small sh-muted" data-testid="sh-paper-meta">{p.file + " " + (p.paper ? t("sh2_pages_highlights", { pagesCount: p.paper.pages.length, notesCount: p.paper.notes.length }) : t("shelf_pages_only", { pagesCount: p.kept }))}</div>
          <div className="sh-row">
            <Button variant="primary" size="sm" data-testid="sh-read" disabled={!p.paper} onClick={() => onRead(p.id)}>{t("sh2_read")}</Button>
            <Button variant="ghost" size="sm" data-testid="sh-remove" onClick={() => { void remove(p.id); }}>{sure.has(p.id) ? t("sh2_press_again_to_remove") : t("sh2_remove_from_shelf")}</Button>
          </div>
        </div>
      )) : <p className="sh-text" data-testid="sh-empty">{t("sh2_the_shelf_is_empty")}</p>}
      <p className="sh-small sh-muted">{tHtml(t("sh2_the_shelf_is_kept"))}</p>
    </>
  );
}
