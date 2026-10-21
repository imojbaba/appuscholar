"use client";
import { useT } from "@/lib/i18n";
import { placeHref } from "@/lib/frame/places";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * A stage whose tools are not built yet (design and ethics, collection and analysis, review): it says so in words and offers the document, where
 * the student can plan the stage now. Until Task 11 adds openDocument, "Open my document" goes to the Writing place, where the document is.
 */
export function NotBuilt() {
  const t = useT();
  const { projectId, go } = useProject();
  return (
    <div className="place-notbuilt">
      <p className="place-note" data-testid="not-built">{t("place_not_built")} {t("not_built_body")}</p>
      <div className="place-row">
        <Button variant="primary" data-testid="not-built-open" onClick={() => { void go(placeHref(projectId ?? "", "writing")); }}>{t("not_built_open_doc")}</Button>
      </div>
    </div>
  );
}
