"use client";
import { useId, useMemo, type ReactNode } from "react";
import { Warning } from "@phosphor-icons/react";
import type { PdFound } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { dmy, todayIso } from "@/lib/tools/participants/dates";
import { setChoice, setListChoice, useLab, type PdResult } from "@/lib/tools/stats/lab";
import { choiceKey, freshCodesBlocked, listNotUsed, v1Choice, viewOf, type ColAction, type ColView, type NotUsed } from "@/lib/tools/stats/pdList";
import type { LabActions } from "@/lib/tools/stats/useLabActions";
import { Button } from "@/components/ui/button";

type T = ReturnType<typeof useT>;

/** v1's sentence after Apply (pdApply 9498-9504), from the counts: "Done." with the columns removed, the columns coded and the key file; with the list also the rows removed, the people added with their codes. */
function resultText(t: T, r: PdResult): string {
  if ("failed" in r) {
    switch (r.failed) {
      case "list": return t("stats_pd_not_added");
      case "words": return t("stats_pd_not_words");
      case "unsaved": return t("stats_pd_not_saved");
      case "changed": return t(r.added ? "stats_pd_changed_added" : "stats_pd_changed");
      case "table": return t(r.added ? "stats_pd_table_added" : "stats_pd_table");
    }
  }
  if ("unchanged" in r) return t("stats_pd_unchanged");
  const l = r.list;
  return [
    t("stats_pd_done"), r.removed ? t("stats_pd_removed", { n: r.removed }) : "", r.coded ? t("stats_pd_coded", { n: r.coded }) : "",
    l?.rows ? t("stats_pd_rows_removed", { n: l.rows }) : "", l?.added.length ? t("stats_pd_added", { names: l.added.map((a) => `${a.name} (${a.code})`).join(", ") }) : "",
    l?.answers ? t("stats_pd_cells") : "", r.keyed ? t("stats_pd_keyed") : ""
  ].filter(Boolean).join(" ");
}

/** A cell's text for a line of the box: the first 40 characters. */
const clip = (v: string): string => (v.length <= 40 ? v : v.slice(0, 40).trimEnd() + "…");

/** At most `max` of the names, then "and N more". */
function shortList(t: T, names: string[], max: number): string {
  return names.length <= max ? names.join(", ") : names.slice(0, max).join(", ") + " " + t("stats_pd_more", { n: names.length - max });
}

function Pick({ id, label, by, value, options, off, onChange }: { id: string; label?: string; by?: string; value: string; options: Array<[string, string]>; off?: string; onChange: (v: string) => void }) {
  return (
    <select className="input" style={{ width: "auto", minWidth: 150 }} data-testid={id} aria-label={label} aria-labelledby={by} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => <option key={v} value={v} disabled={v === off}>{text}</option>)}
    </select>
  );
}

/** A row of the box: what was found on the left, the choice on the right; the choice is named by what was found (`pick` is given the id of its words). */
function Line({ id, children, pick }: { id?: string; children: ReactNode; pick?: (by: string) => ReactNode }) {
  const words = useId();
  return (
    <div className="ap-row ap-wrap" style={{ justifyContent: "space-between" }} data-testid={id}>
      <span id={words} style={{ flex: 1, minWidth: 180 }}>{children}</span>
      {pick?.(words)}
    </div>
  );
}

const actionText = (t: T, a: ColAction, fromList: boolean): string => {
  switch (a) {
    case "": return t("stats_pd_choose");
    case "remove": return t("stats_pd_remove");
    case "code": return t(fromList ? "stats_pd_code_list" : "stats_pd_code");
    case "keep": return t("stats_pd_keep");
    case "notnames": return t("stats_pd_notnames");
  }
};

/** v1's rows for a flagged column: what the scan thinks the column is, with its select. A column only the values call names starts at Choose… and has Not names; an anonymous plan starts names at Remove. */
function V1Row({ projectId, f, value, anonymous, why }: { projectId: string; f: PdFound; value: ColAction; anonymous: boolean; why: NotUsed | null }) {
  const t = useT();
  const guess = f.kind === "name" && f.why === "values";
  // The list is being read: Replace with a code waits for the answer (greyed). The list is locked and the project has one: it is not offered at all (R51).
  const blocked = freshCodesBlocked(f.kind, why);
  const all: ColAction[] = guess ? ["", "remove", "code", "keep", "notnames"] : ["remove", "code", "keep"];
  const options = blocked && why === "locked" ? all.filter((a) => a !== "code") : all;
  return (
    <div data-testid={`pd-col-${f.index}`}>
      <Line pick={() => <Pick id={"pd-sel-" + f.index} label={t("stats_pd_select_aria", { name: f.name })} value={value} off={blocked ? "code" : undefined} options={options.map((a) => [a, actionText(t, a, false)])} onChange={(v) => setChoice(projectId, f.index, v as ColAction)} />}>
        <b>{f.name}</b> {t(guess ? "stats_pd_label_name_values" : "stats_pd_label_" + f.kind)}
      </Line>
      {anonymous && f.kind === "name" && <p className="ap-small" style={{ margin: "2px 0 6px 14px" }} data-testid={`pd-anon-${f.index}`}>{t("stats_pd_anonymous")}</p>}
    </div>
  );
}

/** One column against the list: its select, and under it each thing the list found in it, with the choice that thing starts at. */
function ListColumn({ projectId, c }: { projectId: string; c: ColView }) {
  const t = useT();
  const i = c.index;
  const aria = t("stats_pd_select_aria", { name: c.name });
  const onList = c.codes.length === 1 ? t("stats_pd_on_list_one", { codes: c.codes.join(" ") }) : t("stats_pd_on_list_many", { n: c.codes.length, codes: c.codes.join(" ") });
  const withdrawnRows = c.withdrawn.reduce((n, w) => n + w.rows, 0);
  // A heading that says names, or a roll heading, is the column's name for itself; a guess from the values says it is only a guess.
  const guess = c.role === "name" && c.found?.why === "values";
  const onListNode = c.codes.length ? <>: <span data-testid={`pd-list-${i}`}>{onList}</span></> : null;
  let label: ReactNode = onListNode;
  if (guess) label = <> {t("stats_pd_label_name_values")}{onListNode}</>;
  else if (!c.codes.length && c.role === "name") label = <> {t("stats_pd_label_name")}</>;
  else if (c.role === "roll") label = <> {t("stats_pd_label_roll")}</>;
  const maybeOptions = (g: ColView["maybe"][number]): Array<[string, string]> => g.suggest
    ? [["", t("stats_pd_choose")], ["name", t("stats_pd_maybe_name")], ...(c.noAdd ? [] : [["add", t("stats_pd_maybe_add")] as [string, string]]), ["keep", t("stats_pd_maybe_notname")]]
    : [["", t("stats_pd_choose")], ...g.people.map((p): [string, string] => [p.id, t("stats_pd_maybe_code", { code: p.code })]), ["keep", t("stats_pd_maybe_keep")]];
  return (
    <div data-testid={`pd-col-${i}`} style={{ marginBottom: 6 }}>
      <Line pick={c.options.length ? () => <Pick id={"pd-sel-" + i} label={aria} value={c.action} options={c.options.map((a) => [a, actionText(t, a, true)])} onChange={(v) => setListChoice(projectId, "action", i, v as ColAction)} /> : undefined}>
        <b>{c.name}</b>{label}
      </Line>
      <div style={{ marginLeft: 14 }}>
        {c.anonymous && <p className="ap-small" style={{ margin: "2px 0 6px" }} data-testid={`pd-anon-${i}`}>{t("stats_pd_anonymous")}</p>}
        {c.role === "roll" && (
          <p className="ap-small" style={{ margin: "2px 0 6px" }} data-testid={`pd-roll-${i}`}>
            {c.rollState === "all" ? t("stats_pd_roll_all", { codes: c.rollCodes.join(" ") }) : t(c.rollState === "some" ? "stats_pd_roll_some" : "stats_pd_roll_none")}
          </p>
        )}
        {c.unlisted.length > 0 && (
          <Line id={`pd-unlisted-${i}`} pick={c.action === "code" && !c.noAdd ? (by) => (
            <Pick id={`pd-unlisted-sel-${i}`} by={by} value={c.unlistedChoice}
              options={[["add", t("stats_pd_unlisted_add")], ["keep", t("stats_pd_unlisted_keep")], ["remove", t("stats_pd_unlisted_remove")]]}
              onChange={(v) => setListChoice(projectId, "unlisted", i, v as "add" | "keep" | "remove")} />
          ) : undefined}>
            {c.unlisted.length === 1 ? t("stats_pd_unlisted_one", { names: c.unlisted[0]! }) : t("stats_pd_unlisted_many", { n: c.unlisted.length, names: shortList(t, c.unlisted, 8) })}
          </Line>
        )}
        {c.leftover.cells > 0 && c.action !== "remove" && (
          <Line id={`pd-leftover-${i}`} pick={(by) =>
            <Pick id={`pd-leftover-sel-${i}`} by={by} value={c.leftover.choice}
              options={[["remove", t("stats_pd_leftover_remove")], ["keep", t("stats_pd_leftover_keep")]]}
              onChange={(v) => setListChoice(projectId, "leftover", i, v as "remove" | "keep")} />
          }>
            {t(c.leftover.cells === 1 ? "stats_pd_leftover_one" : "stats_pd_leftover_many", { n: c.leftover.cells, names: shortList(t, c.leftover.values.map(clip), 3) })}
          </Line>
        )}
        {c.multi.length > 0 && (
          <div data-testid={`pd-multi-${i}`}>
            {c.multi.map((m, k) => (
              <Line key={m.key} pick={(by) =>
                <Pick id={`pd-multi-sel-${i}-${k}`} by={by} value={m.choice}
                  options={[["keep", t("stats_pd_multi_keep")], ...(c.inText === "codes" ? [["codes", t("stats_pd_multi_codes")] as [string, string]] : []), ["remove", t("stats_pd_multi_remove")]]}
                  onChange={(v) => setListChoice(projectId, "multi", choiceKey(i, m.key), v as "keep" | "codes" | "remove")} />
              }>
                {t("stats_pd_multi", { value: m.value, codes: m.codes.join(" ") })}
              </Line>
            ))}
          </div>
        )}
        {c.wide.length > 0 && c.action === "code" && (
          <p className="ap-small" style={{ margin: "2px 0 6px" }} data-testid={`pd-wide-${i}`}>
            {c.wide.length === 1 ? t("stats_pd_wide_one", { examples: c.wide[0]! }) : t("stats_pd_wide_many", { n: c.wide.length, examples: shortList(t, c.wide, 3) })}
          </p>
        )}
        {c.shared.length > 0 && c.action === "code" && (
          <p className="ap-small" style={{ margin: "2px 0 6px" }} data-testid={`pd-shared-${i}`}>
            {c.shared.length === 1 && c.shared[0]!.cells === 1
              ? t("stats_pd_shared_one", { value: c.shared[0]!.value, codes: c.shared[0]!.codes.join(" ") })
              : t("stats_pd_shared_many", { n: c.shared.reduce((n, x) => n + x.cells, 0), examples: shortList(t, c.shared.map((x) => `“${x.value}” (${x.codes.join(" ")})`), 3) })}
          </p>
        )}
        {c.withdrawn.length > 0 && (
          <Line id={`pd-withdrawn-${i}`} pick={(by) =>
            <Pick id={`pd-withdrawn-sel-${i}`} by={by} value={c.drop ? "remove" : "keep"}
              options={[["remove", t("stats_pd_withdrawn_remove", { n: withdrawnRows })], ["keep", t("stats_pd_withdrawn_keep")]]}
              onChange={(v) => setListChoice(projectId, "drop", i, v === "remove")} />
          }>
            {c.withdrawn.map((w) => <span key={w.id} style={{ display: "block" }}>{t("stats_pd_withdrawn", { name: w.name, date: dmy(w.on) })}</span>)}
          </Line>
        )}
        {c.keepNotes.length > 0 && (
          <div className="ap-small" style={{ margin: "2px 0 6px" }} data-testid={`pd-withdrawn-keep-${i}`}>
            {c.keepNotes.map((k) => <p key={k.id} style={{ margin: 0 }}>{t("stats_pd_withdrawn_note", { name: k.name, date: dmy(k.on) })}</p>)}
          </div>
        )}
        {c.ask.map((a) => (
          <Line key={a.row} id={`pd-ask-${i}-${a.row}`} pick={(by) =>
            <Pick id={`pd-ask-sel-${i}-${a.row}`} by={by} value={a.choice}
              options={[["keep", t("stats_pd_ask_keep")], ["remove", t("stats_pd_ask_remove")]]}
              onChange={(v) => setListChoice(projectId, "ask", choiceKey(i, a.row), v as "remove" | "keep")} />
          }>
            {t("stats_pd_ask", { value: a.value, codes: a.codes.join(" ") })}
          </Line>
        ))}
        {c.sure.texts.length > 0 && (
          <Line id={`pd-intext-${i}`} pick={(by) =>
            <Pick id={`pd-intext-sel-${i}`} by={by} value={c.inText} options={[["codes", t("stats_pd_code_list")], ["keep", t("stats_pd_keep")]]}
              onChange={(v) => setListChoice(projectId, "inText", i, v as "codes" | "keep")} />
          }>
            {c.sure.answers === 1 ? t("stats_pd_intext_one", { names: shortList(t, c.sure.texts, 8) }) : t("stats_pd_intext_many", { n: c.sure.answers, names: shortList(t, c.sure.texts, 8) })}
          </Line>
        )}
        {c.maybe.length > 0 && (
          <div data-testid={`pd-maybe-${i}`}>
            {c.maybe.map((g, k) => (
              <Line key={g.key} pick={(by) =>
                <Pick id={`pd-maybe-sel-${i}-${k}`} by={by} value={g.choice} options={maybeOptions(g)} onChange={(v) => setListChoice(projectId, "maybe", choiceKey(i, g.key), v)} />
              }>
                {t(g.suggest ? "stats_pd_maybe_suggest" : "stats_pd_maybe_ask", {
                  text: g.text, answers: g.answers === 1 ? t("stats_pd_answers_one") : t("stats_pd_answers_many", { n: g.answers }), codes: g.people.map((p) => p.code).join(" ")
                })}
              </Line>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Whether a column has anything to say: a flagged column always has; any other only for what the list found in it. */
const hasWords = (c: ColView): boolean =>
  c.role !== "answers" || c.options.length > 0 || c.unlisted.length + c.multi.length + c.wide.length + c.leftover.cells + c.shared.length + c.withdrawn.length + c.keepNotes.length + c.ask.length + c.sure.texts.length + c.maybe.length > 0;

/** Why the box is v1's, in one line. */
const WHY: Record<NotUsed, string> = {
  off: "stats_pd_why_off", locked: "stats_pd_why_locked", lockedNone: "stats_pd_why_locked_none", loading: "stats_pd_why_loading", unreadable: "stats_pd_why_unreadable", unsaved: "stats_pd_why_unsaved", empty: "stats_pd_why_empty"
};
/** Under an anonymous plan no list is expected: the line says only what is wrong with a list that is there, and gives no advice about setting up a vault or adding participants (R39e). */
const whyKey = (why: NotUsed, anonymous: boolean): string | null => {
  if (!anonymous) return WHY[why];
  return why === "locked" ? "stats_pd_why_locked_anon" : why === "unreadable" || why === "unsaved" ? WHY[why] : null; // a locked vault with no list in the project is not a thing to say under an anonymous plan
};

/**
 * The personal-data box (v1 pdRender 9487-9506), drawn under the columns once a table is parsed. core's pdScanV2 reads headings and the shape of the values (open answers are not names: F1);
 * this box shows what it flagged with Remove / Replace with a code / Keep, or says what was checked (never that the data is safe: rule 8), and always says what the scan cannot see and lists
 * the long-text columns. "Apply" rewrites the paste box (the lab), parses again and, when a column was coded, downloads the key file.
 *
 * With the participant list (spec 2026-10-24-participants-design.md §8.1; the lab holds a scan of the table against it) the box is the list's: a column with names on the list starts at their
 * codes, the names that are not on it are added (the box says who and with which code before Apply), withdrawn people's rows start removed, names inside answers start at their codes, and a guess
 * starts at "Choose…". Codes come from the list, so no key file is made. Without the list (vault off or locked, list not read or empty) the box is v1's with a line that says why.
 */
export function PdBox({ projectId, actions }: { projectId: string; actions: LabActions }) {
  const t = useT();
  const lab = useLab(projectId);
  const { ctx, names, data, scan } = lab;
  const why = listNotUsed(ctx);
  const ready = why === null && names !== null && names.list === ctx.list;
  const view = useMemo(
    () => (ready && data && scan && names && ctx.list
      ? viewOf({ data, found: scan.found, names: names.cols, list: ctx.list, mode: ctx.mode, choices: lab.listChoices, v1: lab.choices, today: todayIso() })
      : null),
    [ready, data, scan, names, ctx.list, ctx.mode, lab.listChoices, lab.choices]
  );
  if (!data || !scan) return null;
  const { found, freeText } = scan;
  const anonymous = ctx.mode === "anonymous";
  const shown = view ? view.cols.filter(hasWords) : [];
  const flagged = view ? shown.length > 0 : found.length > 0;
  const checking = why === null && !view;
  const line = why === null ? null : whyKey(why, anonymous);
  return (
    <div data-testid="pd-box" style={{ marginTop: 14 }}>
      {lab.pdResult && <p className="ap-box" role="status" data-testid="pd-result">{resultText(t, lab.pdResult)}</p>}
      {why === "unsaved" ? (
        // The list the page holds has changes the server never took: nothing is coded against it (R38). The student can send it again.
        <div className="ap-box" data-testid="pd-unsaved">
          <p style={{ margin: "0 0 8px" }} data-testid="pd-why">{t(whyKey(why, anonymous)!)}</p>
          <Button variant="ghost" size="sm" data-testid="pd-retry" disabled={lab.busy} onClick={() => actions.retryList()}>{t("stats_pd_retry")}</Button>
        </div>
      ) : checking ? (
        <p className="ap-box" data-testid="pd-checking">{t("stats_pd_checking")}</p>
      ) : !flagged ? (
        <p className="ap-box" data-testid="pd-none">{t("stats_pd_none")}</p>
      ) : (
        <fieldset className="ap-banner" data-testid="pd-found" disabled={lab.busy} style={{ minWidth: 0 }}>
          <b><Warning weight="fill" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{t(view ? "stats_pd_title_list" : "stats_pd_title")}</b>
          <p style={{ margin: "6px 0 8px" }}>{t(view ? "stats_pd_intro_list" : "stats_pd_intro")}</p>
          {line !== null && <p className="ap-small" style={{ margin: "0 0 8px" }} data-testid="pd-why">{t(line)}</p>}
          {view
            ? shown.map((c) => (c.role === "other" && c.found
              ? <OtherRow key={c.index} projectId={projectId} c={c} f={c.found} />
              : <ListColumn key={c.index} projectId={projectId} c={c} />))
            : found.map((f) => <V1Row key={f.index} projectId={projectId} f={f} value={v1Choice(f, lab.choices[f.index], anonymous, why)} anonymous={anonymous} why={why} />)}
          {view && view.adds.length > 0 && (
            <p className="ap-box" style={{ marginTop: 8 }} data-testid="pd-will-add">
              {view.adds.length === 1
                ? t("stats_pd_will_add_one", { names: `${view.adds[0]!.name} (${view.adds[0]!.code})` })
                : t("stats_pd_will_add_many", { n: view.adds.length, names: view.adds.map((a) => `${a.name} (${a.code})`).join(", ") })}
            </p>
          )}
          <div className="ap-row" style={{ marginTop: 10 }}>
            <Button variant="primary" size="sm" data-testid="pd-apply" disabled={lab.busy} onClick={() => void actions.apply()}>{t("stats_pd_apply")}</Button>
          </div>
          {view && <p className="ap-small" style={{ margin: "8px 0 0" }} data-testid="pd-from-list">{t("stats_pd_from_list")}</p>}
          <p className="ap-small" style={{ margin: "8px 0 0" }}>{t(view ? "stats_pd_pseudo_list" : "stats_pd_pseudo")}</p>
        </fieldset>
      )}
      <p className="ap-small" data-testid="pd-scope" style={{ margin: "6px 0 0" }}>
        {t("stats_pd_scope")}{view ? " " + t("stats_pd_scope_list") : ""}{freeText.length ? " " + t("stats_pd_long", { cols: freeText.join(", ") }) : ""}
      </p>
    </div>
  );
}

/** A column v1 flags by what it is (phone, e-mail, birth date, address, ID number) when the list is used: Remove or Keep; a code from the list cannot stand for it. */
function OtherRow({ projectId, c, f }: { projectId: string; c: ColView; f: PdFound }) {
  const t = useT();
  return (
    <div data-testid={`pd-col-${c.index}`}>
      <Line pick={() => <Pick id={"pd-sel-" + c.index} label={t("stats_pd_select_aria", { name: c.name })} value={c.action} options={c.options.map((a) => [a, actionText(t, a, true)])} onChange={(v) => setChoice(projectId, c.index, v as ColAction)} />}>
        <b>{c.name}</b> {t("stats_pd_label_" + f.kind)}
      </Line>
    </div>
  );
}
