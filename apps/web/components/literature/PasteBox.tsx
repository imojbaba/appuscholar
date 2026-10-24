"use client";
import { useEffect, useRef, useState } from "react";
import { parsePasted, pasteLookup, type PastedRef } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { StoredEntry } from "@/lib/blobs/kinds";
import type { Library } from "@/lib/cite/useLibrary";
import { keepEntry, pastedEntry, undoKeepSettled } from "@/lib/papers/keep";
import { useKeep } from "@/lib/papers/useKeep";
import { useOpenAlexKey } from "@/lib/research/oaKey";
import { Button } from "@/components/ui/button";

/** How long one request of a lookup may take. A lookup is up to four requests in a row; one that hangs would keep the button busy for as long as the browser waits (minutes). */
export const PASTE_REQUEST_TIMEOUT_MS = 20000;

/** What the line under the box shows: a lookup working, a paper kept (with its Undo), one already kept, one removed again, or a message. */
type Line = { kind: "busy" | "kept" | "already" | "removed" | "changed" | "msg"; text: string; undo?: { added: StoredEntry; title: string } };

/** What the student pasted, as the id it was read as: the sentence "No paper found for {ref}" names that id (a link with a DOI in it names the DOI), else the text as typed. */
const refOf = (r: PastedRef, typed: string): string => ("v" in r ? r.v : typed.trim());

/**
 * The paste box in Find (wave B Task 19, canvas Find, register row D-S2-124; walk fault W4): "Already have a paper? Paste a link, DOI or PubMed number", one box and "Look it up and keep".
 * core reads what was pasted and looks it up (parsePasted, pasteLookup: a DOI, a PubMed, PMC, arXiv or OpenAlex id; a link with no id in it and a title are told apart and sent
 * nowhere), and the paper is kept at once through the same door as a search result (keepEntry, with the abstract and the free link when the lookup brought them, so a paper already
 * kept by its DOI is not added again). The line under the box then reads "Kept: {title}" with Undo, which takes the paper out again only while it is as it was kept (undoKeepSettled), or
 * "Already in your reading list: {title}". A press waits for the library as Keep does (useKeep: busy while it loads, one passphrase prompt when it is locked) and is refused when the
 * library cannot be opened; while it waits on a locked library the line says so (a cancelled prompt would otherwise leave "Looking it up…" up), and a library that turns out broken
 * says that, not that the connection failed. Undo says "Removed" only once the save has gone and the paper is out (undoKeepSettled; another window may have saved first), and puts
 * the cursor back in the box, as the Undo button is gone. Every request goes to Crossref, PubMed or OpenAlex and carries only an id (and the student's OpenAlex key, as the search does); a student who left Find
 * before the answer came keeps nothing. Self-contained: FindTab only places it, under the search.
 */
export function PasteBox() {
  const t = useT();
  const { library, current, keepWhenRead } = useKeep();
  const oaKey = useOpenAlexKey();
  const [value, setValue] = useState("");
  const [line, setLine] = useState<Line | null>(null);
  // What is going on: the lookup and keep, or an Undo. The ref is the guard against a second press before the state shows; both buttons keep focus (aria-disabled, never disabled).
  const [working, setWorking] = useState<"lookup" | "undo" | null>(null);
  // The press is queued for the library (it is loading or locked) and nothing else is going on: the lookup is over, or Undo has begun.
  const [waiting, setWaiting] = useState<"keep" | "undo" | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Runs `job` as the one thing going on; `working` shows it. */
  const work = async (kind: "lookup" | "undo", job: () => Promise<void>) => {
    busy.current = true;
    setWorking(kind);
    try { await job(); } finally {
      busy.current = false;
      if (mounted.current) setWorking(null);
    }
  };
  const say = (l: Line) => { if (mounted.current) setLine(l); };
  /** keepWhenRead, with `waiting` showing while the job waits for the library. */
  const whenRead = async <R,>(kind: "keep" | "undo", job: (l: Library) => R): Promise<Awaited<R> | null> => {
    if (mounted.current) setWaiting(kind);
    try { return await keepWhenRead(job); } finally { if (mounted.current) setWaiting(null); }
  };

  const lookUp = () => {
    if (busy.current || library.broken) return;
    const typed = value;
    const ref = parsePasted(typed);
    if (ref.k === "empty") {
      setLine({ kind: "msg", text: t("find_paste_empty") });
      box.current?.focus();
      return;
    }
    void work("lookup", async () => {
      setLine({ kind: "busy", text: t("find_paste_busy") });
      try {
        const f: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(PASTE_REQUEST_TIMEOUT_MS) });
        const out = await pasteLookup(f, ref, oaKey ?? undefined);
        if (!mounted.current) return;
        if (out.result !== "ok") {
          const text = out.result === "nf" ? t("find_paste_nf", { ref: refOf(ref, typed) }) : t(out.result === "fail" ? "find_paste_fail" : out.result === "link" ? "find_paste_link" : "find_paste_text");
          say({ kind: "msg", text });
          return;
        }
        const entry = pastedEntry(out);
        const title = entry.title || refOf(ref, typed);
        const r = await whenRead("keep", (l) => keepEntry(entry, l));
        // Nothing was kept: the library does not open (the vault's unlock found it broken), or the read failed. The library as it is now says which.
        if (r === null) { say({ kind: "msg", text: t(current().broken ? "vault_cite_broken" : "find_paste_not_kept") }); return; }
        if (mounted.current) setValue("");
        // What keepEntry stored, for Undo to compare with: the entry, its pid and the reading list.
        if (r.state === "kept") say({ kind: "kept", text: t("find_paste_kept", { title }), undo: { added: { ...entry, pid: r.pid, rl: true }, title } });
        else say({ kind: "already", text: t("find_paste_already", { title }) });
      } catch {
        say({ kind: "msg", text: t("list_action_fail") });
      }
    });
  };

  const undo = (u: NonNullable<Line["undo"]>) => {
    if (busy.current) return;
    void work("undo", async () => {
      /** The Undo button is gone with its line, so the cursor goes to the box; a line that keeps Undo (to try again) keeps it there. */
      const end = (l: Line) => { say(l); if (!l.undo && mounted.current) box.current?.focus(); };
      try {
        const r = await whenRead("undo", (l) => undoKeepSettled(u.added, l));
        if (r === null) end(current().broken ? { kind: "msg", text: t("vault_cite_broken") } : { kind: "msg", text: t("list_action_fail"), undo: u });
        else if (r === "changed") end({ kind: "changed", text: t("find_paste_changed", { title: u.title }) });
        else end({ kind: "removed", text: t("find_paste_removed", { title: u.title }) });
      } catch {
        end({ kind: "msg", text: t("list_action_fail"), undo: u });
      }
    });
  };

  // What the line shows: while a press waits on a locked library, that (with Undo still there when it is Undo that waits); else what the last press ended with.
  const shown: Line | null = waiting !== null && library.locked
    ? { kind: "msg", text: t("vault_cite_locked"), ...(waiting === "undo" && line?.undo ? { undo: line.undo } : {}) }
    : line;

  return (
    <details className="find-paste" data-testid="find-paste">
      <summary>{t("find_paste_summary")}</summary>
      <form className="find-paste-row" onSubmit={(e) => { e.preventDefault(); lookUp(); }}>
        <input ref={box} className="input find-paste-input" type="text" data-testid="find-paste-input" aria-label={t("find_paste_label")} autoComplete="off" spellCheck={false}
          value={value} onChange={(e) => setValue(e.target.value)} />
        <Button variant="ghost" type="submit" className="find-paste-go" data-testid="find-paste-go"
          aria-disabled={working !== null || library.broken || undefined} aria-busy={working === "lookup" || undefined}>{t("find_paste_btn")}</Button>
      </form>
      <div className="find-paste-line" role="status" data-testid="find-paste-line" data-kind={shown?.kind}>
        {shown && (
          <>
            <span data-testid="find-paste-text">{shown.text}</span>
            {shown.undo && (
              <Button variant="ghost" type="button" className="find-paste-undo" data-testid="find-paste-undo" aria-disabled={working !== null || undefined} aria-busy={working === "undo" || undefined}
                onClick={() => { undo(shown.undo!); }}>{t("find_paste_undo")}</Button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
