import { placeHref } from "@/lib/frame/places";
import { STAGE_ORDER } from "@/lib/tools";

/** Links into the project, as a real Panel may (the probe of test/toolLoadOrder.test.ts). */
export function Panel({ tab, projectId }: { tab: string; projectId: string }) {
  return <a href={placeHref(projectId, "collect", tab)}>{STAGE_ORDER.length}</a>;
}
