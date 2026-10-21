"use client";
import type { ComponentType } from "react";
import { NotBuilt } from "@/components/places/NotBuilt";
import { Budget } from "./Budget";
import { Ethics } from "./Ethics";
import { Investigator } from "./Investigator";
import { Overview } from "./Overview";
import { Pathway } from "./Pathway";
import { Protocol } from "./Protocol";
import { Registration } from "./Registration";

type Page = ComponentType<{ projectId: string }>;

/** The tabs built so far, by id: a later task adds one line for its tab. A tab not listed is not built yet. */
const PAGES: Record<string, Page> = {
  overview: Overview,
  pathway: Pathway,
  protocol: Protocol,
  ethics: Ethics,
  registration: Registration,
  investigator: Investigator,
  budget: Budget
};

/** The Design and ethics place's tab (StagedPlace draws it for each of the module's eight tabs). */
export function Panel({ tab, projectId }: { tab: string; projectId: string }) {
  const Page = Object.hasOwn(PAGES, tab) ? PAGES[tab] : undefined;
  return Page ? <Page projectId={projectId} /> : <NotBuilt />;
}
