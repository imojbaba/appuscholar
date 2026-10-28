"use client";
import type { RsBrief } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { ConnectedBox } from "@/lib/research/useSearch";
import { RsDetails } from "./RsDetails";

/** One of rsConnected's two lists (8515-8519): the heading with its count, the papers' cards, or "None found.". */
function List({ label, list }: { label: string; list: RsBrief[] }) {
  const t = useT();
  return (
    <>
      {/* ' (' and ')' are v1's literals (8515). */}
      <h4 className="rs-conn-h">{label + " (" + list.length + ")"}</h4>
      {list.length ? (
        <div className="connected-list">
          {list.map((x, i) => (
            <div className="paper-card" key={i}><b>{x.title}</b><div className="meta">{x.authors}{x.year ? " · " + x.year : ""}</div></div>
          ))}
        </div>
      ) : <p className="desc">{t("rs2_none_found")}</p>}
    </>
  );
}

/**
 * "🔗 Connected papers" (v1 1026-1030) and its box #rsConnected, which a card's "🔗 Connected papers" fills (rsConnected 8498-8523): the loading
 * line, then "🔗 Connected to: <title>" with "📖 This paper cites (n)" and "📥 Papers that cite this one (n)", or v1's failure sentence.
 */
export function Connected({ box }: { box: ConnectedBox }) {
  const t = useT();
  return (
    <RsDetails name="connected" className="rs-more-box" testid="rs-connected-box" summary={t("research_connected_summary")}>
      <p className="desc">{t("research_connected_desc")}</p>
      <div id="rsConnected" data-testid="rs-connected-out">
        {/* '”…' closes v1's loading line (8501). */}
        {box?.kind === "loading" && <p className="desc">{t("rs2_loading_connected_papers_for") + box.title + "”…"}</p>}
        {box?.kind === "done" && (
          <>
            <h3>{t("rs2_connected_to") + " " + box.title}</h3>
            <List label={t("rs2_this_paper_cites")} list={box.cites} />
            <List label={t("rs2_papers_that_cite_this")} list={box.citedBy} />
          </>
        )}
        {box?.kind === "failed" && <p className="desc">{t("rs2_could_not_load_connected")}</p>}
      </div>
    </RsDetails>
  );
}
