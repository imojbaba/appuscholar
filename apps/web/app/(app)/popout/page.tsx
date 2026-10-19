import type { Metadata } from "next";
import { Popout } from "@/components/popout/Popout";

type Params = { searchParams: Promise<{ tool?: string | string[] }> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** v1 13695: `document.title='Appuscholar · '+(POPOUT==='cite'?'Citations':'Research')` (literals). */
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const tool = one((await searchParams).tool);
  return tool === "cite" || tool === "research" ? { title: "Appuscholar · " + (tool === "cite" ? "Citations" : "Research") } : {};
}

/** A pop-out window: /popout?tool=cite or /popout?tool=research (v1 `#popout=<tool>`), opened by the Dock's "⧉ Pop out". */
export default async function PopoutPage({ searchParams }: Params) {
  return <Popout tool={one((await searchParams).tool)} />;
}
