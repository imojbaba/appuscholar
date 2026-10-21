"use client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";
import { usePopout } from "@/lib/popout/mode";

/**
 * A stage whose tools are not built yet (design and ethics, collection and analysis, review): it says so in words and offers the document, where
 * the student can plan the stage now: "Open my document" opens it beside this place (Task 11). A place's own window has no document, so no button.
 */
export function NotBuilt() {
  const t = useT();
  const { openDocument } = useProject();
  const popout = usePopout();
  return (
    <div className="place-notbuilt">
      <p className="place-note" data-testid="not-built">{t("place_not_built")} {t("not_built_body")}</p>
      {!popout && (
        <div className="place-row">
          <Button variant="primary" data-testid="not-built-open" onClick={openDocument}>{t("not_built_open_doc")}</Button>
        </div>
      )}
    </div>
  );
}
