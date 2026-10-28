import { notFound } from "next/navigation";
import { parsePlace } from "@/lib/frame/places";
import { StagePlace } from "@/components/frame/StagePlace";

type Params = { params: Promise<{ projectId: string; stage: string; tab?: string[] }> };

/** A place: `/p/<id>/<stage>` or `/p/<id>/<stage>/<tab>`. A stage or tab that is not one is not found; Literature with no tab opens Find. */
export default async function PlacePage({ params }: Params) {
  const { stage, tab } = await params;
  const place = parsePlace(stage, tab);
  if (!place) notFound();
  return <StagePlace stage={place.stage} tab={place.tab} />;
}
