"use client";
import { useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useT } from "@/lib/i18n";
import { useWritingRun } from "@/lib/ai/useWritingRun";
import { collapseSelectionToEnd } from "@/lib/editor/insert";
import { selBubbleVisible } from "@/lib/editor/selectionBubble";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { placeHref } from "@/lib/frame/places";
import { requestHelpMenu } from "./HelpMenu";

const KEY = "selBubble";

/**
 * The v1 selection bubble (mockup 01): Find papers, Cite and Improve above 8 to 800 characters of selected text. Hidden while typing, scrolling or after an action.
 * "More help" opens the document's help menu (the research helpers) on the same selection; that menu is not limited to 800 characters (Task 32).
 */
export function SelectionBubble({ editor }: { editor: Editor }) {
  const t = useT();
  const { go, projectId, setPendingSearch } = useProject();
  const run = useWritingRun(editor);

  const hide = useCallback(() => { if (!editor.isDestroyed && document.querySelector(".sel-bubble")) editor.view.dispatch(editor.state.tr.setMeta(KEY, "hide")); }, [editor]);

  useEffect(() => {
    // The menu follows the window only, and the document scrolls inside its card: v1 hid the bubble on any scroll.
    const onScroll = (e: Event) => { if (!(e.target instanceof Node && e.target.parentElement?.closest(".sel-bubble"))) hide(); };
    // The menu keeps a click on itself from hiding it once; a real blur to anywhere else (the chat box, another panel) must.
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const to = event?.relatedTarget;
      if (!(to instanceof Node && document.querySelector(".sel-bubble")?.contains(to))) hide();
    };
    document.addEventListener("scroll", onScroll, true);
    editor.on("blur", onBlur);
    return () => { document.removeEventListener("scroll", onScroll, true); editor.off("blur", onBlur); };
  }, [editor, hide]);

  const selected = () => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, "\n").trim();
  };
  // The bubble's buttons must not take focus from the document: the selection they act on stays visible.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  const find = () => {
    const text = selected();
    hide();
    if (!text) return;
    setPendingSearch(text.slice(0, 200));
    void go(placeHref(projectId ?? "", "lit", "find"));
  };
  const cite = () => { hide(); collapseSelectionToEnd(editor); void go(placeHref(projectId ?? "", "lit", "citations")); toast(t("sel_cite_toast")); };
  const improve = () => { void run("improve"); hide(); };
  const more = () => { hide(); requestHelpMenu(editor); };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={KEY}
      updateDelay={150}
      className="sel-bubble"
      role="toolbar"
      aria-label="Selected text"
      data-testid="sel-bubble"
      shouldShow={({ state, view, element }) => {
        const { from, to, empty } = state.selection;
        if (!(view.hasFocus() || element.contains(document.activeElement))) return false;
        return selBubbleVisible({ empty, text: state.doc.textBetween(from, to, "\n") });
      }}
      options={{ strategy: "fixed", placement: "top-start", offset: 10, flip: false, shift: { padding: 8 } }}
    >
      <button type="button" data-testid="sel-find" onMouseDown={keep} onClick={find}>{t("sel_find")}</button>
      <button type="button" data-testid="sel-cite" onMouseDown={keep} onClick={cite}>{t("sel_cite")}</button>
      <button type="button" data-testid="sel-improve" onMouseDown={keep} onClick={improve}>{t("sel_improve")}</button>
      <button type="button" data-testid="sel-more" onMouseDown={keep} onClick={more}>{t("help_more")}</button>
    </BubbleMenu>
  );
}
