"use client";
import { useId } from "react";
import type { RsPaper } from "@appuscholar/core";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuickBox } from "@/components/tools/research/QuickBox";

export type ResultActions = {
  /** Put a citation in my document (v1's Insert citation; the paper is kept first). */
  cite(): void;
  /** Papers connected to this one (v1's rsConnected). */
  connected(): void;
  /** Read the abstract with AI (v1's Quick read, rsQuick). */
  quick(): void;
  /** Read it now (replaces v1's Analyse this paper: keeps the paper, then opens the Reading list with its abstract loaded). */
  read(): void;
};

type T = (key: string, vars?: Record<string, string | number>) => string;
const end = (s: string) => (/[.!?]$/.test(s) ? s : s + ".");

/** "Authors. Year. Journal. Cited n times." (canvas Find): the parts a result has, each ended with a full stop. */
function metaLine(p: RsPaper, t: T): string {
  const parts = [p.authors, String(p.year || ""), p.venue].map((x) => (x ?? "").trim()).filter(Boolean).map(end);
  const n = p.citationCount ?? 0;
  if (n) parts.push(n === 1 ? t("find_cited_one") : t("find_cited", { n }));
  return parts.join(" ");
}

/** The paper's own page: its DOI's link, else the link the source gave (none: no item). */
function paperLink(p: RsPaper): string {
  return p.doi ? "https://doi.org/" + p.doi.split("/").map(encodeURIComponent).join("/") : p.url ?? "";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One search result as the canvas Find draws it: the title; "Authors. Year. Journal. Cited n times."; the badges (Retracted, Free PDF, the kind of study and the sample
 * once the abstract has been read with AI and confirmed them, the fit when ranked); "Why it fits (AI): ..." with the gold edge when ranked; the AI's reading of the
 * abstract once done (also with the gold edge); one primary button, Keep or Kept; and More, which holds the rest. `busy`: a Keep is waiting for the library to be read.
 * `keepOff`: the library cannot be opened, so nothing can be kept: Keep, "Put a citation in my document" and "Read it now" (which keep the paper first) are off.
 *
 * Keep is `aria-disabled`, not `disabled`, while busy, once Kept or when off: a disabled button drops the keyboard focus, and the toast that used to say "added" is gone,
 * so the focused button is how the student hears the result (FindTab's live region says "Kept: {title}"). A press on it is ignored then.
 */
export function FindResult({ p, kept, busy, keepOff, onKeep, actions }: { p: RsPaper; kept: boolean; busy: boolean; keepOff: boolean; onKeep(): void; actions: ResultActions }) {
  const t = useT();
  const titleId = useId();
  const oaId = (p as RsPaper & { oaId?: string }).oaId;
  const link = paperLink(p);
  const q = p.quick;
  const inert = kept || busy || keepOff;
  return (
    <article className="find-result" data-testid="rs-card">
      <div className="find-result-main">
        <h3 id={titleId}>{p.title}</h3>
        <p className="find-meta" data-testid="find-meta">{metaLine(p, t)}</p>
        {(p.retracted || p.oaUrl || p.oaStatus || q?.design?.ok || q?.sample?.ok || p.rel) && (
          <div className="find-badges" data-testid="find-badges">
            {p.retracted && <span className="find-badge find-badge-retracted" data-testid="find-badge-retracted" title={t("retr_tip")}>{t("find_badge_retracted")}</span>}
            {(p.oaUrl || p.oaStatus) && <span className="find-badge">{t("find_badge_free")}</span>}
            {q?.design?.ok && <span className="find-badge">{cap(q.design.type)}</span>}
            {q?.sample?.ok && <span className="find-badge">{t("find_badge_sample", { n: q.sample.n.toLocaleString() })}</span>}
            {p.rel && <span className="find-badge" data-testid="find-fit">{t("find_fit", { n: p.rel.score })}</span>}
          </div>
        )}
        {p.rel && <p className="find-why" data-testid="find-why">{t(p.rel.titleOnly ? "find_why_title" : "find_why", { reason: p.rel.reason })}</p>}
        {q && <QuickBox q={q} />}
      </div>
      <div className="find-result-acts">
        <button type="button" className="find-keep" data-testid="find-keep" data-kept={kept || undefined} aria-describedby={titleId}
          aria-disabled={inert || undefined} aria-busy={busy || undefined} onClick={() => { if (!inert) onKeep(); }}>
          {kept ? <><Check size={16} weight="bold" aria-hidden="true" />{t("find_kept")}</> : t("find_keep")}
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="find-more" data-testid="find-more" aria-label={t("find_more_aria", { title: p.title })}>
              {t("find_more")}<CaretDown size={14} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="find-menu" data-testid="find-menu">
            <DropdownMenuItem data-testid="find-item-cite" disabled={keepOff} onSelect={actions.cite}>{t("find_item_cite")}</DropdownMenuItem>
            {link && <DropdownMenuItem asChild><a href={link} target="_blank" rel="noopener noreferrer" data-testid="find-item-open">{t("find_item_open")}</a></DropdownMenuItem>}
            {p.oaUrl && <DropdownMenuItem asChild><a href={p.oaUrl} target="_blank" rel="noopener noreferrer" data-testid="find-item-pdf">{t("find_item_pdf")}</a></DropdownMenuItem>}
            {oaId && <DropdownMenuItem data-testid="find-item-connected" onSelect={actions.connected}>{t("find_item_connected")}</DropdownMenuItem>}
            <DropdownMenuItem data-testid="find-item-quick" onSelect={actions.quick}>{t("find_item_quick")}</DropdownMenuItem>
            <DropdownMenuItem data-testid="find-item-read" disabled={keepOff} onSelect={actions.read}>{t("find_item_read")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
