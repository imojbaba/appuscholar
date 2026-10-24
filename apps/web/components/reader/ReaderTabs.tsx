"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { READER_TABS, readerHref, type ReaderTab } from "@/lib/reader/load";

/**
 * The reader's tabs (canvas Read), in this order: Your take first, Ask, Check numbers, Walk-through, Card and Highlights ({n}). Each is a link to the same paper with `?tab=` set, so the open
 * tab is in the address (a reload, a pasted link and the back button all land on it) and the paper stays loaded while the student moves between them; the default tab (Your take first)
 * has no `?tab=`. Links replace the address rather than add to the history, so Back leaves the paper, not the last tab. On a phone the bar scrolls sideways inside itself and the page does not
 * (globals.css, .rd-tabs). `highlights` is the number of passages the student saved from this paper.
 */
export function ReaderTabs({ projectId, pid, tab, highlights }: { projectId: string; pid: string; tab: ReaderTab; highlights: number }) {
  const t = useT();
  return (
    <div className="rd-tabs" role="tablist" aria-label={t("reader_tabs_aria")} data-testid="reader-tabs">
      {READER_TABS.map((k) => (
        <Link key={k} role="tab" id={"rd-tab-" + k} replace scroll={false} href={readerHref(projectId, pid, { tab: k })} aria-selected={k === tab} aria-controls="rd-panel" data-testid={"reader-tab-" + k}>
          {k === "highlights" ? t("reader_tab_highlights", { n: highlights }) : t("reader_tab_" + k)}
        </Link>
      ))}
    </div>
  );
}
