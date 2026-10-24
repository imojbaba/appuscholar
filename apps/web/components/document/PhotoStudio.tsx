"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/export/download";
import { maskNote, MIN_DRAG, type Point } from "@/lib/editor/pictureOps";
import { plainText, useT } from "@/lib/i18n";
import { sizeMessageKey } from "@/lib/editor/sizeBudget";
import { holdPopout } from "@/lib/popout/mode";
import { onPhotoMessage, photoChannel, postPhoto, studioIdFromHash, type PhotoSaved } from "@/lib/popout/photoChannel";
import { dataUrlToBlob } from "@/lib/tools/stats/png";
import { StudioEngine, workingCanvas } from "./photoStudio/engine";
import { ASPECTS, BG_COLOURS, NO_TOOL_HINT, TOOLS, isBoxTool, isInkTool } from "./photoStudio/studioTools";

/*
 * The photo studio window (R1 section 3a; v1 #photoStudio 1344-1409, CSS 177-195, psStudioInit 4797): a picture editor in a window of its own, opened by the
 * writing window (lib/editor/photoStudioHost.ts) and talking to it over the appu_photo channel. It is a page, not a place: no document, no project, no
 * autosave. It reads its id from the URL hash, asks for its picture, and sends the result back; it writes nothing, to storage or to the API. The picture and
 * every edit live in a StudioEngine (./photoStudio/engine.ts); this is the window around it.
 */

/** How long the studio waits for the writing window to say it placed the picture (v1 psDone 4772). */
const WAIT_SAVED_MS = 4000;
/** How long it stays open after that, so the student sees the answer (v1 psStudioInit). */
const CLOSE_AFTER_MS = 700;

// The hash and the channel are read through the external-store hooks so the server render (no window) and the first client render agree.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const hashNow = () => window.location.hash;
const hashServer = () => "";
const noSubscribe = () => () => {};
const channelNow = () => photoChannel() !== null;
const channelServer = () => true;

/** Why the writing window did not place the picture, as the key of what to say (new here: v1 said only that it could not edit). */
function refusal(m: PhotoSaved): string {
  if (m.reason === "too-large") return sizeMessageKey;
  if (m.reason === "no-document") return "ps_nodoc";
  return "ie_fail";
}

export function PhotoStudio() {
  const t = useT();
  const [eng] = useState(() => new StudioEngine());
  useSyncExternalStore(eng.subscribe, eng.getVersion, eng.getVersion);
  const id = studioIdFromHash(useSyncExternalStore(subscribeHash, hashNow, hashServer));
  const hasChannel = useSyncExternalStore(noSubscribe, channelNow, channelServer);
  /** The key of what the status line says; null is nothing. */
  const [status, setStatus] = useState<string | null>(null);
  const [capOn, setCapOn] = useState(false);
  const [capTitle, setCapTitle] = useState("");
  const [capNote, setCapNote] = useState("");
  const cvRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef({ wait: undefined as ReturnType<typeof setTimeout> | undefined, close: undefined as ReturnType<typeof setTimeout> | undefined });

  /** A change to the picture: what it answers (a key, or nothing) replaces the status line. */
  const edit = useCallback((fn: () => string | null | void) => setStatus(fn() ?? null), []);

  // v1 psStudioInit 4800: "Appuscholar · " and the title without its emoji.
  useEffect(() => { document.title = "Appuscholar · " + plainText(t("ps_title")); }, [t]);

  // This is a pop-out window (v1 opened it as #popout=photo): lib/popout/mode.ts keeps the role while it is mounted, so nothing running in this window
  // writes a document or a blob, and the vault does not start its migration here.
  useEffect(() => {
    holdPopout(true);
    return () => holdPopout(false);
  }, []);

  // The engine draws the picture on every render. The pane it fits into is measured only when its size changes (the browser's ResizeObserver; the window's
  // resize where there is none) and when a picture loads, never after a draw: a pane that took its size from the picture in it would otherwise be measured
  // smaller after each draw, and the picture drawn smaller to fit it, until nothing was left.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (wrap) eng.setPane(wrap.clientWidth, wrap.clientHeight);
  }, [eng]);
  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (wrap && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  useLayoutEffect(() => {
    if (cvRef.current) eng.draw(cvRef.current);
  });

  /** Draws a picture the writing window sent, or a file (v1 psLoadSrc 4609). */
  const loadSrc = useCallback((src: string, capExists: boolean) => {
    const im = new Image();
    im.onload = () => {
      try {
        measure();
        eng.load(workingCanvas(im), /^data:image\/png/.test(src), capExists);
        if (capExists) setCapOn(false);
        setStatus(null);
      } catch { setStatus("ie_fail"); }
    };
    im.onerror = () => setStatus("ie_fail");
    im.src = src;
  }, [eng, measure]);

  /** The writing window's answer to Done (v1 psStudioInit 4806). */
  const saved = useCallback((m: PhotoSaved) => {
    clearTimeout(timers.current.wait);
    if (m.ok) {
      setStatus("ps_saved");
      timers.current.close = setTimeout(() => window.close(), CLOSE_AFTER_MS);
    } else setStatus(refusal(m));
  }, []);

  // Listen first, then say ready, so the picture cannot arrive before anything is listening.
  useEffect(() => {
    if (!id) return;
    const off = onPhotoMessage((m) => {
      if (m.id !== id) return;
      if (m.t === "load") {
        if (m.src) loadSrc(m.src, m.capExists);
        else setStatus("ps_openhint");
      } else if (m.t === "saved") saved(m);
    });
    postPhoto({ t: "ready", id });
    return off;
  }, [id, loadSrc, saved]);
  useEffect(() => {
    const tm = timers.current;
    return () => { clearTimeout(tm.wait); clearTimeout(tm.close); };
  }, []);

  // Ctrl or Cmd with Z undoes; with Y, or with Shift and Z, redoes (v1 4780). A text box keeps its own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target;
      if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|number)$/.test(el.type))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); edit(() => eng.undoStep()); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); edit(() => eng.redoStep()); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [eng, edit]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { setStatus("ie_fail"); input.value = ""; return; }
    const r = new FileReader();
    r.onload = () => loadSrc(String(r.result), false);
    r.onerror = () => setStatus("ie_fail");
    r.readAsDataURL(f);
    input.value = "";
  }

  /** Done: the picture goes to the writing window, and the studio waits for it to say it is placed (v1 psDone 4761). */
  async function done() {
    if (!eng.loaded) { setStatus("ps_nopic"); return; }
    if (!id || !hasChannel) { setStatus("ps_noparent"); return; }
    try {
      const { src, edits } = await eng.exportData();
      postPhoto({ t: "done", id, src, edits, capOn: capOn && !eng.capExists, title: capTitle.trim(), note: capNote.trim() });
      setStatus("ps_sending");
      clearTimeout(timers.current.wait);
      timers.current.wait = setTimeout(() => setStatus("ps_noparent"), WAIT_SAVED_MS);
    } catch { setStatus("ie_fail"); }
  }

  /** Save a copy: the same picture Done would send, as a file (v1 psDownload). */
  async function save() {
    if (!eng.loaded) { setStatus("ps_nopic"); return; }
    try {
      const { src } = await eng.exportData();
      downloadBlob("picture." + (src.startsWith("data:image/png") ? "png" : "jpg"), dataUrlToBlob(src));
    } catch { setStatus("ie_fail"); }
  }

  /** Close: tell the writing window, and close (a browser may refuse for a window it did not open, so say so) (v1 psCancel). */
  function close() {
    if (id) postPhoto({ t: "cancel", id });
    window.close();
    setStatus("ps_closeself");
  }

  function onCapToggle(e: ChangeEvent<HTMLInputElement>) {
    const on = e.target.checked;
    setCapOn(on);
    // v1 psCapToggle: the note starts as the sentences for the masking done so far.
    if (on && !capNote) setCapNote(maskNote(eng.log, t));
  }

  // ---- the picture: pointer ----
  const redraw = () => { if (cvRef.current) eng.draw(cvRef.current); };
  /** The point on the picture under the pointer, in picture pixels (the canvas may be shown larger or smaller). */
  function pointOf(e: PointerEvent<HTMLCanvasElement>): Point | null {
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height };
  }
  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button > 0 || !eng.tool || !eng.base) return;
    const p = pointOf(e);
    if (!p) return;
    e.preventDefault();
    if (eng.tool === "text") { edit(() => eng.placeText(p)); return; }
    if (eng.beginDrag(p)) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* v1's try */ }
      redraw();
    }
  }
  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    const p = pointOf(e);
    if (p && eng.moveDrag(p)) redraw();
  }
  function onUp() {
    if (eng.endDrag()) setStatus(null);
  }
  function onCancel() {
    eng.cancelDrag();
    redraw();
  }

  const o = eng.o;
  const tool = eng.tool;
  const hint = TOOLS.find((x) => x.id === tool)?.hint ?? NO_TOOL_HINT;
  // Nothing to say yet and no window to hear from: the way to begin is a file (v1 psStudioInit).
  const line = status ?? (!eng.loaded && (!id || !hasChannel) ? "ps_openhint" : null);
  const boxInput = (k: "x" | "y" | "w" | "h", label: string) => (
    <label key={k}>
      {t(label)}
      <input type="number" className="input" data-testid={"ps-box-" + k} min={0} value={o.box[k]} onChange={(e) => eng.opt({ box: { [k]: e.target.value } })} />
    </label>
  );

  return (
    <div className="ps" data-testid="photo-studio">
      <div className="ps-top">
        <h1 className="ps-title">{t("ps_title")}</h1>
        <Button variant="ghost" size="sm" data-testid="ps-open" onClick={() => fileRef.current?.click()}>{t("ps_open")}</Button>
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="ps-file" onChange={onFile} />
        {/* ps_rect_small carries a {n}; t() leaves every other key as it is. */}
        <span className="ps-status" role="status" aria-live="polite" data-testid="ps-status">{line ? t(line, { n: MIN_DRAG }) : ""}</span>
        <span className="ps-spacer" />
        <Button variant="ghost" size="sm" data-testid="ps-undo" disabled={!eng.undo.length} onClick={() => edit(() => eng.undoStep())}>{t("ie_undo")}</Button>
        <Button variant="ghost" size="sm" data-testid="ps-redo" disabled={!eng.redo.length} onClick={() => edit(() => eng.redoStep())}>{t("ps_redo")}</Button>
        <Button variant="ghost" size="sm" data-testid="ps-reset" onClick={() => edit(() => eng.reset())}>{t("ie_reset")}</Button>
        <span className="ps-zoom">
          <Button variant="ghost" size="sm" data-testid="ps-zoom-out" aria-label={t("ps_zoom_out")} onClick={() => eng.zoomBy(-1)}>−</Button>
          <span className="ps-zoom-label" data-testid="ps-zoom">{Math.round(eng.zoomFactor() * 100)}%</span>
          <Button variant="ghost" size="sm" data-testid="ps-zoom-in" aria-label={t("ps_zoom_in")} onClick={() => eng.zoomBy(1)}>+</Button>
          <Button variant="ghost" size="sm" data-testid="ps-fit" onClick={() => eng.zoomBy(0)}>{t("ps_fit")}</Button>
        </span>
        <Button variant="gold" size="sm" data-testid="ps-done" onClick={() => void done()}>{t("ps_done")}</Button>
        <Button variant="ghost" size="sm" data-testid="ps-save" onClick={() => void save()}>{t("ps_dl")}</Button>
        <Button variant="ghost" size="sm" data-testid="ps-close" onClick={close}>{t("ps_close")}</Button>
      </div>
      <div className="ps-body">
        <div className="ps-tools">
          {TOOLS.map((x) => (
            <Button key={x.id} variant="ghost" size="sm" className="ps-tool" data-testid={"ps-tool-" + x.id} aria-pressed={tool === x.id} onClick={() => edit(() => eng.setTool(x.id))}>{t(x.label)}</Button>
          ))}
        </div>
        <div className="ps-stage">
          <div className="ps-opts">
            <span className="ps-hint" data-testid="ps-hint">{t(hint)}</span>
            {isInkTool(tool) && (
              <>
                <label htmlFor="ps-color">{t("ps_color")}</label>
                <input id="ps-color" data-testid="ps-color" type="color" value={o.color} onChange={(e) => eng.opt({ color: e.target.value })} />
                <label htmlFor="ps-size">{t("ps_size")}</label>
                <input id="ps-size" data-testid="ps-size" className="ps-size" type="range" min={1} max={30} value={o.size} onChange={(e) => eng.opt({ size: Number(e.target.value) })} />
              </>
            )}
            {tool === "crop" && (
              <>
                <label htmlFor="ps-aspect">{t("ps_aspect")}</label>
                <select id="ps-aspect" className="select" data-testid="ps-aspect" value={String(o.aspect)} onChange={(e) => eng.opt({ aspect: Number(e.target.value) })}>
                  {ASPECTS.map((a) => <option key={a.value} value={String(a.value)}>{a.text ?? t("ps_asp_free")}</option>)}
                </select>
              </>
            )}
            {tool === "bg" && (
              <>
                <label htmlFor="ps-bgshape">{t("ps_bgshape")}</label>
                <select id="ps-bgshape" className="select" data-testid="ps-bgshape" value={o.bgShape} onChange={(e) => eng.opt({ bgShape: e.target.value === "box" ? "box" : "oval" })}>
                  <option value="oval">{t("ps_oval")}</option>
                  <option value="box">{t("ps_box")}</option>
                </select>
                <label htmlFor="ps-bgcol">{t("ie_bgcol")}</label>
                <select id="ps-bgcol" className="select" data-testid="ps-bgcol" value={o.bgColor} onChange={(e) => eng.opt({ bgColor: e.target.value })}>
                  {BG_COLOURS.map((c) => <option key={c.value} value={c.value}>{t(c.name)}</option>)}
                </select>
              </>
            )}
            {tool === "text" && (
              <input type="text" className="input ps-text" data-testid="ps-text" aria-label={t("ps_text_ph")} placeholder={t("ps_text_ph")} value={o.text} onChange={(e) => eng.opt({ text: e.target.value })} />
            )}
          </div>
          {/* The keyboard way to a drag: the box (or, for text, the place) as numbers. Arrow and Pen have no typed form. */}
          {(isBoxTool(tool) || tool === "text") && (
            <fieldset className="ps-box" data-testid="ps-box">
              <legend>{t(tool === "text" ? "ps_text_legend" : "ps_rect_legend")}</legend>
              <div className="ps-box-row">
                {boxInput("x", "ps_rect_x")}
                {boxInput("y", "ps_rect_y")}
                {tool !== "text" && boxInput("w", "ps_rect_w")}
                {tool !== "text" && boxInput("h", "ps_rect_h")}
                {tool === "text"
                  ? <Button variant="ghost" size="sm" data-testid="ps-text-place" onClick={() => edit(() => eng.placeTextTyped())}>{t("ps_text_place")}</Button>
                  : <Button variant="ghost" size="sm" data-testid="ps-box-apply" onClick={() => edit(() => eng.applyTypedBox())}>{t("ps_rect_apply")}</Button>}
              </div>
            </fieldset>
          )}
          <div className="ps-canvaswrap" ref={wrapRef}>
            <canvas
              ref={cvRef}
              width={300}
              height={200}
              role="img"
              aria-label={t("ps_canvas")}
              data-testid="ps-canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
            />
          </div>
        </div>
        <div className="ps-side">
          <h2>{t("ps_light")}</h2>
          <label htmlFor="ps-br">{t("ie_br")}</label>
          <input id="ps-br" data-testid="ps-br" type="range" min={-100} max={100} value={o.br} onChange={(e) => eng.opt({ br: Number(e.target.value) })} />
          <label htmlFor="ps-co">{t("ie_co")}</label>
          <input id="ps-co" data-testid="ps-co" type="range" min={-100} max={100} value={o.co} onChange={(e) => eng.opt({ co: Number(e.target.value) })} />
          <label htmlFor="ps-sa">{t("ps_sat")}</label>
          <input id="ps-sa" data-testid="ps-sa" type="range" min={-100} max={100} value={o.sa} onChange={(e) => eng.opt({ sa: Number(e.target.value) })} />
          <h2>{t("ps_shape")}</h2>
          <div className="ps-btns">
            <Button variant="ghost" size="sm" data-testid="ps-rotl" onClick={() => edit(() => eng.rotate(-1))}>{t("ie_rotl")}</Button>
            <Button variant="ghost" size="sm" data-testid="ps-rotr" onClick={() => edit(() => eng.rotate(1))}>{t("ie_rotr")}</Button>
            <Button variant="ghost" size="sm" data-testid="ps-fliph" onClick={() => edit(() => eng.flip("h"))}>{t("ps_fliph")}</Button>
            <Button variant="ghost" size="sm" data-testid="ps-flipv" onClick={() => edit(() => eng.flip("v"))}>{t("ps_flipv")}</Button>
            <Button variant="ghost" size="sm" data-testid="ps-sharpen" onClick={() => edit(() => eng.sharpen())}>{t("ps_sharpen")}</Button>
            <Button variant="ghost" size="sm" data-testid="ps-border" onClick={() => edit(() => eng.border())}>{t("ps_border")}</Button>
          </div>
          <label htmlFor="ps-width">{t("ps_width")}</label>
          <div className="ps-row">
            <input id="ps-width" data-testid="ps-width" type="number" className="input" min={50} max={4000} value={o.widthText} onChange={(e) => eng.opt({ widthText: e.target.value })} />
            <Button variant="ghost" size="sm" data-testid="ps-resize" onClick={() => edit(() => eng.resize())}>{t("ps_resize")}</Button>
          </div>
          <label className="ps-check">
            <input type="checkbox" data-testid="ps-cap-on" checked={capOn} disabled={eng.capExists} onChange={onCapToggle} />
            {t("ie_cap_on")}
          </label>
          {capOn && (
            <div data-testid="ps-cap-fields">
              <label htmlFor="ps-cap-title">{t("ie_cap_title")}</label>
              <input id="ps-cap-title" data-testid="ps-cap-title" type="text" className="input" value={capTitle} onChange={(e) => setCapTitle(e.target.value)} />
              <label htmlFor="ps-cap-note">{t("ie_cap_note")}</label>
              <textarea id="ps-cap-note" data-testid="ps-cap-note" className="input" rows={4} value={capNote} onChange={(e) => setCapNote(e.target.value)} />
            </div>
          )}
          {eng.capExists && <p className="ps-note">{t("ie_cap_exists")}</p>}
        </div>
      </div>
    </div>
  );
}
