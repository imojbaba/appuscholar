"use client";
import type { ClDoc } from "@appuscholar/core";
import type { ShelfIndex } from "@/lib/blobs/kinds";
import { useT } from "@/lib/i18n";

/**
 * closeInit's list (6901-6916): the Reading shelf's papers, then "Your other documents", each with a box, ticked unless the student unticked it ("off" holds the unticked values: a
 * paper added later arrives ticked, as v1's `had[...] === false` read it). A shelf not read yet says so, never "empty".
 */
export function Sources({ index, notRead, locked, broken, docs, off, onToggle }: {
  index: ShelfIndex | null; notRead: boolean; locked: boolean; broken: boolean; docs: ClDoc[]; off: ReadonlySet<string>; onToggle(value: string): void;
}) {
  const t = useT();
  const box = (value: string, label: string) => (
    <label key={value} className="flex cursor-pointer items-start gap-1.5 text-[12.5px]">
      <input type="checkbox" data-testid="close-source" value={value} checked={!off.has(value)} onChange={() => onToggle(value)} />
      <span>{label.slice(0, 100)}</span>
    </label>
  );
  const papers = index ?? [];
  return (
    <div className="my-2" data-testid="close-sources">
      {papers.length > 0 && <div className="mb-1 mt-2 text-[12.5px] font-bold">{t("close_shelf_head")}</div>}
      {papers.map((p) => box("s:" + p.id, p.title || p.file || t("sh2_paper")))}
      {papers.length === 0 && !notRead && <p className="ap-small">{t("close_shelf_empty")}</p>}
      {locked && <p className="note ap-note" data-testid="close-shelf-locked">{t("vault_shelf_locked")}</p>}
      {broken && <p className="note ap-note" data-testid="close-shelf-broken">{t("vault_shelf_broken")}</p>}
      {docs.length > 0 && <div className="mb-1 mt-2 text-[12.5px] font-bold">{t("close_docs_head")}</div>}
      {docs.map((d) => box("d:" + d.id, d.title || t("close_untitled")))}
    </div>
  );
}
