export const STAGES = [
  { key: "idea", label: "Idea & Feasibility" },
  { key: "lit", label: "Literature Review" },
  { key: "design", label: "Design & Ethics" },
  { key: "collect", label: "Collection & Analysis" },
  { key: "writing", label: "Writing" },
  { key: "review", label: "Review & Publish" }
] as const;
export type ProjectStage = (typeof STAGES)[number]["key"];
export const STAGE_DESCRIPTIONS: Record<ProjectStage, string> = {
  idea: "Shape your question and check what's realistically doable.",
  lit: "Find and work through what's already been studied.",
  design: "Plan your method and prepare consent/ethics paperwork.",
  collect: "Gather data, run statistics, code open-ended answers.",
  writing: "Draft the paper, cite your sources, refine the text.",
  review: "Polish, format, and get ready to submit."
};
export function stageIndex(key: string): number { const i = STAGES.findIndex(s => s.key === key); return i < 0 ? 0 : i; }
export function stageLabel(key: string): string { return STAGES.find(s => s.key === key)?.label ?? "Idea & Feasibility"; }
