"use client";
import { Download } from "@phosphor-icons/react";
import { BANK_CSV_NAME, bankCsv, type BankEntry } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { downloadBlob } from "@/lib/export/download";
import { Button } from "@/components/ui/button";

/** How many words v1 lists (bankRender 6667): the newest; the spreadsheet holds every one. */
const SHOWN = 60;

/** v1 pdDownload (9507-9511): a byte-order mark, then the text, as text/csv. */
export function downloadBank(bank: BankEntry[]): boolean {
  const csv = bankCsv(bank);
  if (csv === null) return false;
  downloadBlob(BANK_CSV_NAME, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  return true;
}

/** My word bank (v1 panel 818-822, bankRender 6665-6670): the saved words, newest first, each opening in the dictionary or removable, and the spreadsheet. */
export function WordBank({ bank, writable, onOpen, onRemove }: { bank: BankEntry[]; writable: boolean; onOpen(w: string): void; onRemove(w: string): void }) {
  const t = useT();
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-semibold">{t("wd2_bank_title")}</summary>
      <p className="desc" style={{ margin: "6px 0 0" }} data-testid="bank-count">{bank.length === 1 ? t("wd2_bank_count_one") : t("wd2_bank_count_n", { n: bank.length })}</p>
      <div className="mt-1.5 max-h-[220px] overflow-auto" data-testid="bank-list">
        {bank.length === 0 ? <span className="text-[13px] text-muted-foreground">{t("wd2_bank_none")}</span> : (
          <ul className="m-0 list-none p-0">
            {bank.slice(0, SHOWN).map((x) => (
              <li key={x.w} className="flex items-baseline gap-1.5 border-b border-line py-1 text-[13px]" data-testid="bank-item">
                <span className="flex-1">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-bold text-[color:var(--accent-ink)] underline" data-testid="bank-open" aria-label={t("wd2_bank_open", { w: x.w })} onClick={() => onOpen(x.w)}>{x.w}</button>
                  {" "}<span className="text-muted-foreground">{x.pos}{x.h ? " · " + x.h : ""}</span>
                  <br /><span className="text-xs">{x.m}</span>
                </span>
                <Button variant="ghost" size="xs" data-testid="bank-remove" disabled={!writable} onClick={() => onRemove(x.w)}>{t("wd2_remove")}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {bank.length > SHOWN && <p className="desc" data-testid="bank-more">{t("wd2_bank_more")}</p>}
      <Button variant="ghost" size="sm" className="mt-1.5" data-testid="bank-csv" disabled={bank.length === 0} onClick={() => downloadBank(bank)}>
        <Download aria-hidden />{t("wd2_csv")}
      </Button>
    </details>
  );
}
