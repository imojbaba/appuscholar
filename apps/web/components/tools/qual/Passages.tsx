"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import type { QualCode, QualPassage } from "@appuscholar/core";
import { plainText, useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { findPassages } from "@/lib/tools/qual/passages";
import { Button } from "@/components/ui/button";
import { PanelLoading } from "../PanelLoading";

/**
 * The passages of one code (v1 qualOpenPassages 6298-6309, a dialog there; an inline view here, register row D-S2-83): "Coded passages" and the code's name, v1's description,
 * then each passage as its document's title and the words in curly quotes, in the order of the documents and of the text; v1's line when there are none. The documents are read
 * when the view opens (allDocuments(), the open one as the editor holds it now). Everything is printed as text, never as markup. "Back to codes" takes focus first when the view opens.
 */
export function Passages({ code, onBack }: { code: QualCode; onBack: () => void }) {
  const t = useT();
  const access = useDocAccess();
  const [passages, setPassages] = useState<QualPassage[] | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    access.allDocuments().then((docs) => { if (live) setPassages(findPassages(docs, code.id)); }, () => { if (live) setPassages([]); });
    return () => { live = false; };
  }, [access, code.id]);
  return (
    <div data-testid="qual-passages">
      <Button ref={back} type="button" variant="ghost" size="sm" data-testid="qual-passages-back" onClick={onBack}><ArrowLeft aria-hidden="true" />{t("qual_btn_back")}</Button>
      <h3 className="mt-3" data-testid="qual-passages-h">{plainText(t("qual_passages_h2"))} <span data-testid="qual-passages-code">{code.name}</span></h3>
      <p className="desc">{t("qual_passages_desc")}</p>
      {passages === null ? <PanelLoading testId="qual-passages-loading" /> : passages.length === 0 ? (
        <p className="desc" data-testid="qual-passages-empty">{t("qual_passages_empty")}</p>
      ) : (
        <ul className="m-0 list-none p-0" data-testid="qual-passages-list">
          {passages.map((p, i) => (
            <li key={i} className="mb-2 rounded-md border border-line-strong bg-card p-2.5 text-[13.5px]" data-testid="qual-passage">
              <div className="mb-1 text-xs font-semibold text-accent-ink" data-testid="qual-passage-doc">{p.doc}</div>
              {"“"}{p.text}{"”"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
