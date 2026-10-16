"use client";
import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { insertPlainHtml } from "@/lib/editor/insert";
import { SCAFFOLDS, scaffoldToHtml, type ScaffoldName } from "@/lib/templates";

const NAMES = Object.keys(SCAFFOLDS) as [ScaffoldName, ...ScaffoldName[]];

/** v1's template menu: the `🧱 Template` button and its "Which template?" list. The action row hosts the button. */
export function TemplatePicker({ editor }: { editor: Editor }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<ScaffoldName>(NAMES[0]);

  function insert() {
    setOpen(false);
    insertPlainHtml(editor, scaffoldToHtml(SCAFFOLDS[name]), { atEnd: true });
    toast("Template inserted ✓ — Ctrl+Z to undo");
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" title={t("template_btn_title")} data-testid="act-template"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)}>{t("template_btn")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" data-testid="template-dialog" aria-describedby={undefined}
          onCloseAutoFocus={(e) => { e.preventDefault(); editor.commands.focus(); }}>
          <form onSubmit={(e) => { e.preventDefault(); insert(); }} className="grid gap-3">
            <DialogHeader><DialogTitle className="text-xl font-semibold text-purple-800">Which template?</DialogTitle></DialogHeader>
            <fieldset className="grid gap-2" aria-label="Which template?">
              {NAMES.map((n) => (
                <label key={n} className="flex items-center gap-2">
                  <input type="radio" name="template" value={n} checked={name === n} onChange={() => setName(n)} data-testid={"template-" + n.split(" ")[0]!.toLowerCase()} />
                  {n}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} data-testid="template-cancel">{t("sap_cancel_btn")}</Button>
              <Button type="submit" variant="primary" data-testid="template-insert">Insert</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
