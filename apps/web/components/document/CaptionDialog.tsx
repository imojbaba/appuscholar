"use client";
import { useId, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { insertCaption, nearestTablePos, renumberCaptions, type CaptionKind } from "@/lib/editor/captions";
import { useT } from "@/lib/i18n";

/**
 * v1's numbered caption dialog (#capDlg 1444-1456): Kind, Title, an optional Note, Insert caption, Renumber all and Close. The Form is mounted only while the
 * dialog is open, so Kind (table when the cursor is in a table, v1 capOpen 4539) and the empty fields are worked out afresh each time it opens.
 */
export function CaptionDialog({ open, onOpenChange, editor }: { open: boolean; onOpenChange(open: boolean): void; editor: Editor }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="caption-dialog">
        {open && <Form editor={editor} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const t = useT();
  const id = useId();
  const [kind, setKind] = useState<CaptionKind>(() => (nearestTablePos(editor) !== null ? "table" : "figure"));
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  /** v1 capInsert: an empty title says so and the dialog stays open; otherwise it closes and says it is done. */
  function insert() {
    if (insertCaption(editor, { kind, title, note }) === "need-title") { toast(t("cap_need_title")); return; }
    onClose();
    toast(t("cap_inserted"));
  }
  /** v1 renumberCaptions(true): the counts are toasted and the dialog stays open. */
  function renumber() {
    const { f, t: tables } = renumberCaptions(editor);
    toast(t("cap_renum_done", { f, t: tables }));
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); insert(); }} className="grid gap-3">
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("cap_h")}</DialogTitle>
        <DialogDescription>{t("cap_desc")}</DialogDescription>
      </DialogHeader>
      <div className="field">
        <label htmlFor={id + "-kind"}>{t("cap_kind")}</label>
        <select className="input" id={id + "-kind"} data-testid="cap-kind" value={kind} onChange={(e) => setKind(e.target.value as CaptionKind)}>
          <option value="figure">{t("cap_fig")}</option>
          <option value="table">{t("cap_tab")}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={id + "-title"}>{t("cap_title")}</label>
        <Input id={id + "-title"} data-testid="cap-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor={id + "-note"}>{t("cap_note")}</label>
        <textarea className="input" id={id + "-note"} data-testid="cap-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" variant="primary" data-testid="cap-insert">{t("cap_insert")}</Button>
        <Button type="button" variant="ghost" data-testid="cap-renum" onClick={renumber}>{t("cap_renum")}</Button>
        <Button type="button" variant="ghost" data-testid="cap-close" onClick={onClose}>{t("close_btn")}</Button>
      </DialogFooter>
    </form>
  );
}
