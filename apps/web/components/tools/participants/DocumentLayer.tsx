"use client";
import { useEffect, useMemo } from "react";
import { buildMatcher, type Matcher } from "@appuscholar/core";
import { useSuggestion } from "@/lib/ai/suggestion";
import { rangesFor, type TextSpan } from "@/lib/tools/participants/docNames";
import { suggestionNotNames, toMatchPeople } from "@/lib/tools/participants/list";
import { publishList, useListFor } from "@/lib/tools/participants/store";
import { useParticipants } from "@/lib/tools/participants/useParticipants";

/**
 * The participant names in the open document (spec 2026-10-24-participants-design.md §8.2; call C9; rulings R1 and R19). Mounted by the project shell once, in the writing window
 * only, whatever place or tab is open (lib/tools/registry.ts, DocumentLayer). It draws nothing of its own into the page except the `<style>` that colours the highlights.
 *
 * It reads the participant list through useParticipants, as every reader does (which reads only once the vault is open, so the layer never raises a passphrase prompt, and publishes
 * the list to lib/tools/participants/store.ts with its blob version; "locked", "off" and "broken" publish nothing, which clears it, R19). What it paints it takes from the store, so a
 * person added or the switch turned on the tab (a save the tab's own hook made, which this hook does not hear) shows at once. When the layer goes away, the store is cleared too.
 *
 * While the list is open, has people on it (a destroyed list, or one with nobody, has nothing to look for) and the switch "Highlight names in my documents" is not off, the text of the editor (`.editor .ProseMirror`) is painted with the CSS Custom
 * Highlight API: `pp-sure` for names on the list (purple, with a solid underline) and `pp-maybe` for names to ask about and names not on the list (amber, dashed). Highlights are
 * ranges the browser draws; the document is not touched and nothing is stored. The ranges are computed per block from the editor's text nodes (docNames.ts rangesFor), once when the
 * list or the editor changes and again, at most every REPAINT_MS, after the editor's DOM changes (a MutationObserver on its root). An editor that is mounted but whose DOM is not in the
 * page is looked for again up to MAX_LOOKS times, then not until the next list or editor change. A browser without `CSS.highlights` paints nothing. A made-up name is never painted as a
 * name that is not on the list (suggestionNotNames).
 * Both highlights are removed when the list is not in use, the switch is off, and when the layer unmounts.
 */

/** The most often the highlights are worked out again while the document is being edited. */
export const REPAINT_MS = 500;
/** How many times the layer looks again for an editor that is not in the page yet, REPAINT_MS apart, before it waits for the next list or editor change. */
export const MAX_LOOKS = 20;

/** A stable empty list for the effect's dependencies. */
const NONE: string[] = [];

/** The two highlight names. */
const SURE = "pp-sure";
const MAYBE = "pp-maybe";

/** Purple (#ede9fe, a solid #7c3aed underline) for names on the list, amber (#fef3c7, a dashed #d97706 underline) for the rest. `::highlight` allows only these kinds of property. */
const STYLE = `::highlight(${SURE}){background-color:#ede9fe;text-decoration:underline 2px #7c3aed;}::highlight(${MAYBE}){background-color:#fef3c7;text-decoration:underline dashed 2px #d97706;}`;

type Registry = { set(name: string, h: unknown): unknown; delete(name: string): unknown };
type Api = { registry: Registry; Highlight: new (...ranges: Range[]) => unknown };

/** The browser's highlight registry and `Highlight` class, or null when it has none (jsdom, an older browser). Read when used, never at load. */
function highlightApi(): Api | null {
  const css = (globalThis as { CSS?: { highlights?: Registry } }).CSS;
  const Highlight = (globalThis as { Highlight?: Api["Highlight"] }).Highlight;
  return css?.highlights && typeof Highlight === "function" ? { registry: css.highlights, Highlight } : null;
}

const toRange = (s: TextSpan): Range => {
  const r = document.createRange();
  r.setStart(s.startNode, s.startOffset);
  r.setEnd(s.endNode, s.endOffset);
  return r;
};

const removeHighlights = (api: Api) => { api.registry.delete(SURE); api.registry.delete(MAYBE); };

/**
 * Keeps the two highlights up to date for `matcher` over the editor's root while it is set; removes them otherwise and when it is cleaned up. `editor` only says that an editor
 * came or went (the shell's editor changes when another document opens); the root is found in the page.
 */
function usePaint(matcher: Matcher | null, notNames: string[], editor: unknown): void {
  useEffect(() => {
    const api = highlightApi();
    if (!api || !matcher) return;
    let root: Element | null = null;
    let looks = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => schedule());
    function schedule() { if (timer === undefined) timer = setTimeout(paint, REPAINT_MS); }
    function paint() {
      timer = undefined;
      // The root can change (another document's editor): watch the one that is there now.
      const now = document.querySelector(".editor .ProseMirror");
      if (now !== root) {
        observer.disconnect();
        root = now;
        if (root) observer.observe(root, { childList: true, characterData: true, subtree: true });
      }
      if (!root) {
        removeHighlights(api!);
        // An editor is mounted but its DOM is not in the page yet: look again, a bounded number of times (the next list or editor change starts afresh).
        if (editor && looks++ < MAX_LOOKS) schedule();
        return;
      }
      looks = 0;
      const { sure, maybe } = rangesFor(root, matcher!, notNames);
      api!.registry.set(SURE, new api!.Highlight(...sure.map(toRange)));
      api!.registry.set(MAYBE, new api!.Highlight(...maybe.map(toRange)));
    }
    paint();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      removeHighlights(api);
    };
  }, [matcher, notNames, editor]);
}

export function DocumentLayer({ projectId }: { projectId: string }) {
  const own = useParticipants(projectId);
  const stored = useListFor(projectId);
  const { editor } = useSuggestion();
  // The list as the window knows it now: the store has the newest (a save from the tab); the hook's own is the first render's, before it has published.
  const list = own.state === "ready" ? (stored ?? own.list) : null;
  const paints = list !== null && !list.destroyedAt && list.people.length > 0 && list.highlight !== false && highlightApi() !== null;
  const matcher = useMemo(() => (paints && list ? buildMatcher(toMatchPeople(list, false)) : null), [paints, list]);
  // The words that are not suggested: "Not a name" and the made-up names (R34).
  const notNames = useMemo(() => (list ? suggestionNotNames(list) : NONE), [list]);
  usePaint(matcher, notNames, editor);
  // The names leave the window's memory with the layer (the project is closed or the page goes).
  useEffect(() => () => publishList(projectId, null), [projectId]);
  return paints ? <style data-testid="pp-highlight-style">{STYLE}</style> : null;
}
