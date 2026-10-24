"use client";
import { useId, useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { paperShort, paperStatus, type Paper } from "@/lib/papers/list";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

/** The open-access link of a library entry, only when it is a web address: it came from a search result and is opened in a new tab. */
const safeLink = (u: string | undefined): string => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : "");

/**
 * One kept paper of the Reading list (canvas Read): its short name and its status, "Get the free PDF" with the line that tells the student what to do with it (when the paper has an
 * open-access link and no PDF yet), and the actions: Read (until B3 the reader of today's shelf), and More. More holds what is left of the shelf: Rename and Add to my references for a
 * paper only the reading list has, and Remove (the PDF text and its highlights; or, for a paper only the reading list has, the paper), which asks first, in the row.
 * `loading`: the paper's text is still being read, so its highlights are not known and its status is drawn as a bar, not a wrong "Not read yet".
 * `textState`: a line under the status for the automatic full text (Task 21b); nothing here.
 */
export function ReadingRow({ paper, loading, canWrite, onRead, onRename, onRemove, onAddRefs, textState }: {
  paper: Paper; loading: boolean; canWrite: boolean;
  onRead(): void; onRename(title: string): void; onRemove(): Promise<boolean>; onAddRefs(): void; textState?: ReactNode;
}) {
  const t = useT();
  const nameId = useId();
  const [mode, setMode] = useState<"idle" | "rename" | "remove">("idle");
  const [failed, setFailed] = useState(false);
  const short = paperShort(paper, t);
  const { entry, shelf } = paper;
  const only = entry === null;
  const free = !shelf ? safeLink(entry?.oa) : "";
  const canRead = !!shelf?.paper;
  const menu = !!shelf && canWrite;
  const fullTitle = (entry?.title ?? shelf?.title ?? "").trim();

  const remove = async () => {
    const ok = await onRemove();
    setFailed(!ok);
    if (ok) setMode("idle");
  };
  return (
    <li className="rl-row" data-testid="rl-row" data-pid={paper.pid || undefined} aria-busy={loading || undefined}>
      <div className="rl-main">
        <h3 className="rl-short" id={nameId} data-testid="rl-short" title={fullTitle || undefined}>{short}</h3>
        {loading
          ? <Skeleton className="rl-status-wait" data-testid="rl-status-wait" aria-hidden="true" />
          : <p className="rl-status" data-testid="rl-status">{paperStatus(paper, t)}</p>}
        {free && (
          <p className="rl-free" data-testid="rl-free">
            <a href={free} target="_blank" rel="noopener noreferrer" data-testid="rl-free-pdf">{t("rl_free_pdf")}</a>{" "}
            <span>{t("rl_free_pdf_line")}</span>
          </p>
        )}
        {textState}
        {mode === "rename" && shelf && (
          <form className="rl-rename" data-testid="rl-rename" onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("title");
            onRename(typeof v === "string" ? v : shelf.title);
            setMode("idle");
          }}>
            <label htmlFor={nameId + "-t"}>{t("rl_rename_label")}</label>
            <input id={nameId + "-t"} name="title" className="input" type="text" defaultValue={shelf.title} data-testid="rl-title" autoFocus />
            <div className="rl-confirm-acts">
              <button type="submit" className="rl-btn rl-btn-primary" data-testid="rl-rename-save">{t("rl_rename_save")}</button>
              <button type="button" className="rl-btn" onClick={() => setMode("idle")}>{t("rl_cancel")}</button>
            </div>
          </form>
        )}
        {mode === "remove" && shelf && (
          <div className="rl-confirm" role="group" aria-label={t(only ? "rl_remove_paper" : "rl_remove_pdf")} data-testid="rl-confirm">
            <p>{t(only ? "rl_remove_ask_paper" : "rl_remove_ask_pdf")}</p>
            <div className="rl-confirm-acts">
              <button type="button" className="rl-btn rl-btn-danger" data-testid="rl-remove-yes" onClick={() => { void remove(); }}>{t("rl_remove_yes")}</button>
              <button type="button" className="rl-btn" data-testid="rl-remove-no" onClick={() => { setMode("idle"); setFailed(false); }}>{t("rl_remove_no")}</button>
            </div>
            {failed && <p className="rl-fail" role="alert" data-testid="rl-remove-fail">{t("shelf_remove_fail")}</p>}
          </div>
        )}
      </div>
      {shelf && (
        <div className="rl-acts">
          <button type="button" className="rl-btn rl-btn-primary" data-testid="rl-read" disabled={!canRead} aria-label={t("rl_read_aria", { title: short })} onClick={onRead}>{t("rl_read")}</button>
          {menu && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rl-btn" data-testid="rl-more" aria-label={t("rl_more_aria", { title: short })}>{t("rl_more")}<CaretDown size={14} aria-hidden="true" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rl-menu" data-testid="rl-menu">
                {only && <DropdownMenuItem data-testid="rl-item-rename" onSelect={() => setMode("rename")}>{t("rl_rename")}</DropdownMenuItem>}
                {only && !!paper.pid && <DropdownMenuItem data-testid="rl-item-refs" onSelect={onAddRefs}>{t("rl_add_refs")}</DropdownMenuItem>}
                <DropdownMenuItem data-testid="rl-item-remove" onSelect={() => { setFailed(false); setMode("remove"); }}>{t(only ? "rl_remove_paper" : "rl_remove_pdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </li>
  );
}
