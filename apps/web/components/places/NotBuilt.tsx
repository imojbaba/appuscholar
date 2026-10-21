"use client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";
import { usePopout } from "@/lib/popout/mode";

/**
 * A tab whose tool is not built yet (Task G2: any tab of the registry whose module is not built): it says so in words and offers the document,
 * where the student can plan the stage now: "Open my document" opens it beside this place (Task 11), and goes once it is open. A place's own
 * window has no document, and Writing shows it already under the place (`docShown`), so neither has the button.
 */
export function NotBuilt({ docShown = false }: { docShown?: boolean }) {
  const t = useT();
  const { openDocument, docOpen } = useProject();
  const popout = usePopout();
  return (
    <div className="place-notbuilt">
      <p className="place-note" data-testid="not-built">{t("place_not_built")} {t("not_built_body")}</p>
      {!popout && !docOpen && !docShown && (
        <div className="place-row">
          <Button variant="primary" data-testid="not-built-open" onClick={openDocument}>{t("not_built_open_doc")}</Button>
        </div>
      )}
    </div>
  );
}
