"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { findInDoc, replaceRanges, revealMatch, showMatches } from "@/lib/editor/findInEditor";
import type { DocRange } from "@/lib/editor/findDecorations";

const btn = "fmt";

/** The Find and replace bar under the format bar: Find, Replace, Next, Replace, Replace all, "i of n" and a case box. */
export function FindReplace({ editor, seed, onClose }: { editor: Editor; seed: string; onClose(): void }) {
  const [query, setQuery] = useState(seed);
  const [repl, setRepl] = useState("");
  const [caseSensitive, setCase] = useState(false);
  const [picked, setCurrent] = useState(0);
  const [version, setVersion] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => { findRef.current?.focus(); findRef.current?.select(); }, []);

  // Re-count as the student types in the document or edits the query. `version` stands for "the document changed".
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    editor.on("update", bump);
    return () => { editor.off("update", bump); };
  }, [editor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the document-changed signal
  const matches = useMemo(() => findInDoc(editor.state.doc, query, caseSensitive), [editor, query, caseSensitive, version]);
  const current = matches.length ? Math.min(picked, matches.length - 1) : 0;
  useEffect(() => { showMatches(editor, matches, current); }, [editor, matches, current]);
  useEffect(() => () => { if (!editor.isDestroyed) showMatches(editor, [], 0); }, [editor]);

  function go(i: number) {
    if (!matches.length) return;
    const next = (i + matches.length) % matches.length;
    const target = matches[next];
    if (!target) return;
    setCurrent(next);
    revealMatch(editor, target);
  }
  function replaceOne() {
    if (!matches.length) return;
    const target = matches[current];
    if (target) replaceRanges(editor, [target], repl);
    // The next match slides into this index; the count box refreshes on the editor's update event.
  }
  function replaceAll() {
    const n = replaceRanges(editor, matches, repl);
    toast(n ? `Replaced ${n}` : "No matches found");
  }

  return (
    <div className="fmtbar findbar" role="search" aria-label="Find and replace" data-testid="find-bar"
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <Input ref={findRef} className="findbar-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find" aria-label="Find" data-testid="find-input"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? current - 1 : current + 1); } }} />
      <Input className="findbar-input" value={repl} onChange={(e) => setRepl(e.target.value)} placeholder="Replace with" aria-label="Replace with" data-testid="replace-input" />
      <button type="button" className={btn} aria-label="Next match" data-testid="find-next" disabled={!matches.length} onClick={() => go(current + 1)}>Next</button>
      <button type="button" className={btn} aria-label="Replace this match" data-testid="find-replace" disabled={!matches.length} onClick={replaceOne}>Replace</button>
      <button type="button" className={btn} aria-label="Replace all matches" data-testid="find-replace-all" disabled={!matches.length} onClick={replaceAll}>Replace all</button>
      <span className="findbar-count" role="status" aria-live="polite" data-testid="find-count">{matches.length ? `${current + 1} of ${matches.length}` : "0 of 0"}</span>
      <label className="findbar-case"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCase(e.target.checked)} data-testid="find-case" />Match case</label>
      <button type="button" className={btn} aria-label="Close find and replace" data-testid="find-close" onClick={onClose}>✕</button>
    </div>
  );
}
