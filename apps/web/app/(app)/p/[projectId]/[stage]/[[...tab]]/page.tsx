import { notFound } from "next/navigation";
import { parsePlace } from "@/lib/frame/places";
import { StagePlace } from "@/components/frame/StagePlace";

type Params = { params: Promise<{ projectId: string; stage: string; tab?: string[] }> };

/** A place: `/p/<id>/<stage>` or `/p/<id>/<stage>/<tab>`; the Reading list also takes a paper, `/p/<id>/lit/reading/<pid>`, which opens the reader. A stage or tab that is not one is not found; Literature with no tab opens Find. */
export default async function PlacePage({ params }: Params) {
  const { stage, tab } = await params;
  const place = parsePlace(stage, tab);
  if (!place) notFound();
  return <StagePlace stage={place.stage} tab={place.tab} paper={place.rest[0]} />;
}
