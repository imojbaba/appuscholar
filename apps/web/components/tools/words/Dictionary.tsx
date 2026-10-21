"use client";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, Plus, Sparkle, TextAa } from "@phosphor-icons/react";
import { apJson, buildDictPrompt, dictAiClean, type DictAi, type DictEntry } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { lookupWord, normWord } from "@/lib/tools/words/dict";
import type { WordsData } from "@/lib/tools/words/useWordsData";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { WordBank } from "./WordBank";

/** What the Hindi-meaning button came to: the AI's answer, "unsure" (v1's own sentence), or the sentence callAI failed with. */
type AiState = { kind: "ok"; ai: Exclude<DictAi, { err: string }> } | { kind: "unsure" } | { kind: "error"; message: string } | null;

type Props = { data: WordsData; callAI(prompt: string, o: { temp: number; max: number; noLang: boolean }): Promise<string>; field: string };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The dictionary and the word bank (v1 panel 810-823, dictGo 6600-6618, dictRender 6619-6628, dictAI 6629-6644, dictFromSelection 6645-6646). The meaning comes from
 * dictionaryapi.dev straight from the browser (core's dictParse reads it; the cache is 200 words in memory only); the AI adds only the Hindi and an example, labelled.
 * Saving a word goes to the project's `words_bank` blob, asking first when that blob does not open.
 */
export function Dictionary({ data, callAI, field }: Props) {
  const t = useT();
  const docs = useDocAccess();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  /** The look-up the screen is waiting for: an answer to an older one is dropped. */
  const seq = useRef(0);
  const [word, setWord] = useState("");
  /** What the output box says when there is no entry: the wait, no entry, or why the service did not answer. */
  const [msg, setMsg] = useState("");
  /** The line under the box: what was asked for first, and what the bank did. */
  const [status, setStatus] = useState("");
  const [cur, setCur] = useState<DictEntry | null>(null);
  const [ai, setAi] = useState<AiState>(null);
  const [asking, setAsking] = useState(false);

  async function go(raw?: string): Promise<void> {
    const w = normWord(raw ?? word);
    if (!w) { setStatus(t("wd2_type_first")); return; }
    const mine = ++seq.current;
    setWord(w); setStatus(""); setCur(null); setAi(null); setAsking(false);
    setMsg(t("wd2_looking", { w }));
    const r = await lookupWord(w);
    if (!alive.current || mine !== seq.current) return;
    switch (r.kind) {
      case "found": setMsg(""); setCur(r.entry); break;
      case "notfound": setMsg(t("wd2_notfound", { w })); break;
      case "service": setMsg(t("wd2_service", { status: r.status })); break;
      case "offline": setMsg(t("wd2_offline")); break;
    }
  }
  /** v1 dictFromSelection: the first word of what is selected in the document; the whole document is never taken. */
  function fromSelection(): void {
    const first = docs.selection().trim().split(/\s+/)[0] ?? "";
    if (!first) { setStatus(t("wd2_select_first")); return; }
    void go(first);
  }
  /** v1 dictAI: the word alone is sent, through the scanned call. */
  async function hindi(): Promise<void> {
    if (!cur || asking) return;
    const mine = seq.current, w = cur.word;
    setAsking(true);
    let next: AiState;
    try {
      const b = buildDictPrompt(field, w);
      const out = await callAI(b.prompt, { temp: b.temp, max: b.max, noLang: !!b.noLang });
      const r = dictAiClean(w, apJson(out) as { simple?: unknown; hindi?: unknown; example?: unknown } | null);
      next = "err" in r ? { kind: "unsure" } : { kind: "ok", ai: r };
    } catch (e) {
      next = { kind: "error", message: e instanceof Error && e.message ? e.message : t("wd2_ai_failed") };
    }
    if (!alive.current || mine !== seq.current) return;
    setAi(next);
    setAsking(false);
  }
  function save(): void {
    if (!cur) return;
    const entry = cur, hi: DictAi | null = ai?.kind === "ok" ? ai.ai : null;
    data.guard(() => {
      const r = data.addWord(entry, hi, today());
      if (r === "dup") { setStatus(t("wd2_already", { w: entry.word })); return; }
      setStatus(r === "full" ? t("wd2_bank_full") : "");
      toast(t("wd2_saved"));
    });
  }

  return (
    <div className="ap-box" data-testid="words-dictionary" style={{ background: "transparent" }}>
      <b>{t("wd2_dict_title")}</b>
      <div className="ap-row mt-1.5">
        <input type="text" className="input flex-1" maxLength={40} value={word} placeholder={t("wd2_word_ph")} aria-label={t("wd2_word_label")} data-testid="dict-in"
          onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} />
        <Button variant="primary" data-testid="dict-go" onClick={() => void go()}><MagnifyingGlass aria-hidden />{t("wd2_lookup")}</Button>
        <Button variant="ghost" data-testid="dict-selected" onClick={fromSelection}><TextAa aria-hidden />{t("wd2_use_selected")}</Button>
      </div>
      <div className="mt-2 text-[13.5px]" role="status" aria-live="polite" data-testid="dict-out">
        {cur ? <Entry entry={cur} onWord={(w) => void go(w)} /> : msg}
      </div>
      {cur && (
        <div className="mt-2 border-t border-line pt-1.5" data-testid="dict-actions">
          {ai?.kind === "ok" && (
            <div data-testid="dict-ai-out" className="text-[13.5px]">
              <div><b>{t("wd2_ai_simple")}</b> {ai.ai.simple}</div>
              {ai.ai.hindi && <div><b>{t("wd2_ai_hindi")}</b> {ai.ai.hindi}</div>}
              {ai.ai.example && <div><b>{t("wd2_ai_ex")}</b> {ai.ai.example}</div>}
              <div className="text-[11.5px] text-muted-foreground" data-testid="dict-ai-label">{t("wd2_ai_label")}</div>
            </div>
          )}
          {ai?.kind === "unsure" && <div className="ap-warn" data-testid="dict-ai-unsure">{t("wd2_ai_unsure")}</div>}
          {ai?.kind === "error" && <div className="ap-warn" data-testid="dict-ai-error">{ai.message}</div>}
          <div className="ap-row mt-1">
            {(ai === null || ai.kind === "error") && (
              <Button variant="ghost" size="sm" data-testid="dict-ai-btn" disabled={asking} onClick={() => void hindi()}>
                <Sparkle aria-hidden />{asking ? t("wd2_ai_working") : t("wd2_ai_btn")}
              </Button>
            )}
            <Button variant="ghost" size="sm" data-testid="dict-save" disabled={!data.ready} onClick={save}><Plus aria-hidden />{t("wd2_save_word")}</Button>
          </div>
        </div>
      )}
      <p className="desc" role="status" aria-live="polite" style={{ margin: "6px 0 0" }} data-testid="dict-status">{status}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="dict-footer">{t("wd2_dict_footer")}</p>
      <WordBank bank={data.bank} writable={data.ready}
        onOpen={(w) => void go(w)}
        onRemove={(w) => data.guard(() => { data.removeWord(w); setStatus(t("wd2_removed", { w })); })} />
    </div>
  );
}

/** v1 dictRender's entry: the word and its phonetic, each part of speech with its definitions (two at most) and examples, and the similar words as buttons. */
function Entry({ entry, onWord }: { entry: DictEntry; onWord(w: string): void }) {
  const t = useT();
  return (
    <>
      <div className="text-base"><b data-testid="dict-word">{entry.word}</b>{entry.phon && <span className="ml-1 text-muted-foreground">{entry.phon}</span>}</div>
      {entry.meanings.map((m, mi) => (
        <div key={mi} className="mt-1.5">
          <i>{m.pos}</i>
          {m.defs.map((d, i) => (
            <div key={i} className="ml-2">
              {i + 1}. {d.d}
              {d.x && <div className="text-[12.5px] text-muted-foreground">{t("wd2_example")} {d.x}</div>}
            </div>
          ))}
          {m.syn.length > 0 && (
            <div className="ml-2 text-[12.5px]">
              {t("wd2_similar")}{" "}
              {m.syn.map((s, si) => (
                <span key={s}>{si > 0 && ", "}
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[color:var(--accent-ink)] underline" data-testid="dict-similar" onClick={() => onWord(s)}>{s}</button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
