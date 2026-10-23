"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ListChecks, Sparkle } from "@phosphor-icons/react";
import { gramSpellSet, gramTop, type GramItem, type GramKind } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { checkWithAi, checkWithRules, type GramOutcome } from "@/lib/tools/words/gram";
import type { WordsData } from "@/lib/tools/words/useWordsData";
import { Button } from "@/components/ui/button";

type Props = { data: WordsData; callAI(prompt: string, o: { temp: number; max: number; noLang: boolean }): Promise<string>; field: string };
/** The AI line's counts (v1 GRAM.checked, parts, dropped); parts is 0 until the AI has been asked. */
type Counts = { checked: number; parts: number; dropped: number };

const KIND: Record<GramKind, string> = { error: "wd2_kind_error", style: "wd2_kind_style", regional: "wd2_kind_regional" };

/**
 * The grammar check (v1 panel 825-836, gramRunLocal 6717, gramRunAI 6751, gramRender 6787-6797, gramApply 6803-6808). Layer one is core's rule list; layer two asks the AI for a list
 * of edits, and an edit is shown only if its original words are in the text and its fix keeps every number, citation and quotation. Nothing changes in the document unless
 * the student presses Apply, which replaces the first occurrence of the verified original through docAccess (one undoable step: Ctrl+Z undoes it).
 */
export function Grammar({ data, callAI, field }: Props) {
  const t = useT();
  const docs = useDocAccess();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [items, setItems] = useState<GramItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ checked: 0, parts: 0, dropped: 0 });
  /** A check has been run (v1 GRAM.text): the empty box then says nothing was found, not how to start. */
  const [ran, setRan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  /** The selection, or the whole document when nothing is selected (the contract: selection() is never the whole document). Reads never open the document. */
  const target = () => docs.selection() || docs.text();
  function show(out: Exclude<GramOutcome, "short">): void {
    setItems(out.items);
    setCounts({ checked: out.checked, parts: out.parts, dropped: out.dropped });
    setRan(true);
    data.countPatterns(out.items);
  }
  function rules(): void {
    const text = target();
    const out = checkWithRules(text, data.spell);
    if (out === "short") { setStatus(t("wd2_write_first")); return; }
    setStatus("");
    show(out);
  }
  async function withAi(): Promise<void> {
    if (busy) return;
    const text = target();
    if (text.trim().length < 30) { setStatus(t("wd2_write_para")); return; }
    setBusy(true); setStatus(""); setRan(true);
    const out = await checkWithAi(text, { callAI, field, std: data.spell, alive: () => alive.current });
    if (!alive.current || out === null) return;
    setBusy(false);
    if (out === "short") { setStatus(t("wd2_write_para")); return; }
    show(out);
    setStatus(out.error === null ? "" : out.error || t("wd2_ai_failed"));
  }
  /**
   * v1 gramApply: the verified original is replaced, and the card goes. A rule's fix is the student's own text edit; an AI card's fix goes in
   * marked as AI text (rule 7), where v1 put it in as plain text (D-S2-93, OJ 23 Oct).
   */
  const applying = useRef(false);
  async function apply(it: GramItem): Promise<void> {
    if (it.fix == null || applying.current) return;
    applying.current = true;
    try {
      const ok = await docs.replaceInDocument(it.original, it.fix, it.src === "ai" ? { ai: true } : undefined);
      if (!alive.current) return;
      if (ok) { setItems((cur) => cur.filter((x) => x !== it)); setStatus(t("wd2_applied")); } else setStatus(t("wd2_apply_gone"));
    } finally { applying.current = false; }
  }

  const top = gramTop(data.stats);
  const line = counts.parts > 0
    ? (counts.parts === 1 ? t("wd2_ai_sum_one", { checked: counts.checked }) : t("wd2_ai_sum_n", { checked: counts.checked, parts: counts.parts }))
      + (counts.dropped === 0 ? "" : counts.dropped === 1 ? t("wd2_ai_drop_one") : t("wd2_ai_drop_n", { n: counts.dropped })) + t("wd2_ai_tail")
    : "";

  return (
    <div className="ap-box" data-testid="words-grammar" style={{ background: "transparent" }}>
      <b>{t("wd2_gram_title")}</b>
      <p className="desc" style={{ margin: "4px 0" }}>{t("wd2_gram_desc")}</p>
      <label htmlFor="wdSpell" className="text-[13px]">{t("wd2_spell_label")}</label>
      <select id="wdSpell" className="input" value={data.spell} disabled={!data.ready} data-testid="gram-spell" onChange={(e) => data.setSpell(gramSpellSet(e.target.value))}>
        <option value="uk">{t("wd2_spell_uk")}</option>
        <option value="us">{t("wd2_spell_us")}</option>
        <option value="off">{t("wd2_spell_off")}</option>
      </select>
      <div className="ap-row mt-1.5">
        <Button variant="primary" data-testid="gram-rules" disabled={busy} onClick={rules}><ListChecks aria-hidden />{t("wd2_check_rules")}</Button>
        <Button variant="ghost" data-testid="gram-ai" disabled={busy} onClick={() => void withAi()}><Sparkle aria-hidden />{t("wd2_check_ai")}</Button>
      </div>
      <p className="desc" style={{ margin: "6px 0 0" }} data-testid="gram-top">{top.length ? t("wd2_top", { list: top.map((x) => `${x[0]} (${x[1]})`).join(", ") }) : ""}</p>
      <p className="desc" role="status" aria-live="polite" style={{ margin: "6px 0 0" }} data-testid="gram-status">{status}</p>
      <div className="mt-1.5" data-testid="gram-out">
        {busy && <div className="ap-box" data-testid="gram-busy">{t("wd2_checking")}</div>}
        {line && <div className="my-1 text-xs text-muted-foreground" data-testid="gram-ai-line">{line}</div>}
        {!items.length && !busy && <div className="ap-box" data-testid="gram-empty">{ran ? (counts.parts ? t("wd2_nothing_ai") : t("wd2_nothing_rules")) : t("wd2_start")}</div>}
        {items.map((x, i) => (
          <div key={`${x.start}-${x.original}-${i}`} className="ap-box" data-testid="gram-card" style={x.src === "ai" ? { borderColor: "var(--gold)" } : undefined}>
            <span className={"rounded-lg px-1.5 py-px text-[11px] " + (x.kind === "error" ? "bg-flag-bg text-flag-ink" : "bg-accent text-accent-foreground")}>{t(KIND[x.kind])}</span>{" "}
            <b>{x.rule}</b>
            {x.src === "ai" && <p className="ai-read-label" data-testid="gram-card-ai">{t("wd2_card_ai")}</p>}
            <br />
            <s className="text-flag-ink">{x.original}</s>
            {x.fix != null && <> → <b className="ap-ok">{x.fix}</b></>}
            <div className="mt-0.5 text-[12.5px]">{x.why}</div>
            {x.ex && <div className="text-xs text-muted-foreground">{t("wd2_before_after", { a: x.ex[0], b: x.ex[1] })}</div>}
            <div className="ap-row mt-1">
              {x.fix != null && <Button variant="primary" size="xs" data-testid="gram-apply" onClick={() => void apply(x)}><Check aria-hidden />{t("wd2_apply")}</Button>}
              <Button variant="ghost" size="xs" data-testid="gram-ignore" onClick={() => setItems((cur) => cur.filter((y) => y !== x))}>{t("wd2_ignore")}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
