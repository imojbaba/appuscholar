"use client";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { captionHtml, hasCaptionAbove, noteHtml, renumberCaptions, topLevelBlockPos } from "@/lib/editor/captions";
import {
  BG_COLORS, HINT_KEY, NO_FIELDS, bake, commit, drawLoaded, freshWork, locateImage, reset, toggleMode, turn, typedRect, undo,
  type Mode, type RectFields, type Work,
} from "@/lib/editor/pictureEditorState";
import { MIN_DRAG, adjustedCopy, editsString, exportDataUrl, isDrag, maskNote, normalizeRect, type Canvas, type Point, type Rect } from "@/lib/editor/pictureOps";
import { fitsBudget, sizeMessageKey } from "@/lib/editor/sizeBudget";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";

/**
 * v1's "Edit picture" dialog (#imgEditDlg 1411-1443; ieOpenFor 4404, ieCommit 4463, the pointer model 4482, ieApply 4517), on the selected picture
 * (a NodeSelection on an image; the toolbar button that opens it is FormatBar's). The Loader is mounted only while the dialog is open, so the picture
 * and its place are taken afresh each time. Everything happens on this device: the edited picture goes back into the document through the editor,
 * and the existing autosave carries it (sealed with the rest of the body when there is a vault).
 */
export function PictureEditor({ open, onOpenChange, editor, onOpenStudio }: { open: boolean; onOpenChange(open: boolean): void; editor: Editor; onOpenStudio(): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="picture-editor">
        {open && <Loader editor={editor} onClose={() => onOpenChange(false)} onOpenStudio={onOpenStudio} />}
      </DialogContent>
    </Dialog>
  );
}

/** The picture being edited, as it was when the dialog opened. */
type Target = { pos: number; src: string };

function readTarget(editor: Editor): Target | null {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== "image") return null;
  return { pos: sel.from, src: String(sel.node.attrs.src ?? "") };
}

type Props = { editor: Editor; onClose(): void; onOpenStudio(): void };

/** Loads the selected picture onto a working canvas (v1 ieOpenFor); a picture that cannot be read says ie_fail and closes, as v1 did before it opened. */
function Loader({ editor, onClose, onOpenStudio }: Props) {
  const t = useT();
  const [target] = useState(() => readTarget(editor));
  const [loaded, setLoaded] = useState<{ base: Canvas; wasPng: boolean } | null>(null);
  // Where the picture is now: the remembered place, followed from the moment the dialog opened (the load included) through every change to the document,
  // the transactions a plugin appends too, both its ends mapped inwards so a deleted picture is -1 and an identical copy that slides into its place is not it.
  const posRef = useRef(target?.pos ?? -1);
  useEffect(() => {
    const follow = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions: Transaction[] }) => {
      for (const tr of [transaction, ...appendedTransactions]) {
        if (posRef.current < 0) return;
        const from = tr.mapping.map(posRef.current, 1);
        posRef.current = tr.mapping.map(posRef.current + 1, -1) - from === 1 ? from : -1;
      }
    };
    editor.on("transaction", follow);
    return () => { editor.off("transaction", follow); };
  }, [editor]);
  const fail = useRef(() => {});
  useEffect(() => { fail.current = () => { toast(t("ie_fail")); onClose(); }; });
  useEffect(() => {
    if (!target) { fail.current(); return; }
    let live = true;
    const im = new Image();
    im.onload = () => {
      if (!live) return;
      try { setLoaded({ base: drawLoaded(im), wasPng: /^data:image\/png/.test(target.src) }); } catch { fail.current(); }
    };
    im.onerror = () => { if (live) fail.current(); };
    im.src = target.src;
    return () => { live = false; im.onload = null; im.onerror = null; };
  }, [target]);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("ie_h")}</DialogTitle>
        <DialogDescription>{t("ie_desc")}</DialogDescription>
      </DialogHeader>
      {target && loaded && <Workbench editor={editor} target={target} posRef={posRef} loaded={loaded} onClose={onClose} onOpenStudio={onOpenStudio} />}
    </>
  );
}

const MODES: readonly (readonly [Exclude<Mode, "">, string])[] = [["crop", "ie_crop"], ["bar", "ie_bar"], ["pix", "ie_pix"], ["bg", "ie_bg"]];
const FIELDS: readonly (readonly [keyof RectFields, string])[] = [["x", "pic_rect_x"], ["y", "pic_rect_y"], ["w", "pic_rect_w"], ["h", "pic_rect_h"]];

function Workbench({ editor, target, posRef, loaded, onClose, onOpenStudio }: Props & { target: Target; posRef: { current: number }; loaded: { base: Canvas; wasPng: boolean } }) {
  const t = useT();
  const id = useId();
  const vaultOn = useVault().status !== "off";
  // One Work value, swapped for the next on every step. The ref is what the pointer handlers and Apply read, so a step is never based on a stale render.
  const [work, setWork] = useState<Work>(() => freshWork(loaded.base));
  const workRef = useRef(work);
  const [tooBig, setTooBig] = useState(false);
  function put(w: Work) { workRef.current = w; setWork(w); setTooBig(false); }

  // Closed (Cancel, Esc, the studio button) while Apply was still exporting: nothing is written then.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ a: Point; b: Point } | null>(null);
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);
  function setDragBoth(d: { a: Point; b: Point } | null) { dragRef.current = d; setDrag(d); }
  const [fields, setFields] = useState<RectFields>(NO_FIELDS);
  const { width: cw, height: ch } = work.base;
  const dragRect = useMemo(() => (drag ? normalizeRect(drag.a, drag.b, cw, ch) : null), [drag, cw, ch]);
  const typed = useMemo(() => typedRect(fields, cw, ch), [fields, cw, ch]);
  // The sliders' live preview. The base is only ever drawn into in place after the sliders were baked into a new canvas (or while they are at 0 and there is no preview), so it is never stale.
  const adjusted = useMemo(() => adjustedCopy(work.base, work.br, work.co), [work.base, work.br, work.co]);

  // v1 ieRender (4438): the picture with the sliders applied, and the dashed rose box of a drag (an oval for the plain background).
  useEffect(() => {
    const cv = cvRef.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const src = adjusted ?? work.base;
    if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(src, 0, 0);
    const r = work.mode ? (dragRect ?? typed) : null;
    if (!r) return;
    g.save();
    g.lineWidth = Math.max(2, cv.width / 200);
    g.strokeStyle = "#f43f5e";
    g.setLineDash([8, 6]);
    if (work.mode === "bg") {
      g.beginPath();
      g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      g.stroke();
    } else g.strokeRect(r.x, r.y, r.w, r.h);
    g.restore();
  }, [work.base, work.mode, adjusted, dragRect, typed]);

  /** A canvas pixel under the pointer: the page position scaled by the canvas size over the size it is shown at (v1 pt 4484). */
  function point(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    return { x: r.width ? ((e.clientX - r.left) * cv.width) / r.width : 0, y: r.height ? ((e.clientY - r.top) * cv.height) / r.height : 0 };
  }
  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!workRef.current.mode || e.button > 0) return;
    const p = point(e);
    setDragBoth({ a: p, b: p });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no pointer capture here: the drag still works inside the canvas */ }
    e.preventDefault();
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) setDragBoth({ a: dragRef.current.a, b: point(e) });
  }
  function up(e: ReactPointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    if (!d) return;
    setDragBoth(null);
    const r = normalizeRect(d.a, point(e), workRef.current.base.width, workRef.current.base.height);
    if (isDrag(r)) run(r);
  }
  /** A drag and the typed box both end here, so they do the same thing. */
  function run(r: Rect) {
    put(commit(workRef.current, r));
    setFields(NO_FIELDS);
  }

  const [capOn, setCapOn] = useState(false);
  const [capTitle, setCapTitle] = useState("");
  const [capNote, setCapNote] = useState("");
  const [capExists] = useState(() => hasCaptionAbove(editor, locateImage(editor.state.doc, posRef.current, target.src) ?? target.pos));
  /** v1 ieCapToggle (4497): ticking fills an empty note with the sentence for each way the face was hidden. */
  function tick(on: boolean) {
    setCapOn(on);
    if (on && !capNote) setCapNote(maskNote(workRef.current.log, t));
  }

  const busy = useRef(false);
  const [applying, setApplying] = useState(false);
  /**
   * v1 ieApply (4517): bake the sliders, export, put the picture back, add the caption when asked, renumber, close. The size check comes before anything is
   * written; over the limit, the message shows and nothing changes. An empty title gives the bare "Figure N" label, as v1's capBlocksHTML does (4529-4533),
   * and leaves the alt alone; the photo studio's result does the same (lib/editor/photoStudioHost.ts).
   */
  async function use() {
    if (busy.current) return;
    const title = capTitle.trim();
    // On one line, as the Caption dialog puts them (a typed line break would not survive a reload).
    const note = capNote.replace(/\s+/g, " ").trim();
    const wantCaption = capOn && !capExists;
    busy.current = true;
    setApplying(true);
    try {
      const w = bake(workRef.current);
      put(w);
      const src = await exportDataUrl(w.base, loaded.wasPng);
      if (!alive.current) return;
      const pos = locateImage(editor.state.doc, posRef.current, target.src);
      if (pos === null) { toast(t("ie_fail")); onClose(); return; }
      const node = editor.state.doc.nodeAt(pos)!;
      const captionChars = wantCaption ? captionHtml("figure", title).length + noteHtml(note).length : 0;
      if (!fitsBudget(editor, src.length - String(node.attrs.src).length + captionChars, vaultOn)) { setTooBig(true); return; }
      // v1 sets data-edits only when something was done; an earlier note stays as it was otherwise.
      const edits = editsString(w.log);
      editor.chain().command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src, ...(edits ? { edits } : {}), ...(wantCaption && title ? { alt: title } : {}) });
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      }).run();
      if (wantCaption) {
        // Above the picture's top-level block and the note below it (v1 ieBlockOf), the picture still selected; then the numbers are set again.
        const block = topLevelBlockPos(editor, pos);
        const chain = editor.chain();
        if (note) chain.insertContentAt(block + editor.state.doc.nodeAt(block)!.nodeSize, noteHtml(note), { updateSelection: false });
        chain.insertContentAt(block, captionHtml("figure", title), { updateSelection: false }).run();
        renumberCaptions(editor);
      }
      onClose();
      toast(t("ie_done"));
    } catch {
      toast(t("ie_fail"));
    } finally {
      busy.current = false;
      setApplying(false);
    }
  }

  const { mode, hist } = work;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" data-testid="pe-turn-left" onClick={() => put(turn(workRef.current, -1))}>{t("ie_rotl")}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="pe-turn-right" onClick={() => put(turn(workRef.current, 1))}>{t("ie_rotr")}</Button>
        {MODES.map(([m, key]) => (
          <Button key={m} type="button" variant={mode === m ? "toggle" : "ghost"} size="sm" aria-pressed={mode === m} data-testid={"pe-mode-" + m}
            onClick={() => put(toggleMode(workRef.current, m))}>{t(key)}</Button>
        ))}
        <Button type="button" variant="ghost" size="sm" data-testid="pe-undo" disabled={!hist.length} onClick={() => put(undo(workRef.current))}>{t("ie_undo")}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="pe-reset" onClick={() => put(reset(workRef.current))}>{t("ie_reset")}</Button>
      </div>
      <p id={id + "-hint"} className="m-0 min-h-[2.6em] text-sm text-muted-foreground" aria-live="polite" data-testid="pe-hint">{t(HINT_KEY[mode])}</p>

      {mode && (
        <div role="group" aria-labelledby={id + "-rect"} className="grid gap-2 rounded-md border border-line-strong p-2" data-testid="pe-rect">
          <p id={id + "-rect"} className="m-0 text-[13px] text-muted-foreground">{t("pic_rect_hint", { min: MIN_DRAG })}</p>
          <div className="flex flex-wrap items-end gap-2">
            {FIELDS.map(([k, key]) => (
              <div key={k} className="grid w-24 gap-1">
                <label htmlFor={id + "-" + k} className="text-[13px] font-medium">{t(key)}</label>
                <Input id={id + "-" + k} type="number" inputMode="numeric" min={0} step={1} value={fields[k]} data-testid={"pe-rect-" + k}
                  onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" disabled={!typed} data-testid="pe-rect-apply" onClick={() => { if (typed) run(typed); }}>{t("pic_rect_apply")}</Button>
          </div>
        </div>
      )}

      <canvas ref={cvRef} width={300} height={200} data-testid="pe-canvas" role="img" aria-label={t("pic_canvas")} aria-describedby={id + "-hint"} className="mx-auto block max-w-full rounded-md border border-line-strong bg-white"
        style={{ touchAction: "none", maxHeight: "55vh" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDragBoth(null)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor={id + "-br"} className="text-[13px] font-medium">{t("ie_br")}</label>
          <input id={id + "-br"} type="range" min={-100} max={100} step={1} value={work.br} data-testid="pe-br" className="accent-purple-800"
            onChange={(e) => put({ ...workRef.current, br: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={id + "-co"} className="text-[13px] font-medium">{t("ie_co")}</label>
          <input id={id + "-co"} type="range" min={-100} max={100} step={1} value={work.co} data-testid="pe-co" className="accent-purple-800"
            onChange={(e) => put({ ...workRef.current, co: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor={id + "-bg"} className="text-[13px] font-medium">{t("ie_bgcol")}</label>
        <select id={id + "-bg"} className="input" value={work.bgColor} data-testid="pe-bgcol" onChange={(e) => put({ ...workRef.current, bgColor: e.target.value })}>
          {BG_COLORS.map(([hex, key]) => <option key={hex} value={hex}>{t(key)}</option>)}
        </select>
      </div>

      <div className="grid gap-2 rounded-md border border-line-strong p-2">
        <div className="flex items-center gap-2">
          <input id={id + "-cap"} type="checkbox" checked={capOn} disabled={capExists} data-testid="pe-cap-on" onChange={(e) => tick(e.target.checked)} />
          <label htmlFor={id + "-cap"} className="text-sm font-medium">{t("ie_cap_on")}</label>
        </div>
        {capOn && !capExists && (
          <>
            <div className="grid gap-1">
              <label htmlFor={id + "-title"} className="text-[13px] font-medium">{t("ie_cap_title")}</label>
              <Input id={id + "-title"} value={capTitle} data-testid="pe-cap-title" onChange={(e) => setCapTitle(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label htmlFor={id + "-note"} className="text-[13px] font-medium">{t("ie_cap_note")}</label>
              <textarea id={id + "-note"} className="input" rows={3} value={capNote} data-testid="pe-cap-note" onChange={(e) => setCapNote(e.target.value)} />
            </div>
          </>
        )}
        {capExists && <p className="m-0 text-[13px] text-muted-foreground" data-testid="pe-cap-exists">{t("ie_cap_exists")}</p>}
      </div>

      {tooBig && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="pe-size">{t(sizeMessageKey)}</p>}
      <DialogFooter>
        <Button type="button" variant="primary" disabled={applying} data-testid="pe-apply" onClick={() => { void use(); }}>{t("ie_apply")}</Button>
        <Button type="button" variant="ghost" data-testid="pe-cancel" onClick={onClose}>{t("ie_cancel")}</Button>
        <Button type="button" variant="ghost" data-testid="pe-studio" onClick={() => { onClose(); onOpenStudio(); }}>{t("ps_open_btn")}</Button>
      </DialogFooter>
    </>
  );
}
