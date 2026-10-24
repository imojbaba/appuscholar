"use client";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { ProviderId } from "@appuscholar/core";
import { useGuideApi } from "@/components/help/guide/GuideDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCallError } from "@/lib/ai/callAI";
import { isProvider, keyStore } from "@/lib/ai/keys";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useKeysIfProvided } from "@/lib/ai/useKeys";
import { appuPrompt, appuRank, appuTool } from "@/lib/help/guide/appu";
import type { GuideSection } from "@/lib/help/guide/types";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

/** What the answer box holds: one of v1's cases (`appuAsk`). The links are the sections the question matched. */
type Out =
  | { kind: "busy" }
  | { kind: "none" }
  | { kind: "nokey"; hits: GuideSection[] }
  | { kind: "answer"; text: string; hits: GuideSection[] }
  | { kind: "error"; message: string; hits: GuideSection[] };

/** A line whose `{links}` is the section links: the message is split there, so a translation keeps its own word order. */
function withLinks(message: string, links: ReactNode): ReactNode {
  const i = message.indexOf("{links}");
  return i < 0 ? <>{message} {links}</> : <>{message.slice(0, i)}{links}{message.slice(i + "{links}".length)}</>;
}

/**
 * Ask Appu (Task C3; v1 `appuAsk`, `appuShow`, build 2026.10.24a): a question box in the Guide. The question is matched to the guide's sections
 * (stemmed words, titles, keywords, text), and the best three are all the AI may answer from. With no section matching, or no AI key, nothing
 * is sent. The answer is drawn as text, never as HTML. Its links open a section in the Guide. Only the question and those sections are sent,
 * through the same call every AI button makes (so the personal-data check runs first); Appu's calls are left out of the AI-use log.
 */
export function AskAppu() {
  const t = useT();
  const id = useId();
  const guide = useGuideApi();
  const callAI = useCallAI();
  const { settings } = useSettings();
  const keys = useKeysIfProvided();
  const tool = appuTool(usePathname());
  const [question, setQuestion] = useState("");
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || running.current) return;
    const hits = appuRank(q, guide.sections);
    if (!hits.length) { setOut({ kind: "none" }); return; }
    // A key usable now, or saved (v2 may hold it locked in the account: the call asks for the passphrase then).
    const provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
    if (!(keys ? keys.hasKey(provider) : !!keyStore.getUnlocked(provider))) {
      guide.showOnly(hits.map((s) => s.id));
      setOut({ kind: "nokey", hits });
      return;
    }
    running.current = true;
    setBusy(true);
    setOut({ kind: "busy" });
    try {
      const answer = await callAI(appuPrompt(q, hits, tool), { temp: 0.2, max: 700, noLang: true });
      setOut({ kind: "answer", text: String(answer ?? "").trim(), hits });
    } catch (e) {
      setOut({ kind: "error", message: toCallError(e).message || t("wc_appu_failed"), hits });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const links = (hits: GuideSection[]): ReactNode => hits.map((s, i) => (
    <Fragment key={s.id}>
      {i > 0 && ", "}
      <button type="button" className="inline cursor-pointer bg-transparent p-0 text-left font-medium text-purple-800 underline underline-offset-2 hover:text-purple-600" data-testid={"appu-link-" + s.id} onClick={() => guide.setQuery(s.title, s.id)}>{s.title}</button>
    </Fragment>
  ));

  return (
    <div className="rounded-lg border border-line p-3" data-testid="appu-box">
      <label htmlFor={id} className="text-[13.5px] font-bold">{t("wc_appu_label")}</label>
      <div className="mt-1 flex gap-2">
        <Input
          id={id} type="text" className="flex-1" data-testid="appu-q" value={question} placeholder={t("wc_appu_ph")}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void ask(); }}
        />
        <Button variant="primary" disabled={busy} data-testid="appu-go" onClick={() => { void ask(); }}>{t("wc_appu_go")}</Button>
      </div>
      <p className="mb-0 mt-1.5 text-[12.5px] text-muted-foreground" data-testid="appu-note">{t("wc_appu_note")}</p>
      <div aria-live="polite">
        {/* A long answer scrolls inside its own box, so it cannot push the Guide's list out of the dialog. On a phone the dialog is a 90dvh column
            with the search above and the list below, so the box is kept to about five lines there. */}
        {out && (
          <div className="mt-2 max-h-[15dvh] overflow-y-auto text-[13.5px] leading-relaxed sm:max-h-[40dvh]" data-testid="appu-answer">
            {out.kind === "busy" && t("wc_appu_busy")}
            {out.kind === "none" && t("wc_appu_none")}
            {out.kind === "nokey" && withLinks(t("wc_appu_nokey"), links(out.hits))}
            {out.kind === "error" && withLinks(t("wc_appu_error", { message: out.message }), links(out.hits))}
            {out.kind === "answer" && (
              <>
                <div className="whitespace-pre-wrap" data-testid="appu-text">{out.text}</div>
                <div className="mt-1.5 text-[12.5px] text-muted-foreground" data-testid="appu-from">{withLinks(t("wc_appu_from"), links(out.hits))}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
