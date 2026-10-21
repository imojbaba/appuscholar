"use client";
import { useEffect, useMemo, useState } from "react";
import { ClipboardText, DownloadSimple, FilePlus } from "@phosphor-icons/react";
import { PROVIDERS, aiuBuild, aiuInRange, type AiuEntry, type AiuStyle, type AiuTicks } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { downloadBlob } from "@/lib/export/download";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useInsertAtEnd } from "@/lib/tools/design/insertEnd";
import { notesOf, unread } from "@/lib/tools/design/useDesign";
import { Button } from "@/components/ui/button";

/** The file the statement downloads as (v1 aiuDownload 5560). */
const FILE = "ai-use-statement.txt";
/** v1's dialog started with only "I planned the argument and the structure myself" ticked (aiuOwn is `checked`, the other four are not; 1897-1901). */
const TICKS_AT_START: AiuTicks = { own: true, reword: false, cite: false, facts: false, noData: false };
/** The five truth ticks, in v1's order, with the key of their words. */
const TICK_ROWS: ReadonlyArray<{ key: keyof AiuTicks; label: string }> = [
  { key: "own", label: "design_aiu_own" }, { key: "reword", label: "design_aiu_reword" }, { key: "cite", label: "design_aiu_cite" },
  { key: "facts", label: "design_aiu_facts" }, { key: "noData", label: "design_aiu_nodata" }
];
const FORMATS = ["course", "thesis", "journal"] as const;

type Log = { state: "loading" } | { state: "error" } | { state: "ready"; rows: AiuEntry[] };
/** A row of the log that core can read: v1 wrote strings in all five fields. */
const isEntry = (x: unknown): x is AiuEntry => {
  const e = x as Record<string, unknown> | null;
  return !!e && typeof e === "object" && ["d", "p", "m", "k", "g"].every((f) => typeof e[f] === "string");
};

/**
 * The AI-use statement (v1 aiuOpen, aiuRender, aiuToggle, aiuBuild, aiuCopy, aiuInsert, aiuDownload 5411-5568 and the dialog 1888-1910), as a tab.
 * It reads this project's AI log (GET /ai/log?projectId=, entries {d,p,m,k,g}; what first run's idea check logged before the project existed is claimed
 * into it when first run saves). The dates, the row for each kind of help in range (all ticked, as v1), the other tools, the five truth ticks and the
 * format go to core's aiuBuild with the style declaration (the style blobs, absent until My writing style is used) and the providers table; the text it
 * returns, or its refusal, is shown as it is. The panel never offers a "no AI" statement of its own: with rows in range and nothing ticked and no other
 * tools, core refuses (rule 3). "Keep the log" is the existing setting `aiLogOff`, inverted. The statement is an editable box with Copy, Insert (plain
 * text, at the end of the open document) and Download.
 */
export function AiUse({ projectId }: { projectId: string }) {
  const t = useT();
  const { settings, update } = useSettings();
  const { insert, busy } = useInsertAtEnd();
  const id = projectId === "" ? null : projectId;

  // One read per project and per "Try again"; an answer that belongs to an earlier read (another project, or before a retry) is not shown.
  const [attempt, setAttempt] = useState(0);
  const reqKey = id === null ? null : `${id}\u0000${attempt}`;
  const [res, setRes] = useState<{ key: string; rows: AiuEntry[] | null } | null>(null);
  useEffect(() => {
    if (id === null || reqKey === null) return;
    let live = true;
    apiFetch<unknown>(`/ai/log?projectId=${encodeURIComponent(id)}`).then(
      (r) => { if (live) setRes({ key: reqKey, rows: Array.isArray(r) ? r.filter(isEntry) : null }); },
      () => { if (live) setRes({ key: reqKey, rows: null }); }
    );
    return () => { live = false; };
  }, [id, reqKey]);
  const answer = res !== null && res.key === reqKey ? res : null;
  const log: Log = id === null || (answer !== null && answer.rows === null) ? { state: "error" } : answer === null ? { state: "loading" } : { state: "ready", rows: answer.rows! };
  const rowsOfLog = log.state === "ready" ? log.rows : null;
  const all = useMemo(() => rowsOfLog ?? [], [rowsOfLog]);

  // The dates: null is "the log's first and last day" (v1 aiuOpen), an empty string is "no limit" (v1's empty box).
  const [fromSet, setFrom] = useState<string | null>(null);
  const [toSet, setTo] = useState<string | null>(null);
  const days = all.map((x) => x.d).sort();
  const from = fromSet ?? days[0] ?? "";
  const to = toSet ?? days[days.length - 1] ?? "";
  const list = useMemo(() => aiuInRange(all, from, to), [all, from, to]);

  // The kinds of help in range, most used first (v1 aiuRender, a stable sort), and the ones the student unticked.
  const kinds = useMemo(() => {
    const by = new Map<string, number>();
    for (const x of list) by.set(x.k, (by.get(x.k) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [other, setOther] = useState("");
  const [ticks, setTicks] = useState<AiuTicks>(TICKS_AT_START);
  const [fmt, setFmt] = useState<string>("course");
  const [out, setOut] = useState("");
  const [refuse, setRefuse] = useState("");
  const [msg, setMsg] = useState("");
  /** v1 redrew the rows on every change of the dates, which ticked every kind again. */
  const dates = (f: string | null, to: string | null) => { setFrom(f); setTo(to); setOff(new Set()); setRefuse(""); };

  // My writing style (session D) keeps the declaration in three blobs; until it ships none exists, and a missing blob reads as "off" (never an error).
  const profile = useProjectBlob("style_profile", id);
  const meta = useProjectBlob("style_meta", id);
  const samples = useProjectBlob("style_samples", id);
  const styleBlobs = [profile, meta, samples];
  const styleWait = styleBlobs.some((b) => unread(b));
  const styleBroken = !styleWait && styleBlobs.some((b) => notesOf(b).broken);
  const style: AiuStyle = {
    on: profile.value?.on === true,
    decl: typeof meta.value?.decl === "string" ? meta.value.decl : "",
    samples: Array.isArray(samples.value) ? samples.value.length : 0
  };

  const build = () => {
    setMsg("");
    const keep: Record<string, 1> = {};
    for (const [k] of kinds) if (!off.has(k)) keep[k] = 1;
    const r = aiuBuild({ list, keep, other, fmt, ticks, style, providers: PROVIDERS });
    if ("refuse" in r) { setRefuse(r.refuse); return; }
    setRefuse("");
    setOut(r.text);
  };
  const copy = async () => {
    setMsg("");
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(out);
      setMsg(t("design_aiu_copied"));
    } catch {
      setMsg(t("design_aiu_copy_failed"));
    }
  };
  const put = async () => {
    setMsg("");
    if (!(await insert(out))) setMsg(t("design_insert_failed"));
  };
  const download = () => {
    setMsg("");
    downloadBlob(FILE, new Blob([out], { type: "text/plain;charset=utf-8" }));
    setMsg(t("design_exported", { name: FILE }));
  };

  const ready = log.state === "ready" && !styleWait;
  const logOff = settings.aiLogOff === true;
  const field = "flex flex-col gap-1 text-[13.5px] text-ink";
  const tick = (checked: boolean, on: (v: boolean) => void, label: string, testid: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
      <input type="checkbox" className="size-[17px] accent-purple-600" data-testid={testid} checked={checked} onChange={(e) => { setRefuse(""); on(e.target.checked); }} />
      {label}
    </label>
  );
  return (
    <div className="panel" data-testid="panel-design-aiuse">
      <h3>{t("tab_name_aiuse")}</h3>
      <p className="desc">{t("design_aiu_intro")}</p>
      <div className="stack" style={{ maxWidth: "62ch" }}>
        <section className="flex flex-col gap-1.5" aria-labelledby="aiu-log-h" data-testid="aiu-log">
          <h4 id="aiu-log-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_aiu_log_h")}</h4>
          <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
            <input type="checkbox" className="size-[17px] accent-purple-600" data-testid="aiu-keep" checked={!logOff} onChange={(e) => { void update({ aiLogOff: !e.target.checked }); }} />
            {t("design_aiu_keep")}
          </label>
          <p className="desc" style={{ margin: 0 }}>{t("design_aiu_keep_desc")}</p>
          <div role="status" data-testid="aiu-log-msg" className={log.state === "ready" ? "" : "text-[13px] leading-[18px] text-ink"}>
            {log.state === "loading" && t("design_aiu_loading")}
            {log.state === "error" && (id === null ? t("design_aiu_no_project") : t("design_aiu_read_failed"))}
          </div>
          {log.state === "error" && id !== null && (
            <div className="place-row" style={{ marginBottom: 0 }}>
              <Button variant="ghost" data-testid="aiu-retry" onClick={() => setAttempt((n) => n + 1)}>{t("design_aiu_retry")}</Button>
            </div>
          )}
          {log.state === "ready" && (
            <p className="desc" style={{ margin: 0 }} data-testid="aiu-count">
              {all.length === 0 ? (logOff ? t("design_aiu_off") : t("design_aiu_empty")) : t("design_aiu_count", { all: all.length, n: list.length })}
            </p>
          )}
          {log.state === "ready" && all.length > 0 && logOff && <p className="desc" style={{ margin: 0 }} data-testid="aiu-off">{t("design_aiu_off")}</p>}
        </section>

        <section className="mt-3 flex flex-col gap-2" aria-labelledby="aiu-dates-h" data-testid="aiu-dates">
          <h4 id="aiu-dates-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_aiu_dates_h")}</h4>
          <div className="flex gap-2">
            <label className={field + " flex-1"}>{t("design_aiu_from")}<input type="date" className="input" data-testid="aiu-from" value={from} onChange={(e) => dates(e.target.value, toSet)} /></label>
            <label className={field + " flex-1"}>{t("design_aiu_to")}<input type="date" className="input" data-testid="aiu-to" value={to} onChange={(e) => dates(fromSet, e.target.value)} /></label>
          </div>
          <p className="desc" style={{ margin: 0 }}>{t("design_aiu_dates_desc")}</p>
          <div className="flex flex-col gap-1.5" role="group" aria-label={t("design_aiu_rows")} data-testid="aiu-rows">
            {kinds.map(([k, n], i) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox" className="size-[17px] accent-purple-600" data-testid={"aiu-row-" + i} data-k={k} checked={!off.has(k)}
                  onChange={(e) => { setRefuse(""); setOff((p) => { const q = new Set(p); if (e.target.checked) q.delete(k); else q.add(k); return q; }); }}
                />
                <span>{k.charAt(0).toUpperCase() + k.slice(1)} <span className="text-muted">({n})</span></span>
              </label>
            ))}
            {log.state === "ready" && kinds.length === 0 && <p className="desc" style={{ margin: 0 }} data-testid="aiu-none">{t("design_aiu_none")}</p>}
          </div>
          <label className={field}>
            {t("design_aiu_other")}
            <textarea className="input" rows={2} data-testid="aiu-other" placeholder={t("design_aiu_other_ph")} value={other} onChange={(e) => { setRefuse(""); setOther(e.target.value); }} />
          </label>
        </section>

        <section className="mt-3 flex flex-col gap-1.5" aria-labelledby="aiu-self-h" data-testid="aiu-self">
          <h4 id="aiu-self-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_aiu_self_h")}</h4>
          <p className="desc" style={{ margin: 0 }}>{t("design_aiu_self_desc")}</p>
          {TICK_ROWS.map((r) => tick(ticks[r.key], (v) => setTicks((p) => ({ ...p, [r.key]: v })), t(r.label), "aiu-" + r.key.toLowerCase()))}
          <label className={field + " mt-2"}>
            {t("design_aiu_fmt")}
            <select className="input" data-testid="aiu-fmt" value={fmt} onChange={(e) => setFmt(e.target.value)}>
              {FORMATS.map((f) => <option key={f} value={f}>{t("design_aiu_fmt_" + f)}</option>)}
            </select>
          </label>
        </section>

        <section className="mt-3 flex flex-col gap-2" aria-labelledby="aiu-out-h" data-testid="aiu-build-section">
          <h4 id="aiu-out-h" className="m-0 text-[15px] font-semibold text-ink">{t("design_aiu_build_h")}</h4>
          <div role="status" data-testid="aiu-style-note" className={styleWait || styleBroken ? "text-[13px] leading-[18px] text-ink" : ""}>
            {styleWait ? (styleBlobs.some((b) => b.loading) ? "" : t("design_aiu_style_wait")) : styleBroken ? t("design_aiu_style_broken") : ""}
          </div>
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="primary" data-testid="aiu-build" disabled={!ready} onClick={build}>{t("design_aiu_build")}</Button>
          </div>
          <div role="status" data-testid="aiu-refuse" className={refuse ? "text-[13px] leading-[18px] font-semibold text-ink" : ""}>{refuse}</div>
          <label className={field}>
            {t("design_aiu_out")}
            <textarea className="input" rows={9} data-testid="aiu-out" value={out} onChange={(e) => { setMsg(""); setOut(e.target.value); }} />
          </label>
          <div className="place-row" style={{ marginBottom: 0 }}>
            <Button variant="ghost" data-testid="aiu-copy" disabled={out.trim() === ""} onClick={() => { void copy(); }}><ClipboardText aria-hidden="true" />{t("copy_btn")}</Button>
            <Button variant="gold" data-testid="aiu-insert" disabled={out.trim() === "" || busy} onClick={() => { void put(); }}><FilePlus aria-hidden="true" />{t("design_aiu_insert")}</Button>
            <Button variant="ghost" data-testid="aiu-download" disabled={out.trim() === ""} onClick={download}><DownloadSimple aria-hidden="true" />{t("design_aiu_download")}</Button>
          </div>
          <div role="status" data-testid="aiu-action-msg" className={msg ? "text-[13px] leading-[18px] text-ink" : ""}>{msg}</div>
          <p className="desc" style={{ margin: 0 }}>{t("design_aiu_foot")}</p>
        </section>
      </div>
    </div>
  );
}
