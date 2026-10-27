"use client";
import { useRef, useState } from "react";
import type { ProviderId } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { checkIdea } from "@/lib/ai/actions";
import { isProvider } from "@/lib/ai/keys";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useKeys } from "@/lib/ai/useKeys";
import type { IdeaIntake } from "@/lib/blobs/kinds";
import { parseIdeaRead } from "@/lib/frame/ideaRead";
import { useStudyField } from "@/lib/frame/studyField";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";

export type IdeaFields = Pick<IdeaIntake, "topic" | "resources" | "timeframe" | "constraints">;
export type IdeaReadValue = NonNullable<IdeaIntake["read"]>;

/**
 * "Get feedback on my idea": v1's Assess feasibility (ideaAssess 8568-8580, buildIdeaPromptV2 unchanged) as a read with its time, or null when nothing was read.
 * With no key for the chosen provider Connect AI opens (first-run build spec, OJ 2026-10-27, step 4); once a key is connected the feedback runs on the idea as it was
 * typed, with no second press. `onSaveWithout` (first run): Connect AI offers "Save my idea without feedback", which runs it. An empty idea gets v1's toast first.
 */
export function useIdeaCheck(onSaveWithout?: () => void): { busy: boolean; check(intake: IdeaFields, onSending?: () => void): Promise<IdeaReadValue | null> } {
  const { settings } = useSettings();
  const studyField = useStudyField();
  const { openConnect } = useProject();
  const { hasKey } = useKeys();
  const callAI = useCallAI();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  /** `onSending`: called just before the idea goes to the AI (never when Connect AI ended without a key, or the idea is empty). */
  const check = async (intake: IdeaFields, onSending?: () => void): Promise<IdeaReadValue | null> => {
    if (running.current) return null;
    let provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
    if (intake.topic.trim() && !hasKey(provider)) {
      running.current = true;
      const end = await openConnect({ provider, offerSave: !!onSaveWithout }).finally(() => { running.current = false; });
      if (end.result === "save") onSaveWithout?.();
      if (end.result !== "connected") return null;
      // The key was saved a moment ago: this request goes to the company it was saved for, whatever the settings have caught up with.
      provider = end.provider;
    }
    running.current = true;
    setBusy(true);
    try {
      const call: typeof callAI = (prompt, opts) => { onSending?.(); return callAI(prompt, { ...opts, provider }); };
      const text = await checkIdea({ callAI: call, toast, field: studyField, intake });
      return text === null ? null : { text, at: new Date().toISOString() };
    } finally { running.current = false; setBusy(false); }
  };
  return { busy, check };
}

/**
 * The read, gold-edged and labelled as AI (Global Constraints, AI output): each rated area with the engine's own rating word, then the verdict; a read with
 * fewer than 3 rated lines is shown as it came. A line whose area is the prompt's placeholder word "Area" has no name (R15). `children`: what follows the read (the actions).
 */
export function IdeaReadPanel({ read, children }: { read: IdeaReadValue; children?: React.ReactNode }) {
  const t = useT();
  const parsed = parseIdeaRead(read.text);
  return (
    <section className="ai-read" data-testid="idea-read" aria-label={t("idea_read_label")}>
      <p className="ai-read-label">{t("idea_read_label")}</p>
      {parsed ? (
        <>
          <ul className="idea-read-lines">
            {parsed.lines.map((l, i) => (
              <li key={i} data-testid="idea-read-line">
                <span>
                  {l.area !== null && <><strong data-testid="idea-read-area">{l.area}</strong><br /></>}
                  <span data-testid="idea-read-why">{l.why}</span>
                </span>
                <span className={"idea-rating " + l.rating.toLowerCase()} data-testid="idea-read-rating">{l.rating}</span>
              </li>
            ))}
          </ul>
          {parsed.verdict && <p className="idea-read-verdict" data-testid="idea-read-verdict">{parsed.verdict}</p>}
        </>
      ) : <p className="idea-read-raw" data-testid="idea-read-raw">{read.text}</p>}
      {children}
    </section>
  );
}
