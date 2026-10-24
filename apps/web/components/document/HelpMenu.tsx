"use client";
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Sparkle } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { HELPER_MENU, scopeLine } from "@/lib/ai/helperMenu";
import { useHelperRun } from "@/lib/ai/useHelperRun";
import { heldEditorSelection, helperScope } from "@/lib/editor/heldSelection";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Who wants the menu open, per editor: the toolbar's button and the selection bubble's "More help" are in different components of one card. */
const asks = new WeakMap<Editor, Set<() => void>>();

/** Opens the help menu of `editor`'s document. */
export function requestHelpMenu(editor: Editor): void {
  for (const open of asks.get(editor) ?? []) open();
}

/**
 * "Help with this text", the first control of the document's toolbar (also on a phone, where the bar scrolls and this is the first thing in it). It
 * does not take focus from the document, so the selection the helpers will read stays where it is on the screen.
 */
export function HelpButton({ editor }: { editor: Editor }) {
  const t = useT();
  return (
    <button type="button" className="fmt help-btn" aria-haspopup="dialog" data-testid="help-with-text" onMouseDown={(e) => e.preventDefault()} onClick={() => requestHelpMenu(editor)}>
      <Sparkle aria-hidden="true" />{t("help_with_text")}
    </button>
  );
}

/**
 * The research helpers where the student's text is (Task 32, W25): one menu for the toolbar's "Help with this text" and the bubble's "More help".
 * Its line under the title says what the helper will read, the selection the document holds (of any length, kept while this menu has the focus) or the
 * whole document. A choice closes the menu and the answer opens in the pane beside the document; the place does not change, and the menu is one click
 * away again. The helpers and their prompts are v1's (Research helpers panel 728-738, psychTool, devilTool); only where they are reached has changed.
 */
export function HelpMenu({ editor }: { editor: Editor }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const run = useHelperRun(editor);
  useEffect(() => {
    const set = asks.get(editor) ?? new Set<() => void>();
    const ask = () => setOpen(true);
    set.add(ask);
    asks.set(editor, set);
    return () => { set.delete(ask); };
  }, [editor]);
  // Read each time the menu is shown: the selection is what it is at that moment (the whole document needs no text here, only the fact).
  const scope = open ? helperScope(heldEditorSelection(editor), "") : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* sm:max-w-md, not max-w-md: the dialog keeps its 16px gutter on a phone. */}
      <DialogContent className="help-menu sm:max-w-md" data-testid="help-menu">
        <DialogHeader>
          <DialogTitle>{t("help_with_text")}</DialogTitle>
          <DialogDescription data-testid="help-scope">{scope ? scopeLine(t, scope) : ""}</DialogDescription>
        </DialogHeader>
        <div className="help-list">
          {HELPER_MENU.map(({ id, name, what }) => (
            <button key={id} type="button" className="help-item" data-testid={"help-" + id} onClick={() => { setOpen(false); void run(id); }}>
              <span className="help-item-name">{t(name)}</span>
              <span className="help-item-what">{t(what)}</span>
            </button>
          ))}
        </div>
        <p className="help-where">{t("help_where")}</p>
      </DialogContent>
    </Dialog>
  );
}
