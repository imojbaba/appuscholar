"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { docInnerText, sanitizeHtml } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { sealBody } from "@/lib/useAutosave";
import { VaultError } from "@/lib/vault/crypto";
import type { ExportDoc, ExportDocSummary } from "@/lib/vault/export";
import { titleText, UNTITLED } from "@/lib/vault/titles";
import { useVault, type VaultValue } from "@/lib/vault/useVault";
import { onSyncMessage, syncChannel, type DocHelloMessage, type DocOp, type DocReplyMessage, type DocRequestMessage, type DocSnapshotMessage } from "@/lib/popout/channel";
import { isPopout } from "@/lib/popout/mode";
import { toast } from "@/components/ui/toast";
import { useProject, type DocumentWithBody, type ProjectValue } from "@/components/frame/ProjectContext";
import { insertHtmlBlock, insertTextAtCursor, selectionText } from "./insert";

/*
 * How the seven tools of stages 3 to 6 touch the student's document (Task G4). One contract for every tool, in the writing window and in a
 * place's own window alike: reads (text, selection, every document of the project) and writes (inserts, a tag over the selection, a replace,
 * a whole document rewritten). In the writing window each write goes through the shell's requestInsert, so a closed document opens beside the
 * place first and a locked one asks for the passphrase once (as Insert reference list does, row 11). In a pop-out each write is a request the
 * writing window runs (ruling R10); the pop-out never writes a document itself (register row D-S2-43).
 */

/** The two tags a tool puts over the student's words: v1's stats run tag (insertIntoEditor 4204) and its qualitative code tag (qualTagSelection 6253-6256). */
export type ToolTag = "stat-tag" | "qual-tag";
/** wrapSelection's answer: tagged; nothing selected; or a selection that crosses a paragraph, heading or list item (v1 6257). */
export type WrapResult = "done" | "no-selection" | "crosses-paragraph";
/** One document of the project as a tool reads it: its opened title, its HTML, and its text as v1's getEditorText reads it (docInnerText). */
export type ProjectDocument = { id: string; title: string; text: string; html: string };

/** What useDocAccess gives a tool. The names and signatures are the contract five tool sessions build on. */
export type DocAccess = {
  /** The whole open document as v1's getEditorText (3151): innerText of the editor, core's docInnerText of its HTML (ruling R9); "" with none. */
  text(): string;
  /** v1's selText as the helpers read it (5554, lib/ai/actions.ts helperText): the selected text, paragraphs separated by a newline, else "". */
  selection(): string;
  /** v1's insertIntoEditor for plain text (4195-4201, insertTextAtCursor): at the placed cursor, else at the end on a new line, escaped. */
  insertText(s: string): Promise<boolean>;
  /** v1's insertHTMLBlockIntoEditor (4228-4244, insertHtmlBlock), sanitised: at the cursor once the student has placed one, else at the end. */
  insertBlock(html: string): Promise<boolean>;
  /** v1's qualTagSelection (6245-6263) for either tag: the selection wrapped in `<span class="<tag>" …attrs>` as one undoable step. */
  wrapSelection(tag: ToolTag, attrs: Record<string, string>): Promise<WrapResult>;
  /** v1's gramReplaceInEditor (6801-6817): the first occurrence of `original` in the document's text replaced, undoable with Ctrl+Z. */
  replaceInDocument(original: string, replacement: string): Promise<boolean>;
  /** Every live (not deleted) document of this project, decrypted, in creation order; the open one as the editor holds it now. [] when unreadable. */
  allDocuments(): Promise<ProjectDocument[]>;
  /** Replaces a document's text: the open one in its editor (one undoable step, saved by its autosave), any other sealed and written as a new revision (ruling R12). */
  rewriteDocument(id: string, html: string): Promise<boolean>;
};

/** How long a pop-out waits for the writing window to answer a request (ruling R10): then it answers its fallback and says pop_nowin. */
export const DOC_REPLY_WAIT_MS = 10_000;
/** How long the writing window lets the document rest before it sends a pop-out a new snapshot (ruling R10, debounced). */
export const SNAPSHOT_DEBOUNCE_MS = 300;

/**
 * v1 qualTagSelection (6245-6263) over the editor's marks: an empty selection is "no-selection" (v1's toast at 6248); a selection that does not
 * sit inside one paragraph, heading or list item paragraph is "crosses-paragraph" (surroundContents throws there, 6257). Otherwise the selection
 * gets the classSpan mark `<span class="<tag>">` with the `data-*` attributes and the `title` of `attrs` (the attributes the editor keeps on a
 * span; any other, a `style` among them, is dropped, so no code colour is written into the document: ruling R4), as one undoable step, and the
 * cursor ends after it (6258-6259). A second tag over the same words nests.
 */
export function wrapSelectionIn(editor: Editor, tag: ToolTag, attrs: Record<string, string>): WrapResult {
  const { selection, schema } = editor.state;
  if (selection.empty) return "no-selection";
  const { $from, $to, from, to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return "crosses-paragraph";
  const data: Record<string, string> = {};
  let title: string | null = null;
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-")) data[k] = v;
    else if (k === "title") title = v;
  }
  const mark = schema.marks.classSpan!.create({ class: tag, data, title });
  editor.chain().focus().command(({ tr }) => {
    closeHistory(tr);
    tr.addMark(from, to, mark);
    tr.setSelection(TextSelection.create(tr.doc, to));
    return true;
  }).run();
  return "done";
}

/**
 * v1 gramReplaceInEditor (6801-6817): the document's text nodes joined with nothing between them, no-break spaces read as spaces; the first
 * exact occurrence of `original` is replaced by `replacement` in one transaction of its own, so Ctrl+Z undoes it as v1's insertText command
 * did. The replacement takes the formatting where the match starts. False when the words are not there (or `original` is empty).
 */
export function replaceFirstIn(editor: Editor, original: string, replacement: string): boolean {
  if (!original) return false;
  const nodes: Array<{ pos: number; s: number }> = [];
  let full = "";
  editor.state.doc.descendants((n, pos) => {
    if (n.isText) { nodes.push({ pos, s: full.length }); full += n.text ?? ""; }
    return true;
  });
  const idx = full.replace(/ /g, " ").indexOf(original);
  if (idx < 0) return false;
  // v1's locate (6809): the start in the last node that begins at or before it, the end in the last node that begins before it.
  const locate = (p: number, isEnd: boolean): number | null => {
    for (let k = nodes.length - 1; k >= 0; k--) { const n = nodes[k]!; if (p >= n.s && (!isEnd || p > n.s)) return n.pos + (p - n.s); }
    return null;
  };
  const from = locate(idx, false), to = locate(idx + original.length, true);
  if (from === null || to === null) return false;
  editor.chain().focus().command(({ tr }) => { closeHistory(tr); tr.insertText(replacement, from, to); return true; }).run();
  return true;
}

/** Ruling R12's open document: the editor's content replaced in one undoable step; its update event is what the editor's autosave stores. */
function setContentIn(editor: Editor, html: string): void {
  editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).setContent(html, { emitUpdate: true }).run();
}

/** The writing window's reads, as they stand when a call runs (a call can outlive the render that made it). */
type Live = {
  requestInsert: ProjectValue["requestInsert"];
  currentDoc: DocumentWithBody | null;
  projectId: string | null;
  editor: Editor | null;
  vault: Pick<VaultValue, "known" | "ensureUnlocked" | "decryptBody" | "encryptBody">;
};
const usable = (e: Editor | null): Editor | null => (e && !e.isDestroyed ? e : null);
/** The vault open when there is one; false when the student cancelled the unlock. */
const unlocked = async (v: Live["vault"]): Promise<boolean> => (await v.known()) === "off" || v.ensureUnlocked();

/** The calls in the writing window: on `editor` (the open document's, mounted even while the document is closed) and the shell's requestInsert. */
function writingAccess(editor: Editor | null, ref: { readonly current: Live }): DocAccess {
  const live = () => ref.current;
  /** Runs `fn` on the open document through requestInsert, answering its result, or `none` when the document did not open. */
  const onDoc = async <T,>(fn: (e: Editor) => T, none: T): Promise<T> => {
    let out = none;
    const ok = await live().requestInsert((e) => { out = fn(e); });
    return ok ? out : none;
  };
  return {
    text: () => { const e = usable(editor); return e ? docInnerText(e.getHTML()) : ""; },
    selection: () => { const e = usable(editor); return e ? selectionText(e) : ""; },
    insertText: (s) => onDoc((e) => { insertTextAtCursor(e, s); return true; }, false),
    insertBlock: (html) => onDoc((e) => { insertHtmlBlock(e, sanitizeHtml(html)); return true; }, false),
    wrapSelection: (tag, attrs) => onDoc<WrapResult>((e) => wrapSelectionIn(e, tag, attrs), "no-selection"),
    replaceInDocument: (original, replacement) => onDoc((e) => replaceFirstIn(e, original, replacement), false),
    async allDocuments() {
      try {
        const { projectId, vault } = live();
        if (!projectId || !(await unlocked(vault))) return [];
        // As the project export reads them (lib/export/projectExport.ts): the list, then each document opened in the browser; v1's order.
        const list = (await apiFetch<ExportDocSummary[]>(`/projects/${projectId}/documents`)).filter((d) => !d.deletedAt);
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const out: ProjectDocument[] = [];
        for (const s of list) {
          const title = await titleText(vault, s, s.id, UNTITLED);
          const { currentDoc, editor: open } = live();
          let html: string;
          const ed = currentDoc?.id === s.id ? usable(open) : null;
          if (ed) html = ed.getHTML();
          else {
            try { html = sanitizeHtml(await vault.decryptBody(await apiFetch<ExportDoc>(`/documents/${s.id}`))); } catch (e) {
              // One that does not open is left out, as the export leaves it out; the rest are still read.
              if (e instanceof VaultError) continue;
              throw e;
            }
          }
          out.push({ id: s.id, title, html, text: docInnerText(html) });
        }
        return out;
      } catch { return []; }
    },
    async rewriteDocument(id, html) {
      const clean = sanitizeHtml(html);
      if (live().currentDoc?.id === id) return onDoc((e) => { setContentIn(e, clean); return true; }, false);
      try {
        const { projectId, vault } = live();
        if (!projectId || !(await unlocked(vault))) return false;
        const doc = await apiFetch<DocumentWithBody>(`/documents/${id}`);
        // R5: a tool's scope is the project.
        if (doc.projectId !== projectId) return false;
        // The editor's autosave path (lib/useAutosave.ts): sealed under the document's key, counted in the browser, a new revision by PUT.
        const body = await sealBody(vault, { id, deks: doc.deks }, clean);
        await apiFetch(`/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
        return true;
      } catch { return false; }
    }
  };
}

/** The open document as a pop-out last heard it (ruling R10): "" before any snapshot, and only this project's. */
let mirror: { projectId: string | null; docId: string | null; text: string; selection: string } = { projectId: null, docId: null, text: "", selection: "" };

const isBool = (r: unknown): r is boolean => typeof r === "boolean";
const isWrap = (r: unknown): r is WrapResult => r === "done" || r === "no-selection" || r === "crosses-paragraph";
const isDocs = (r: unknown): r is ProjectDocument[] => Array.isArray(r) && r.every((d) => !!d && ["id", "title", "text", "html"].every((k) => typeof (d as Record<string, unknown>)[k] === "string"));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/**
 * The calls in a place's own window (ruling R10): text() and selection() read the mirror; every other call is posted to the writing window as a
 * request with an id and answers its reply. With no channel, no project, or no reply within DOC_REPLY_WAIT_MS it answers false /
 * "no-selection" / [] and says pop_nowin.
 */
function popoutAccess(projectId: string | null, t: (key: string) => string): DocAccess {
  const ask = <T,>(op: DocOp, args: unknown[], fallback: T, valid: (r: unknown) => r is T): Promise<T> => new Promise<T>((resolve) => {
    const nowin = () => { toast(t("pop_nowin")); resolve(fallback); };
    const c = syncChannel();
    if (!c || !projectId) { nowin(); return; }
    const id = newId();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onSyncMessage((m) => {
      const r = m as Partial<DocReplyMessage> | null;
      if (!r || r.type !== "doc-reply" || r.id !== id) return;
      clearTimeout(timer); off();
      resolve(valid(r.result) ? r.result : fallback);
    });
    timer = setTimeout(() => { off(); nowin(); }, DOC_REPLY_WAIT_MS);
    try { c.postMessage({ type: "doc-request", id, projectId, op, args } satisfies DocRequestMessage); } catch { clearTimeout(timer); off(); nowin(); }
  });
  const mine = () => mirror.projectId !== null && mirror.projectId === projectId;
  return {
    text: () => (mine() ? mirror.text : ""),
    selection: () => (mine() ? mirror.selection : ""),
    insertText: (s) => ask("insertText", [s], false, isBool),
    insertBlock: (html) => ask("insertBlock", [html], false, isBool),
    wrapSelection: (tag, attrs) => ask<WrapResult>("wrapSelection", [tag, attrs], "no-selection", isWrap),
    replaceInDocument: (original, replacement) => ask("replaceInDocument", [original, replacement], false, isBool),
    allDocuments: () => ask<ProjectDocument[]>("allDocuments", [], [], isDocs),
    rewriteDocument: (id, html) => ask("rewriteDocument", [id, html], false, isBool)
  };
}

/**
 * The tools' access to the student's document (Task G4). In the writing window it works on the open document's editor through the shell's
 * requestInsert; in a place's own window (`?window=1`) it says hello on the sync channel, mirrors the writing window's snapshots for text() and
 * selection(), and asks the writing window for everything else (ruling R10). See DocAccess for each call.
 */
export function useDocAccess(): DocAccess {
  const t = useT();
  const { requestInsert, currentDoc, projectId } = useProject();
  const { editor } = useSuggestion();
  const vault = useVault();
  const popout = isPopout();
  const live = useRef<Live>({ requestInsert, currentDoc, projectId, editor, vault });
  useEffect(() => { live.current = { requestInsert, currentDoc, projectId, editor, vault }; });
  useEffect(() => {
    if (!popout || !projectId) return;
    const off = onSyncMessage((m) => {
      const s = m as Partial<DocSnapshotMessage> | null;
      if (!s || s.type !== "doc-snapshot" || s.projectId !== projectId || typeof s.text !== "string" || typeof s.selection !== "string") return;
      mirror = { projectId, docId: typeof s.docId === "string" ? s.docId : null, text: s.text, selection: s.selection };
    });
    try { syncChannel()?.postMessage({ type: "doc-hello" } satisfies DocHelloMessage); } catch { /* a closed channel: text() stays "" until a snapshot comes */ }
    return off;
  }, [popout, projectId]);
  // eslint-disable-next-line react-hooks/refs -- the ref is read only inside the calls, which run after a render, never during one
  return useMemo(() => (popout ? popoutAccess(projectId, t) : writingAccess(editor, live)), [popout, projectId, t, editor]);
}

const OPS: readonly DocOp[] = ["insertText", "insertBlock", "wrapSelection", "replaceInDocument", "allDocuments", "rewriteDocument"];
const isStr = (v: unknown): v is string => typeof v === "string";
const isAttrs = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isStr);

/** A pop-out's request run here, its arguments checked first (they arrive from another window); a malformed one answers its fallback. */
async function answer(a: DocAccess, op: DocOp, x: unknown[]): Promise<unknown> {
  switch (op) {
    case "insertText": return isStr(x[0]) ? a.insertText(x[0]) : false;
    case "insertBlock": return isStr(x[0]) ? a.insertBlock(x[0]) : false;
    case "wrapSelection": return (x[0] === "stat-tag" || x[0] === "qual-tag") && isAttrs(x[1]) ? a.wrapSelection(x[0], x[1]) : "no-selection";
    case "replaceInDocument": return isStr(x[0]) && isStr(x[1]) ? a.replaceInDocument(x[0], x[1]) : false;
    case "allDocuments": return a.allDocuments();
    case "rewriteDocument": return isStr(x[0]) && isStr(x[1]) ? a.rewriteDocument(x[0], x[1]) : false;
  }
}
const FALLBACK: Record<DocOp, unknown> = { insertText: false, insertBlock: false, wrapSelection: "no-selection", replaceInDocument: false, allDocuments: [], rewriteDocument: false };

/**
 * The writing window's side of ruling R10, mounted once by the project shell: a snapshot of the open document (its project, id, text and
 * selection) when a pop-out says hello, when the editor changes (another document opens) and SNAPSHOT_DEBOUNCE_MS after each change to its text
 * or selection; and each pop-out request of this project run here through useDocAccess, then answered by id. A pop-out does not answer.
 */
export function useDocAccessHost(): void {
  const access = useDocAccess();
  const { projectId, currentDoc } = useProject();
  const { editor } = useSuggestion();
  const ref = useRef({ access, projectId, docId: currentDoc?.id ?? null });
  useEffect(() => { ref.current = { access, projectId, docId: currentDoc?.id ?? null }; });
  const post = useCallback(() => {
    const { access: a, projectId: p, docId } = ref.current;
    try { syncChannel()?.postMessage({ type: "doc-snapshot", projectId: p, docId, text: a.text(), selection: a.selection() } satisfies DocSnapshotMessage); } catch { /* no pop-out hears it */ }
  }, []);
  useEffect(() => {
    if (isPopout()) return;
    post();
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { clearTimeout(timer); timer = setTimeout(post, SNAPSHOT_DEBOUNCE_MS); };
    editor.on("transaction", changed);
    return () => { editor.off("transaction", changed); clearTimeout(timer); };
  }, [editor, post]);
  useEffect(() => {
    if (isPopout()) return;
    return onSyncMessage((m) => {
      if ((m as { type?: unknown } | null)?.type === "doc-hello") { post(); return; }
      const r = m as Partial<DocRequestMessage> | null;
      if (!r || r.type !== "doc-request" || typeof r.id !== "string" || !OPS.includes(r.op as DocOp)) return;
      // A pop-out of another project is not this window's to answer.
      if (!ref.current.projectId || r.projectId !== ref.current.projectId) return;
      const op = r.op as DocOp, id = r.id;
      void answer(ref.current.access, op, Array.isArray(r.args) ? r.args : []).catch(() => FALLBACK[op]).then((result) => {
        try { syncChannel()?.postMessage({ type: "doc-reply", id, result } satisfies DocReplyMessage); } catch { /* the pop-out's wait runs out */ }
      });
    });
  }, [post]);
}

/** The project shell mounts this once in the writing window (useDocAccessHost). */
export function DocAccessHost(): null {
  useDocAccessHost();
  return null;
}
