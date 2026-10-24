"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import { toast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n";
import { captionHtml, hasCaptionAbove, noteHtml, renumberCaptions, topLevelBlockPos } from "@/lib/editor/captions";
import { cursorPlaced, markCursorPlaced } from "@/lib/editor/insert";
import { fitsBudget, sizeMessageKey } from "@/lib/editor/sizeBudget";
import { newStudioId, onPhotoMessage, photoChannel, postPhoto, studioHref, type PhotoDone, type SavedReason } from "@/lib/popout/photoChannel";
import { useVault } from "@/lib/vault/useVault";

/*
 * The writing window's half of the photo studio (R1 section 3; v1 psOpen 4589-4597, the channel handlers 4598-4612, picApplyResult 4570, picInsertNew 4580).
 * The studio is a window of its own (/photo-studio, ruling P7): this hands it one picture over the appu_photo channel, and puts what it sends back in the
 * document. The studio never writes a document; every write happens here, through the editor, so the vault seals it with the rest of the body.
 */

/** v1's window (psOpen 4595). */
const FEATURES = "popup=yes,width=1280,height=860";
/** v1 picInsertNew (4583): a picture put in new is 360 px wide. */
const NEW_WIDTH = 360;

/** What is remembered of one open studio window (v1's PSMAIN[id] = {el}). */
type Rec = {
  /** The document the window was opened from. A result is put in this editor or in none: never in the one open now if it is another. Null when none was open. */
  editor: Editor | null;
  /** The picture's position now, the one it had when the window opened moved through every transaction since; null when the studio was opened empty. */
  pos: number | null;
  /** The picture's src when the window opened: what the position is checked against, and what is looked for if the position cannot be followed. */
  src: string;
  /** How many pictures had that src when the window opened: the src is looked for only when it named one picture, so a copy is never taken for it. */
  copies: number;
  /** Stops following the editor. */
  stop(): void;
};

/** The pictures of a document whose src is `src`, by position. */
function withSrc(doc: PMNode, src: string): number[] {
  const out: number[] = [];
  doc.descendants((n, pos) => { if (n.type.name === "image" && n.attrs.src === src) out.push(pos); return true; });
  return out;
}

/**
 * Where the picture at `pos` (a one-token node) is after `tr`, both its ends mapped inwards: moved with what was put in or taken out around it, kept when
 * its markup was set (its width or alt: a leaf replaced in place maps onto itself), null once it was deleted, so a copy that slides into its place is never
 * taken for it.
 */
function followed(tr: Transaction, pos: number): number | null {
  const from = tr.mapping.map(pos, 1);
  return tr.mapping.map(pos + 1, -1) - from === 1 ? from : null;
}

/**
 * The position of the picture a record stands for, or null if it is gone (the result then goes in new, v1 picInsertNew): where it was followed to, else,
 * when the document was rewritten under it, the one picture with its src, only if it was and is the only one (two identical pictures are never guessed at).
 */
function locate(rec: Rec): number | null {
  const doc = rec.editor?.state.doc;
  if (!doc || !rec.src) return null;
  const same = (n: PMNode | null) => n?.type.name === "image" && n.attrs.src === rec.src;
  if (rec.pos !== null && rec.pos < doc.content.size && same(doc.nodeAt(rec.pos))) return rec.pos;
  const now = withSrc(doc, rec.src);
  rec.pos = rec.copies === 1 && now.length === 1 ? now[0]! : null;
  return rec.pos;
}

/**
 * v1 insertHTMLBlockIntoEditor's place (4228-4244): at the cursor when the student has put one in this document, else after everything written. After a selected
 * passage rather than over it (insertHTML replaced it in v1), so a picture or a passage the student has selected is never lost to a result.
 */
function insertionPoint(editor: Editor): number {
  const { doc, selection } = editor.state;
  return cursorPlaced(editor) ? selection.to : Selection.atEnd(doc).to;
}

/**
 * v1 picApplyResult (4570-4580) and picInsertNew (4580-4588). The picture is replaced where it is (`pos`), keeping its width and alt and setting data-edits
 * (an empty log leaves the old one, as v1 only sets it when there is one), or put in new at the cursor. When the caption box is ticked and none sits above the
 * picture the caption goes above its block and the note below, the picture's alt becomes the title, and the numbers are set again.
 * The caption is checked before anything is written, so a picture and its caption go in as two steps at most.
 */
function putPicture(editor: Editor, pos: number | null, m: PhotoDone): void {
  const title = m.title.trim();
  const note = m.note.trim();
  const at = pos ?? insertionPoint(editor);
  const caption = m.capOn && !hasCaptionAbove(editor, at);
  let image = -1;
  editor.chain().command(({ tr, state }) => {
    const { image: type } = state.schema.nodes;
    if (pos !== null) {
      const attrs = tr.doc.nodeAt(pos)!.attrs;
      tr.setNodeMarkup(pos, undefined, { ...attrs, src: m.src, edits: m.edits || attrs.edits || null, ...(caption && title ? { alt: title } : {}) });
      image = pos;
    } else {
      tr.insert(at, type!.create({ src: m.src, width: NEW_WIDTH, edits: m.edits || null, ...(caption && title ? { alt: title } : {}) }));
      // The picture is somewhere in what was just put in: at `at`, or one in if a paragraph had to be made for it.
      tr.doc.nodesBetween(at, tr.mapping.map(at, 1), (n, p) => {
        if (image < 0 && n.type.name === "image" && n.attrs.src === m.src) image = p;
        return image < 0;
      });
    }
    return true;
  }).run();
  if (pos === null) markCursorPlaced(editor);
  if (!caption || image < 0) return;
  // Above the picture's block and the note below, as the Caption dialog does, but the student's cursor stays where it is (v1 never moved it). v1's
  // capBlocksHTML takes an empty title too: the label alone (it is the Caption dialog that wants a title, v1 capInsert).
  const block = topLevelBlockPos(editor, image);
  const chain = editor.chain();
  if (note) chain.insertContentAt(block + (editor.state.doc.nodeAt(block)?.nodeSize ?? 0), noteHtml(note), { updateSelection: false });
  chain.insertContentAt(block, captionHtml("figure", title), { updateSelection: false }).run();
  renumberCaptions(editor);
}

/**
 * The writing window's end of the photo studio. `openStudio(pos)` opens the studio on the picture at `pos` (a position of the editor's document), or empty
 * with null, and says what happened so the caller can fall back to the small editor: "no-channel" (this browser has no BroadcastChannel: show ps_nochan) or
 * "blocked" (the pop-up was blocked: show pop_blocked). While mounted it answers the studio's messages, for the ids it opened only.
 * A result goes to the editor the window was opened from, and only while that editor is the one this hook has: if the document was closed, locked or
 * switched, nothing is written and the studio is told so.
 */
export function usePhotoStudioHost(editor: Editor | null): { openStudio(pos: number | null): "opened" | "blocked" | "no-channel" } {
  const t = useT();
  const { status } = useVault();
  // With a vault the body is sealed whenever it is saved, so the sealed limit applies (lib/editor/sizeBudget.ts); "loading" is taken as sealed, the stricter.
  const vaultOn = status !== "off";
  const ref = useRef({ editor, vaultOn, t });
  useEffect(() => { ref.current = { editor, vaultOn, t }; }, [editor, vaultOn, t]);
  const records = useRef(new Map<string, Rec>());

  const drop = useCallback((id: string) => {
    records.current.get(id)?.stop();
    records.current.delete(id);
  }, []);

  useEffect(() => {
    const recs = records.current;
    const off = onPhotoMessage((m) => {
      const rec = recs.get(m.id);
      if (!rec) return;
      const now = ref.current;
      // Still the document the window was opened from (a switch builds another editor; a closed or locked one has none or is destroyed).
      const open = rec.editor !== null && rec.editor === now.editor && !rec.editor.isDestroyed;
      if (m.t === "ready") {
        const pos = open ? locate(rec) : null;
        // The studio takes only a data:image picture; any other (an https one) opens it empty, for the student to open from a file.
        const src = pos === null || !rec.src.startsWith("data:image/") ? "" : rec.src;
        postPhoto({ t: "load", id: m.id, src, capExists: src ? hasCaptionAbove(rec.editor!, pos!) : false });
      } else if (m.t === "cancel") {
        drop(m.id);
      } else if (m.t === "done") {
        const refuse = (reason: SavedReason) => postPhoto({ t: "saved", id: m.id, ok: false, reason });
        // It can never succeed, so the record (and its picture) is let go.
        if (!open) { refuse("no-document"); drop(m.id); return; }
        const editor = rec.editor!;
        const pos = locate(rec);
        // What the write adds to the body: the whole picture put in new, the difference when one is replaced.
        const growth = m.src.length - (pos === null ? 0 : rec.src.length);
        if (!fitsBudget(editor, growth, now.vaultOn)) {
          // The record stays: the studio can shrink the picture and press Done again.
          refuse("too-large");
          toast(now.t(sizeMessageKey));
          return;
        }
        let ok = true;
        try { putPicture(editor, pos, m); } catch { ok = false; }
        postPhoto(ok ? { t: "saved", id: m.id, ok: true } : { t: "saved", id: m.id, ok: false });
        toast(now.t(ok ? "ie_done" : "ie_fail"));
        try { window.focus(); } catch { /* v1's try */ }
        drop(m.id);
      }
    });
    return () => {
      off();
      for (const rec of recs.values()) rec.stop();
      recs.clear();
    };
  }, [drop]);

  const openStudio = useCallback((pos: number | null): "opened" | "blocked" | "no-channel" => {
    if (!photoChannel()) return "no-channel";
    const id = newStudioId();
    const w = window.open(studioHref(id), "appu_photo_" + id, FEATURES);
    if (!w) return "blocked";
    const ed = ref.current.editor;
    const node = ed !== null && pos !== null && 0 <= pos && pos < ed.state.doc.content.size ? ed.state.doc.nodeAt(pos) : null;
    const isImage = node?.type.name === "image";
    const src = isImage ? String(node!.attrs.src ?? "") : "";
    const rec: Rec = { editor: ed, pos: isImage ? pos : null, src, copies: ed && src ? withSrc(ed.state.doc, src).length : 0, stop: () => {} };
    if (ed && rec.pos !== null) {
      // Every transaction since the window opened moves the picture's position, and so do the ones a plugin appends to it.
      const follow = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions: Transaction[] }) => {
        for (const tr of [transaction, ...appendedTransactions]) if (rec.pos !== null) rec.pos = followed(tr, rec.pos);
      };
      ed.on("transaction", follow);
      rec.stop = () => ed.off("transaction", follow);
    }
    records.current.set(id, rec);
    try { w.focus(); } catch { /* v1's try */ }
    return "opened";
  }, []);

  return useMemo(() => ({ openStudio }), [openStudio]);
}
