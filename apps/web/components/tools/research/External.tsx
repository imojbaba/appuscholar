"use client";
import { useT } from "@/lib/i18n";
import { EXTERNAL, openExternal } from "@/lib/research/extras";
import { getResearch } from "@/lib/research/useSearch";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { RsDetails } from "./RsDetails";

/** "🌐 Not finding it? Search Google Scholar and others directly" (v1 999-1009): the four sites, each in a new tab with the topic typed in (rsOpenExternal). */
export function External() {
  const t = useT();
  return (
    <RsDetails name="external" className="rs-more-box" testid="rs-external" summary={t("research_external_summary")}>
      <p className="desc">{t("research_external_desc")}</p>
      <div className="rs-line">
        {EXTERNAL.map((x) => (
          <Button key={x.site} variant="ghost" size="sm" type="button" title={t(x.title)} data-testid={"rs-ext-" + x.site}
            onClick={() => openExternal(x.site, getResearch().topic, { open: (url) => { window.open(url, "_blank", "noopener"); }, toast, t })}>{t(x.label)}</Button>
        ))}
      </div>
    </RsDetails>
  );
}
