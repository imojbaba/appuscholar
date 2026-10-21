"use client";
import { DownloadSimple } from "@phosphor-icons/react";
import type { ClResult } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { CL_COLS, kindKey, markedPieces } from "@/lib/tools/close/report";
import { Button } from "@/components/ui/button";

/** What the check was run on: its result, and the text it ran over (the document as it stood then). */
export type Checked = { r: ClResult; text: string; unreadable: number };

const col = (i: number) => CL_COLS[i % CL_COLS.length]!;

/**
 * clRender (6949-6966) in the frame's words: the result box, the limits, the text with its matches marked, the totals by source, each matching passage, and the download. The student's
 * words are drawn as React text, never as markup. A result of nothing shows v1's sentence and no download (v1 returned before both).
 */
export function Result({ c, onDownload }: { c: Checked; onDownload(): void }) {
  const t = useT();
  const { r, text } = c;
  const kind = (k: string) => { const key = kindKey(k); return key ? t(key) : k; };
  return (
    <div data-testid="close-result" className="mt-3">
      <div className="ap-box">
        <b>{t("close_result_lead", { pct: r.pct })}</b>{t("close_result_rest", { covered: r.covered, counted: r.counted, minRun: r.minRun })}
        <br /><span className="ap-small">{t("close_limits")}</span>
      </div>
      {c.unreadable > 0 && <p className="ap-warn" data-testid="close-skipped">{c.unreadable === 1 ? t("close_skipped_one") : t("close_skipped_many", { n: c.unreadable })}</p>}
      {r.runs.length === 0 ? <div className="ap-box">{t("close_none", { minRun: r.minRun })}</div> : (
        <>
          <details open>
            <summary className="cursor-pointer font-bold">{t("close_marked")}</summary>
            <div className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line p-2 text-[13px] leading-[1.6]" tabIndex={0} data-testid="close-marked">
              {markedPieces(text, r.runs).map((p, i) => p.run
                ? <span key={i}><mark style={{ background: col(p.run.src) }}>{p.text}</mark><sup className="ml-0.5 text-[10px]">{p.run.tag}</sup></span>
                : <span key={i}>{p.text}</span>)}
            </div>
          </details>
          <div className="mt-2.5" data-testid="close-by-source">
            <div className="font-bold">{t("close_by_source")}</div>
            {r.per.map((p, i) => p.runs ? (
              <div className="ap-box" key={i}>
                <span className="mr-1.5 inline-block size-2.5 border border-current" style={{ background: col(i) }} aria-hidden="true" />
                [{i + 1}] {p.name} <span className="ap-small">({kind(p.kind)})</span>: {p.runs === 1 ? t("close_by_one", { words: p.words }) : t("close_by_many", { words: p.words, n: p.runs })}
              </div>
            ) : null)}
          </div>
          <div className="mt-2.5 font-bold">{t("close_each")}</div>
          {r.runs.map((x, n) => (
            <div className="ap-box" key={n} data-testid="close-passage">
              <b>[{x.src + 1}.{n + 1}]</b> {t("close_passage_head", { words: x.words, name: r.sources[x.src]!.name })}{x.page ? t("close_page", { page: x.page }) : ""}
              {x.also.length > 0 && <>. {t("close_also", { list: x.also.map((a) => "[" + (a + 1) + "] " + r.sources[a]!.name).join("; ") })}</>}
              <br /><span className="text-[12.5px]"><b>{t("close_yours")}</b> {x.mine.slice(0, 400)}</span>
              <br /><span className="text-[12.5px]"><b>{t("close_theirs")}</b> {x.theirs.slice(0, 400)}</span>
              <div className="ap-warn mt-1">{t("close_todo")}</div>
            </div>
          ))}
          <div className="ap-row">
            <Button variant="gold" size="sm" data-testid="close-download" onClick={onDownload}><DownloadSimple aria-hidden="true" />{t("close_download")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
