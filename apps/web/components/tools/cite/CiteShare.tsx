"use client";
import { useRef } from "react";
import { tHtml, useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { insertHtmlBlock } from "@/lib/editor/insert";
import { downloadBlob } from "@/lib/export/download";
import { citeExport, citeImport, citeInsertBib, citeLoadClassics } from "@/lib/cite/share";
import type { Library } from "@/lib/cite/useLibrary";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * The library's last buttons, in v1's order (940-946): "Insert reference list" (citInsertBib), "📖 Load classic psychology sources" (psychLoadStarters),
 * "⬆ Export library" / "⬇ Import library" (citExport, citImport, with the hidden file input), and the class-sharing note.
 */
export function CiteShare({ library, insertReady }: { library: Library; insertReady: boolean }) {
  const t = useT();
  const { editor } = useSuggestion();
  const file = useRef<HTMLInputElement>(null);
  const { lib, style, update } = library;
  const insertBib = () => citeInsertBib({ lib, style, toast, t, insert: (html) => { if (editor && !editor.isDestroyed) insertHtmlBlock(editor, html); } });
  const onFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    try { await citeImport(f, { lib, update, toast }); } finally { input.value = ""; }
  };
  return (
    <div className="stack cite-share">
      <Button variant="gold" className="w-full" data-testid="cite-insertbib" disabled={!insertReady} onClick={insertBib}>{t("cite_insertbib_btn")}</Button>
      <Button variant="ghost" className="w-full" data-testid="cite-loadclassics" disabled={!library.ready} onClick={() => citeLoadClassics({ lib, update, toast })}>{t("cite_loadclassics_btn")}</Button>
      <div className="cite-row">
        <Button variant="ghost" className="flex-1" data-testid="cite-export" onClick={() => citeExport({ lib, download: downloadBlob, toast })}>{t("cite_export_btn")}</Button>
        <Button variant="ghost" className="flex-1" data-testid="cite-import" disabled={!library.ready} onClick={() => file.current?.click()}>{t("cite_import_btn")}</Button>
      </div>
      <input ref={file} type="file" id="citImportFile" accept=".json,application/json" style={{ display: "none" }} data-testid="cite-import-file" onChange={(e) => { void onFile(e.currentTarget); }} />
      <p className="desc cite-sharing" data-testid="cite-sharing-note">{tHtml(t("cite_sharing_note"))}</p>
    </div>
  );
}
