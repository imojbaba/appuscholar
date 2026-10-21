"use client";
import type { Formatted } from "@appuscholar/core";
import { plain, useT } from "@/lib/i18n";
import { useInsertTarget } from "@/lib/popout/sync";
import type { CiteDeps } from "@/lib/cite/actions";
import { useLibrary } from "@/lib/cite/useLibrary";
import { toast } from "@/components/ui/toast";
import { CiteForm } from "./CiteForm";
import { CiteLibrary } from "./CiteLibrary";
import { CiteCapture, CiteQuote } from "./CiteQuote";

/**
 * 📚 Citation Manager (v1 873-947). In v1's order: the heading and description, the form (CiteForm), the quote block and the one-click capture
 * (Task 8), the library (CiteLibrary). Citations go in at the open document's cursor (after the selection bubble's Cite the cursor is already at the
 * end of the passage); in a pop-out they are sent to the writing window (lib/popout/sync.ts); the library is the open project's `citations` blob.
 */
export function CitePanel() {
  const t = useT();
  const library = useLibrary();
  // The open document's editor, or the writing window when this is a pop-out.
  const target = useInsertTarget();
  const deps = (): CiteDeps => ({
    lib: library.lib, style: library.style, toast, t,
    insert: (f: Formatted) => target.citation(f)
  });
  return (
    <div className="panel" data-testid="panel-cite">
      <h3>{plain(t("tab_cite"))}</h3>
      <p className="desc">{t("cite_panel_desc")}</p>
      {library.locked && <p className="note cite-state" role="status" data-testid="cite-locked">{t("vault_cite_locked")}</p>}
      {library.broken && <p className="note cite-state" role="status" data-testid="cite-broken">{t("vault_cite_broken")}</p>}
      <CiteForm library={library} deps={deps} />
      <CiteQuote />
      <CiteCapture />
      <CiteLibrary library={library} deps={deps} />
    </div>
  );
}
