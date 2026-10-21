"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { docInnerText, sanitizeHtml } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { VaultError } from "@/lib/vault/crypto";
import type { ExportDoc, ExportDocSummary } from "@/lib/vault/export";
import { titleText, UNTITLED } from "@/lib/vault/titles";
import { useVault, type VaultValue } from "@/lib/vault/useVault";
import { onSyncMessage, syncChannel, type DocAckMessage, type DocHelloMessage, type DocOp, type DocReplyMessage, type DocRequestMessage, type DocSnapshotMessage } from "@/lib/popout/channel";
import { isPopout } from "@/lib/popout/mode";
import { toast } from "@/components/ui/toast";
import { useProject, type DocumentWithBody, type ProjectValue } from "@/components/frame/ProjectContext";
import { heldDocs, sealBody } from "@/lib/useAutosave";
import { insertHtmlBlock, insertPlainHtml, insertTextAtCursor, insertTextAtEnd, markCursorPlaced, selectionText } from "./insert";

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
/**
 * Where an insert goes (ruling R29). "end": after everything written, on a new line, whatever the cursor is doing (v1 insertIntoEditor(text,
 * false), 4195-4201). "cursor": at the cursor once the student has placed one, else at the end (v1 insertIntoEditor's savedRange rule and
 * insertHTMLBlockIntoEditor, 4228-4244).
 */
export type InsertAt = { at?: "end" | "cursor" };
/** One document of the project as a tool reads it: its opened title, its HTML, and its text as v1's getEditorText reads it (docInnerText). */
export type ProjectDocument = { id: string; title: string; text: string; html: string };

/** What useDocAccess gives a tool. The names and signatures are the contract five tool sessions build on. */
export type DocAccess = {
  /** The whole open document as v1's getEditorText (3151): innerText of the editor, core's docInnerText of its HTML (ruling R9); "" with none. */
  text(): string;
  /** v1's selText as the helpers read it (5554, lib/ai/actions.ts helperText): the selected text, paragraphs separated by a newline, else "". */
  selection(): string;
  /**
   * Plain text, escaped, each newline a line break (v1 insertIntoEditor 4195-4202). Default "cursor": at the placed cursor, else at the end on a
   * new line (insertTextAtCursor, v1 citInsertAtCursor 7481-7487). `{ at: "end" }`: at the end on a new line whatever the cursor (v1
   * insertIntoEditor(text, false), as statsInsert 12024 calls it).
   */
  insertText(s: string, opts?: InsertAt): Promise<boolean>;
  /**
   * Markup the tool built, sanitised, no provenance mark. Default "end" (ruling R29): after everything written, as v1's tools put their results
   * (insertIntoEditor(text, false): statsInsert 12024, protoGenerate 5973, ecStatement 6043, ecGenerateConsent 6066). `{ at: "cursor" }`: v1
   * insertHTMLBlockIntoEditor's rule (4228-4244, insertHtmlBlock): at the cursor once the student has placed one, else at the end (the charts:
   * 4357, 4555, 4823, 4943).
   */
  insertBlock(html: string, opts?: InsertAt): Promise<boolean>;
  /**
   * v1's qualTagSelection (6245-6263) for either tag: the selection wrapped in `<span class="<tag>" …attrs>` as one undoable step;
   * "crosses-paragraph" where v1's surroundContents throws (a selection across blocks, or partly over another tag).
   */
  wrapSelection(tag: ToolTag, attrs: Record<string, string>): Promise<WrapResult>;
  /** v1's gramReplaceInEditor (6801-6817): the first occurrence of `original` in the document's text replaced, undoable with Ctrl+Z. */
  replaceInDocument(original: string, replacement: string): Promise<boolean>;
  /** Every live (not deleted) document of this project, decrypted, in creation order; the open one as the editor holds it now. [] when unreadable. */
  allDocuments(): Promise<ProjectDocument[]>;
  /**
   * Replaces a document's text: the open one in its editor (one undoable step, saved by its autosave), any other sealed and written as a new
   * revision (ruling R12). False for a deleted document, and for one whose unsaved text this tab holds (ruling R30: it would overwrite this later).
   */
  rewriteDocument(id: string, html: string): Promise<boolean>;
};

/**
 * How long a pop-out waits for the writing window to take a request (rulings R10, R28): with no ack or reply by then it answers its fallback and
 * says pop_nowin. Once acked, it waits for the reply as long as the writing window takes.
 */
export const DOC_REPLY_WAIT_MS = 10_000;
/** How long the writing window lets the document rest before it sends a pop-out a new snapshot (ruling R10, debounced). */
export const SNAPSHOT_DEBOUNCE_MS = 300;

/**
 * v1 qualTagSelection (6245-6263) over the editor's marks: an empty selection is "no-selection" (v1's toast at 6248); a selection that does not
 * sit inside one paragraph, heading or list item paragraph is "crosses-paragraph" (surroundContents throws there, 6257), and so is one that
 * partly overlaps another tag (a class span that neither covers the whole selection nor lies wholly inside it: surroundContents throws on a
 * partly selected element too; ruling R30). Otherwise the selection
 * gets the classSpan mark `<span class="<tag>">` with the `data-*` attributes and the `title` of `attrs` (the attributes the editor keeps on a
 * span; any other, a `style` among them, is dropped, so no code colour is written into the document: ruling R4), as one undoable step, and the
 * cursor ends after it (6258-6259). A second tag over the same words nests; a tag over a whole span is its outer element.
 */
export function wrapSelectionIn(editor: Editor, tag: ToolTag, attrs: Record<string, string>): WrapResult {
  const { selection, schema } = editor.state;
  if (selection.empty) return "no-selection";
  const { $from, $to, from, to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return "crosses-paragraph";
  const runs = spanRuns($from.parent, $from.start()).filter((r) => r.from < to && r.to > from);
  const covers = (r: SpanRun) => r.from <= from && r.to >= to;
  const inside = (r: SpanRun) => r.from >= from && r.to <= to;
  if (runs.some((r) => !covers(r) && !inside(r))) return "crosses-paragraph";
  // Spans wholly inside the selection go back on after the new one, so the new tag is their outer element (one span, as surroundContents makes).
  const within = runs.filter((r) => inside(r) && !covers(r));
  const data: Record<string, string> = {};
  let title: string | null = null;
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-")) data[k] = v;
    else if (k === "title") title = v;
  }
  const mark = schema.marks.classSpan!.create({ class: tag, data, title });
  editor.chain().focus().command(({ tr }) => {
    closeHistory(tr);
    for (const r of within) tr.removeMark(r.from, r.to, r.mark);
    tr.addMark(from, to, mark);
    for (const r of within) tr.addMark(r.from, r.to, r.mark);
    tr.setSelection(TextSelection.create(tr.doc, to));
    return true;
  }).run();
  return "done";
}

/** One class span of a textblock: its mark and its extent. */
type SpanRun = { mark: Mark; from: number; to: number };
/**
 * The class spans (tags, AI inserts, any v1 semantic span) of the textblock `parent`, its content starting at `start`, in document order and,
 * within a node, outer first. A span's extent is its run of adjacent inline nodes carrying an equal mark, as the DOM serialises it into one element.
 */
function spanRuns(parent: PMNode, start: number): SpanRun[] {
  const runs: SpanRun[] = [];
  let open: SpanRun[] = [];
  parent.forEach((child, offset) => {
    const a = start + offset, b = a + child.nodeSize;
    const spans = child.marks.filter((m) => m.type.name === "classSpan");
    const next: typeof runs = [];
    for (const m of spans) {
      const run = open.find((r) => r.to === a && r.mark.eq(m));
      if (run) { run.to = b; next.push(run); } else { const r = { mark: m, from: a, to: b }; runs.push(r); next.push(r); }
    }
    open = next;
  });
  return runs;
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
  const idx = full.replace(/\u00a0/g, " ").indexOf(original);
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
    insertText: (s, opts) => onDoc((e) => { if (opts?.at === "end") insertTextAtEnd(e, s); else insertTextAtCursor(e, s); return true; }, false),
    insertBlock: (html, opts) => onDoc((e) => {
      const clean = sanitizeHtml(html);
      if (opts?.at === "cursor") insertHtmlBlock(e, clean);
      // v1 insertIntoEditor(text, false) keeps the caret after what it put in (4220-4225), so a later cursor insert follows it.
      else { insertPlainHtml(e, clean, { atEnd: true }); markCursorPlaced(e); }
      return true;
    }, false),
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
        // Text of that document this tab could not save is held, and goes in when it opens again: it would overwrite the rewrite (R30).
        if (!projectId || heldDocs.has(id) || !(await unlocked(vault))) return false;
        const doc = await apiFetch<DocumentWithBody & { deletedAt?: string | null }>(`/documents/${id}`);
        // R5: a tool's scope is the project; a deleted document is not rewritten (the api answers 404 for one too).
        if (doc.projectId !== projectId || doc.deletedAt) return false;
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
 * request with an id and answers its reply. With no channel, no project, or neither an ack nor a reply within DOC_REPLY_WAIT_MS it answers
 * false / "no-selection" / [] and says pop_nowin; after the writing window's ack (ruling R28) it waits for the reply with no short timeout.
 */
function popoutAccess(projectId: string | null, t: (key: string) => string): DocAccess {
  const ask = <T,>(op: DocOp, args: unknown[], fallback: T, valid: (r: unknown) => r is T): Promise<T> => new Promise<T>((resolve) => {
    const nowin = () => { toast(t("pop_nowin")); resolve(fallback); };
    const c = syncChannel();
    if (!c || !projectId) { nowin(); return; }
    const id = newId();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onSyncMessage((m) => {
      const r = m as Partial<DocReplyMessage> | Partial<DocAckMessage> | null;
      if (!r || r.id !== id) return;
      // Taken: the write may wait on the passphrase prompt, so no short timeout from here (R28).
      if (r.type === "doc-ack") { clearTimeout(timer); return; }
      if (r.type !== "doc-reply" || !("result" in r)) return;
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
    insertText: (s, opts) => ask("insertText", opts ? [s, opts] : [s], false, isBool),
    insertBlock: (html, opts) => ask("insertBlock", opts ? [html, opts] : [html], false, isBool),
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
/** An insert's optional position (R29): absent, or an object whose `at`, when given, is "end" or "cursor". */
const isAt = (v: unknown): v is InsertAt | undefined => v === undefined || (!!v && typeof v === "object" && !Array.isArray(v) && [undefined, "end", "cursor"].includes((v as InsertAt).at));

/**
 * A pop-out's request with its arguments checked (they arrive from another window): the call to run, or null when they are malformed (the
 * request is then answered with its fallback at once, never acked).
 */
function accept(a: DocAccess, op: DocOp, x: unknown[]): (() => Promise<unknown>) | null {
  switch (op) {
    case "insertText": { const [s, at] = x; return isStr(s) && isAt(at) ? () => a.insertText(s, at) : null; }
    case "insertBlock": { const [html, at] = x; return isStr(html) && isAt(at) ? () => a.insertBlock(html, at) : null; }
    case "wrapSelection": { const [tag, attrs] = x; return (tag === "stat-tag" || tag === "qual-tag") && isAttrs(attrs) ? () => a.wrapSelection(tag, attrs) : null; }
    case "replaceInDocument": { const [o, r] = x; return isStr(o) && isStr(r) ? () => a.replaceInDocument(o, r) : null; }
    case "allDocuments": return () => a.allDocuments();
    case "rewriteDocument": { const [id, html] = x; return isStr(id) && isStr(html) ? () => a.rewriteDocument(id, html) : null; }
  }
}
const FALLBACK: Record<DocOp, unknown> = { insertText: false, insertBlock: false, wrapSelection: "no-selection", replaceInDocument: false, allDocuments: [], rewriteDocument: false };

/**
 * The writing window's side of ruling R10, mounted once by the project shell: a snapshot of the open document (its project, id, text and
 * selection) when a pop-out says hello, when the editor changes (another document opens) and SNAPSHOT_DEBOUNCE_MS after each change to its text
 * or selection; and each pop-out request of this project, its arguments checked, acked at once (ruling R28), run here through useDocAccess and
 * then answered by id. A pop-out does not answer.
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
      const reply = (result: unknown) => {
        try { syncChannel()?.postMessage({ type: "doc-reply", id, result } satisfies DocReplyMessage); } catch { /* the pop-out's wait runs out */ }
      };
      const run = accept(ref.current.access, op, Array.isArray(r.args) ? r.args : []);
      if (!run) { reply(FALLBACK[op]); return; }
      // Taken (R28): the pop-out stops its 10 s wait, since running may wait on the passphrase and the document's editor.
      try { syncChannel()?.postMessage({ type: "doc-ack", id } satisfies DocAckMessage); } catch { /* the reply still comes */ }
      void run().catch(() => FALLBACK[op]).then(reply);
    });
  }, [post]);
}

/** The project shell mounts this once in the writing window (useDocAccessHost). */
export function DocAccessHost(): null {
  useDocAccessHost();
  return null;
}
