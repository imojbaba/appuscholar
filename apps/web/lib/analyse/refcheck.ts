import { apRefCheck, apRefDois } from "@appuscholar/core";
import { getAp, setAp } from "./useApDoc";

/**
 * apRefCheck (11236-11252): nothing while one runs; v1's two boxes when the paper has no reference list or the list prints no DOIs; else the DOIs of the list (core's apRefDois) go to
 * OpenAlex in batches of 40 (core's apRefCheck, Task 4, with the OpenAlex key when the student has one), "Checking n DOIs with OpenAlex… 0 done." while they do (v1 draws the box at the start
 * and the end only), and the result is kept for the panel and the paper card. Not run for an abstract (the panel has no button then). Beyond v1: a result for a paper that is no longer the
 * loaded one is dropped (v1's apLoad clears refBusy and the result would land on the new paper).
 */
export async function runRefCheck(d: { fetch: typeof fetch; oaKey: string | null }): Promise<void> {
  const s = getAp();
  const doc = s.doc;
  if (!doc || s.refBusy) return;
  if (!doc.refsCut) { setAp({ refs: { none: "no reference list" } }); return; }
  const dois = apRefDois(doc);
  if (!dois.length) { setAp({ refs: { none: "no DOIs" } }); return; }
  const gen = s.gen;
  setAp({ refBusy: true, refs: { dois, flag: {}, seen: {}, done: 0 } });
  const refs = await apRefCheck(d.fetch, dois, d.oaKey ?? undefined);
  if (getAp().gen !== gen) return;
  setAp({ refs, refBusy: false });
}
