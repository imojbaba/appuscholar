"use client";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { citLastName } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { caretEntry } from "@/lib/cite/caret";
import { citePanelShown, getCiteActive, setCiteActive } from "@/lib/cite/active";
import { useLibrary } from "@/lib/cite/useLibrary";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";
import { placeHref } from "@/lib/frame/places";

/** v1 citCaretSchedule 7713: the chip is worked out this long after the caret stops. */
export const CARET_CHIP_DELAY_MS = 120;

/**
 * The document-to-library chip in the writing toolbar (v1 618, citCaretUpdate 7703-7712, citJumpToCaret 7714-7719): when the caret or the
 * selection touches an in-text citation of a library source (the surname-then-year rule of "Cited in"), "📚 Smith, 2020 — show in Citation
 * Manager"; a click opens the Citations tab with that source lit and brought to the middle. While the tab is on screen the source lights by
 * itself as the caret moves, and goes dark when the caret leaves every citation.
 */
export function CaretChip({ editor }: { editor: Editor }) {
  const t = useT();
  const { lib } = useLibrary({ passive: true });
  const { go, projectId } = useProject();
  /** citCaretIdx and the chip's text, as v1 sets them at each update. */
  const [chip, setChip] = useState<{ index: number; c: string }>({ index: -1, c: "" });
  const libRef = useRef(lib);
  useEffect(() => { libRef.current = lib; }, [lib]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (editor.isDestroyed) return;
      const l = libRef.current;
      const idx = caretEntry(editor, l);
      if (idx < 0) {
        setChip({ index: -1, c: "" });
        if (getCiteActive().index >= 0) setCiteActive(-1);
        return;
      }
      const d = l[idx]!;
      setChip({ index: idx, c: citLastName(d.author) + ", " + (d.year || "n.d.") });
      if (citePanelShown()) setCiteActive(idx, false);
    };
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { try { update(); } catch { /* as v1: a failed update leaves the chip as it was */ } }, CARET_CHIP_DELAY_MS); };
    editor.on("selectionUpdate", schedule);
    return () => { if (timer) clearTimeout(timer); editor.off("selectionUpdate", schedule); };
  }, [editor]);

  if (chip.index < 0) return null;
  const jump = () => {
    const i = chip.index;
    if (i < 0) return;
    setCiteActive(i, true);
    void go(placeHref(projectId ?? "", "lit", "citations"));
  };
  return (
    <Button type="button" variant="ghost" size="sm" className="cit-caret-chip" data-testid="cit-caret-chip" onMouseDown={(e) => e.preventDefault()} onClick={jump}>
      {t("cit_caret_chip", { c: chip.c })}
    </Button>
  );
}
