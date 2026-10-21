"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import {
  STY_PASSAGES, STY_VOCAB, buildStyleTryPrompt, styleLiveNext, styleLivePassage, styleVocabOrder, styleVocabScore, styleVoiceOffNote,
  type StyleLiveResult
} from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { todayIso } from "@/lib/tools/style/learn";
import { isPasteInput, runLiveCheck } from "@/lib/tools/style/checks";
import type { StyleData } from "@/lib/tools/style/useStyleData";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** The engine's row names (styleLiveCompare, v1 6490) and the keys that show them. */
const ROW_KEYS: Record<string, string> = {
  "average sentence length": "sty2_row_sentence", "average word length": "sty2_row_word",
  "share of long words": "sty2_row_long", "commas per 1,000 words": "sty2_row_commas"
};

type Props = {
  data: StyleData;
  busy: boolean;
  writable: boolean;
  callAI(prompt: string, o: { temp: number; max: number }): Promise<string>;
  onStatus(msg: string): void;
  /** The profile was stored from here (a note added): the panel's unsaved text is dropped. */
  onProfileSaved(): void;
};

/** The three checks of v1's panel, each folded: the typed paraphrase, the ten words, and "Does it sound like me?". */
export function StyleChecks(p: Props) {
  return (
    <>
      <LiveCheck {...p} />
      <VocabCheck {...p} />
      <TryVoice {...p} />
    </>
  );
}

/** Typed paraphrase (v1 6488-6517): pasting and dropping are blocked, 60 words, then core's styleLiveCompare. A rough check, said so. */
function LiveCheck({ data, writable }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState(false);
  const [out, setOut] = useState<{ kind: "msg"; key: string } | { kind: "result"; r: Extract<StyleLiveResult, { ok: true }> } | null>(null);
  const idx = styleLivePassage(data.meta.livePassage);
  const run = () => {
    const o = runLiveCheck(text, pasted, data.samples);
    if (o.kind === "few") { setOut({ kind: "msg", key: "sty2_live_few" }); return; }
    if (o.kind === "pasted") { setOut({ kind: "msg", key: "sty2_live_pasted" }); return; }
    if (o.kind === "no-samples") { setOut({ kind: "msg", key: "sty2_live_nosamples" }); return; }
    setOut({ kind: "result", r: o.result });
    data.guard(["meta"], () => data.patchMeta({ live: { date: todayIso(), matched: o.result.matched, total: o.result.total } }));
  };
  const num = (name: string, v: number) => v.toFixed(name.includes("share") ? 3 : 1);
  return (
    <details className="mt-3" data-testid="style-live">
      <summary className="cursor-pointer font-semibold">{t("sty2_live_title")}</summary>
      <p className="desc" style={{ margin: "6px 0" }}>{t("sty2_live_desc")}</p>
      <div className="ap-box" data-testid="style-passage" aria-label={t("sty2_live_passage")}>{t("sty2_passage_" + idx)}</div>
      <Button variant="ghost" size="xs" data-testid="style-another" disabled={!writable}
        onClick={() => data.guard(["meta"], () => data.patchMeta({ livePassage: styleLiveNext(data.meta.livePassage) }))}>{t("sty2_live_another")}</Button>
      <label className="sr-only" htmlFor="styLiveText">{t("sty2_live_label")}</label>
      <textarea id="styLiveText" className="input mt-1.5" rows={5} value={text} placeholder={t("sty2_live_ph")} data-testid="style-live-text"
        onPaste={(e) => { e.preventDefault(); setPasted(true); }}
        onDrop={(e) => { e.preventDefault(); setPasted(true); }}
        onInput={(e) => { if (isPasteInput((e.nativeEvent as InputEvent).inputType)) setPasted(true); }}
        onChange={(e) => { setText(e.target.value); if (e.target.value === "") setPasted(false); }} />
      <div className="ap-row"><Button variant="primary" data-testid="style-live-run" disabled={!writable} onClick={run}>{t("sty2_live_btn")}</Button></div>
      <div className="mt-1.5 text-[12.5px]" role="status" aria-live="polite" data-testid="style-live-out">
        {out?.kind === "msg" && <p>{t(out.key)}</p>}
        {out?.kind === "result" && (
          <>
            <p className={out.r.verdict === "differs" ? "text-flag-ink" : ""} data-testid="style-live-head">
              {out.r.verdict === "consistent" ? t("sty2_live_ok", { k: out.r.matched }) : out.r.verdict === "partly" ? t("sty2_live_partly") : t("sty2_live_differs", { k: 4 - out.r.matched })}
            </p>
            <ul className="m-0 list-none p-0">
              {out.r.rows.map((x) => (
                <li key={x.name} data-testid="style-live-row">
                  {x.ok ? <CheckCircle aria-label={t("sty2_live_fits")} className="inline size-3.5" /> : <WarningCircle aria-label={t("sty2_live_outside")} className="inline size-3.5 text-flag-ink" />}{" "}
                  {t("sty2_live_row", { name: t(ROW_KEYS[x.name] ?? x.name), mine: num(x.name, x.mine), lo: num(x.name, x.lo), hi: num(x.name, x.hi) })}
                </li>
              ))}
            </ul>
            <p>{t("sty2_live_foot")}</p>
          </>
        )}
      </div>
    </details>
  );
}

/** Ten words (v1 6518-6535): the answers in v1's fixed order, "I do not know" chosen to begin with; the score is core's, the level stored with its day. */
function VocabCheck({ data, writable }: Props) {
  const t = useT();
  const [answers, setAnswers] = useState<number[]>(() => STY_VOCAB.map(() => -1));
  const [result, setResult] = useState("");
  const band = (k: string) => t("sty2_band_" + k);
  const level = data.level;
  const score = () => {
    const r = styleVocabScore(answers);
    data.guard(["meta"], () => data.patchMeta({ vocab_level: { score: r.score, k: r.k, date: todayIso() } }));
    setResult(t("sty2_vocab_result", { k: r.score, label: band(r.k) }));
  };
  return (
    <details className="mt-2" data-testid="style-vocab">
      <summary className="cursor-pointer font-semibold">{t("sty2_vocab_title")}</summary>
      <p className="desc" style={{ margin: "6px 0" }}>{t("sty2_vocab_desc")}</p>
      {STY_VOCAB.map((q, i) => (
        <fieldset key={q.w} className="mb-2 border-0 p-0" data-testid="style-vocab-q">
          <legend className="font-bold">{i + 1}. {t("sty2_vw" + i)}</legend>
          {styleVocabOrder(i).map((j) => (
            <label key={j} className="block text-[13px]">
              <input type="radio" name={"sv" + i} value={j} checked={answers[i] === j} data-testid={`style-vocab-${i}-${j}`}
                onChange={() => setAnswers((a) => a.map((v, k) => (k === i ? j : v)))} /> {t(`sty2_vo${i}_${j}`)}
            </label>
          ))}
          <label className="block text-[13px]">
            <input type="radio" name={"sv" + i} value={-1} checked={answers[i] === -1} data-testid={`style-vocab-${i}-dk`}
              onChange={() => setAnswers((a) => a.map((v, k) => (k === i ? -1 : v)))} /> {t("sty2_vocab_dk")}
          </label>
        </fieldset>
      ))}
      <Button variant="primary" data-testid="style-vocab-btn" disabled={!writable} onClick={score}>{t("sty2_vocab_btn")}</Button>
      <p className="mt-1.5 text-[12.5px]" role="status" aria-live="polite" data-testid="style-vocab-out">{result}</p>
      <p className="desc" style={{ marginTop: 4 }} data-testid="style-vocab-state">
        {level ? t("sty2_vocab_state", { label: band(level.k), score: level.score, date: level.date }) : t("sty2_vocab_none")}
      </p>
    </details>
  );
}

/** "Does it sound like me?" (v1 6536-6555): the practice passage written by the AI in the stored profile's voice, shown labelled as the AI's and never put in the document. */
function TryVoice({ data, busy, writable, callAI, onStatus, onProfileSaved }: Props) {
  const t = useT();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [out, setOut] = useState("");
  const [working, setWorking] = useState(false);
  const [asked, setAsked] = useState(false);
  const [off, setOff] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const idx = styleLivePassage(data.meta.livePassage);
  const noProfile = !data.profile;
  const show = async () => {
    if (noProfile) { setMsg(t("sty2_try_need")); return; }
    setMsg(""); setWorking(true);
    try {
      const b = buildStyleTryPrompt(data.profile, data.on, data.level, STY_PASSAGES[idx]!);
      const r = await callAI(b.prompt, { temp: b.temp, max: b.max });
      if (!alive.current) return;
      setOut(String(r || "").trim());
      setAsked(true);
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "");
    } finally { setWorking(false); }
  };
  const feedback = (ok: boolean) => {
    data.guard(["meta"], () => data.patchMeta({ fb: ok ? "ok" : "off" }));
    setOff(!ok);
    if (ok) setMsg(t("sty2_try_thanks"));
  };
  const addNote = () => {
    const next = styleVoiceOffNote(data.profile, note);
    if (next === null) return;
    data.guard(["profile"], () => { data.saveProfile(next); onProfileSaved(); setNote(""); onStatus(t("sty2_try_added")); toast(t("sty2_saved")); });
  };
  return (
    <details className="mt-2" data-testid="style-try">
      <summary className="cursor-pointer font-semibold">{t("sty2_try_title")}</summary>
      <p className="desc" style={{ margin: "6px 0" }}>{t("sty2_try_desc")}</p>
      {!data.on && !noProfile && <p className="desc" data-testid="style-try-off">{t("sty2_try_off")}</p>}
      <Button variant="ghost" data-testid="style-try-btn" disabled={!writable || busy || working || (!data.on && !noProfile)} onClick={() => void show()}>
        {working ? t("sty2_try_writing") : t("sty2_try_btn")}
      </Button>
      {msg && <p className="mt-1.5 text-[12.5px]" role="status" data-testid="style-try-msg">{msg}</p>}
      {out && (
        <section className="ai-read mt-2" data-testid="style-try-out">
          <p className="ai-read-label">{t("sty2_try_label")}</p>
          <p className="whitespace-pre-wrap text-[13px]">{out}</p>
        </section>
      )}
      {asked && (
        <div className="mt-1.5">
          <div className="ap-row">
            <Button variant="ghost" size="sm" data-testid="style-try-yes" disabled={!writable} onClick={() => feedback(true)}>{t("sty2_try_yes")}</Button>
            <Button variant="ghost" size="sm" data-testid="style-try-no" disabled={!writable} onClick={() => feedback(false)}>{t("sty2_try_no")}</Button>
          </div>
          {off && (
            <div className="ap-row" data-testid="style-try-note">
              <input type="text" className="input" maxLength={200} value={note} placeholder={t("sty2_try_ph")} aria-label={t("sty2_try_ph")}
                data-testid="style-try-note-in" onChange={(e) => setNote(e.target.value)} />
              <Button variant="ghost" size="sm" data-testid="style-try-add" disabled={!writable} onClick={addNote}>{t("sty2_try_add")}</Button>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
