/** One rated area of the idea read. `area` is null when the engine wrote the prompt's placeholder word "Area" for the name (R15): the line is shown without a name. */
export type IdeaReadLine = { area: string | null; rating: "Low" | "Medium" | "High"; why: string };
export type IdeaRead = { lines: IdeaReadLine[]; verdict: string | null };

const LINE = /^([^:]{3,60}):\s*(Low|Medium|High)\.\s*(.*)$/;
const VERDICT = /^Verdict:\s*(.+)$/;

/**
 * The feasibility read (buildIdeaPromptV2's reply) as rated areas and a verdict, or null when fewer than 3 lines are rated (the text is then shown as it came).
 * The rating is the engine's own word; the verdict is the first "Verdict:" line.
 */
export function parseIdeaRead(text: string): IdeaRead | null {
  const lines: IdeaReadLine[] = [];
  let verdict: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const v = VERDICT.exec(line);
    if (v) { verdict ??= v[1]!.trim(); continue; }
    const m = LINE.exec(line);
    if (!m) continue;
    const area = m[1]!.trim();
    lines.push({ area: area === "Area" ? null : area, rating: m[2] as IdeaReadLine["rating"], why: m[3]!.trim() });
  }
  return lines.length < 3 ? null : { lines, verdict };
}

/** A project name from the idea (first run's title field): its first 60 characters, cut at the last word that fits; one longer word is cut at 60. */
export function ideaTitle(topic: string, max = 60): string {
  const s = topic.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).lastIndexOf(" ");
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, max)).trim();
}
