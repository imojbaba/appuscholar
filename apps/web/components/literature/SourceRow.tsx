"use client";
import type { ReactNode } from "react";
import { citLastName, type CitationEntry } from "@appuscholar/core";
import { CaretDown, CheckCircle, CircleDashed, Prohibit, WarningCircle } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { SourceStatus } from "@/lib/cite/checks";
import type { SourceUse } from "@/lib/cite/usage";
import { useTitle, type Titled } from "@/lib/vault/titles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** One word and one icon per status, so the status is never colour alone. */
const STATUS_ICON: Record<SourceStatus, typeof CheckCircle> = {
  checked: CheckCircle, fix: WarningCircle, year: WarningCircle, retracted: Prohibit, unchecked: CircleDashed
};

/** Stands in for the document's name while the sentence is cut in two around it (the name is a button; the words around it are the dictionary's, in either language's order). */
const NAME = "\u0001";

/**
 * "Not cited yet", "Cited once in {document}" (the name opens that document) or "Cited {n} times: {documents}": each document that mentions the source is a link that opens it, in the
 * project's order, with its own count where it has more than one mention (v1's "Cited in: A (2x), B", citRender 7851-7854).
 */
function UseLine({ use, documents, onOpenDoc }: { use: SourceUse; documents: Titled[]; onOpenDoc(id: string): void }) {
  const t = useT();
  if (use.kind === "none") return <>{t("cit_use_none")}</>;
  const link = (id: string) => (
    <button type="button" className="cit-use-link" onClick={() => onOpenDoc(id)}><DocName doc={documents.find((d) => d.id === id) ?? null} /></button>
  );
  if (use.kind === "many") {
    const [before = "", after = ""] = t("cit_use_many", { n: use.n, documents: NAME }).split(NAME);
    return (
      <>
        {before}
        {use.docs.map((d, i) => (
          <span key={d.id}>{i > 0 ? ", " : ""}{link(d.id)}{d.n > 1 ? " (" + d.n + "×)" : ""}</span>
        ))}
        {after}
      </>
    );
  }
  const [before = "", after = ""] = t("cit_use_once", { document: NAME }).split(NAME);
  return <>{before}{link(use.doc.id)}{after}</>;
}

/** A document's name as the student reads it: opened under a vault, "Locked title" while it is locked. */
function DocName({ doc }: { doc: Titled | null }) {
  return <>{useTitle(doc, "document").text}</>;
}

export type SourceRowProps = {
  /** The source's place in the library: the number a numbered style gives it, and the key the caret chip lights it by. */
  index: number;
  entry: CitationEntry;
  /** The reference in the chosen style, already sanitised (core builds it from the entry's own fields and escapes them). */
  html: string;
  /** What an Insert citation puts in the document: "(Cohen, 1988)", or "¹ (n)" for AMA. */
  cite: string;
  status: SourceStatus;
  use: SourceUse;
  /** The project's documents, whose names are shown opened (a usage's own title is the stored one, sealed under a vault). */
  documents: Titled[];
  /** The caret chip points at this source: the row is lit (citMarkActive 7697-7702). */
  lit: boolean;
  /**
   * What is wrong with this source (wave B Task 24): its "Needs your attention" items with their fix buttons (components/frame/AttentionCard), then the notes that are information, not
   * problems ("DOI found: ..."). The row draws it under the status in a strip of its own, and nothing when it is empty.
   */
  problem?: ReactNode;
  onOpenDoc(id: string): void;
  /** More > Insert citation. */
  onInsert(): void;
  /** More > Remove from my library. */
  onRemove(): void;
};

/**
 * One source in the Citations tab (canvas Citations): its reference in the chosen style, then its status ("Checked", "Needs a fix", "Year differs from Crossref", "Retracted", "Not checked yet")
 * and its use in the project's documents beside it; what needs attention, with its fixes, under them; and a More menu with the two things only the Citation Manager panel carried (ruling B2-R28), Insert
 * citation at the cursor and Remove. The row the caret chip points at is lit and comes into view (the tab does that by `data-cite-index`).
 */
export function SourceRow({ index, entry, html, cite, status, use, documents, lit, problem, onOpenDoc, onInsert, onRemove }: SourceRowProps) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  const name = citLastName(entry.author) + ", " + (entry.year || "n.d.");
  return (
    <article className={"cit-row" + (lit ? " cit-active" : "")} data-testid="source-row" data-cite-index={index}>
      <div className="cit-row-main">
        <p className="cit-ref" data-testid="source-ref" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="cit-meta">
          <span className={"cit-status cit-status-" + status} data-testid="source-status" data-status={status}><Icon size={16} weight="bold" aria-hidden="true" />{t("cit_status_" + status)}</span>
          <span className="cit-use" data-testid="source-use"><UseLine use={use} documents={documents} onOpenDoc={onOpenDoc} /></span>
        </div>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="cit-row-more" data-testid="source-more" aria-label={t("cit_more_aria", { source: name })}>
            {t("cit_more")}<CaretDown size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="cit-menu">
          <DropdownMenuItem data-testid="source-item-insert" onSelect={onInsert}>{t("cit_item_insert", { cite })}</DropdownMenuItem>
          <DropdownMenuItem data-testid="source-item-remove" onSelect={onRemove}>{t("cit_item_remove")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="cit-problem-slot" data-cite-slot="cite-attention">{problem}</div>
    </article>
  );
}
