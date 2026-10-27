"use client";
import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import type { Mark } from "@tiptap/pm/model";
import { NodeSelection, Selection, type Transaction } from "@tiptap/pm/state";
import { plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProject } from "@/components/frame/ProjectContext";
import { useVault } from "@/lib/vault/useVault";
import { toast } from "@/components/ui/toast";
import { clearFormatting } from "@/lib/editor/clearFormatting";
import { resizeImage } from "@/lib/editor/image";
import { DICTATION_LANGS, dictErrorMessage, dictationSupported, formatSpoken, placeSpoken, startDictation, type Dictation } from "@/lib/editor/dictate";
import { dictLangFor, writeDictLang } from "@/lib/editor/dictPrefs";
import { fitsBudget, sizeMessageKey } from "@/lib/editor/sizeBudget";
import { TableSize } from "@/components/workspace/dialogs/TableSize";
import { useDictationGate } from "@/components/workspace/dialogs/DictationNotice";
import { CaptionDialog } from "./CaptionDialog";
import { PictureEditor } from "./PictureEditor";
import { FindReplace } from "./FindReplace";

const FONTS = ["Georgia", "Times New Roman", "Arial", "Noto Sans Devanagari"];
const SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const MIN_IMG = 320;
const MAX_IMG = 1600;

type Block = "paragraph" | "h1" | "h2" | "h3" | "quote";

/** Buttons keep the editor's selection: pressing one must not move focus out of the document. */
function Fmt({ name, label, title, on, active, disabled, children }: { name: string; label: string; title?: string; on(): void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="fmt" aria-label={label} title={title ?? label} aria-pressed={active === undefined ? undefined : active} disabled={disabled}
      data-testid={`fmt-${name}`} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  );
}
const Sep = () => <span className="sep" aria-hidden="true" />;

/** The picture the selection is on: a selected picture, else the first one inside a selected passage (the width bar shows for both); null when there is none. */
function selectedImagePos(editor: Editor): number | null {
  const { selection, doc } = editor.state;
  if (selection instanceof NodeSelection) return selection.node.type.name === "image" ? selection.from : null;
  let found: number | null = null;
  doc.nodesBetween(selection.from, selection.to, (n, pos) => {
    if (found === null && n.type.name === "image") found = pos;
    return found === null;
  });
  return found;
}

/** The AI-text mark (insertAiText's span.ai-ins, a classSpan): never put on the student's own words (lib/editor/insert.ts putText strips it the same way). */
const isAiIns = (m: Mark): boolean => m.type.name === "classSpan" && /(^|\s)ai-ins(\s|$)/.test(String(m.attrs.class ?? ""));

/**
 * Types one finished phrase at the caret as the student's own words (v1 dictInsert 4265-4277). Spoken punctuation first (formatSpoken), then the capital and
 * the space in front (placeSpoken), given the text of the paragraph before the caret back to its last line break (v1 looked at the caret's text node only).
 * Each "\n\n" is a new paragraph and each "\n" a line break; the words go in with the formatting at the caret but never the ai-ins mark (said in the
 * middle of AI text they split its span) and no space after them. A selected picture is passed over, not replaced.
 */
function typeSpoken(editor: Editor, raw: string, lang: string): void {
  if (editor.isDestroyed) return;
  const text = formatSpoken(raw, lang);
  if (!text) return;
  const { selection, doc } = editor.state;
  const after = selection instanceof NodeSelection ? Selection.findFrom(doc.resolve(selection.to), 1, true) : null;
  const { parent, parentOffset } = (after ?? selection).$from;
  const before = parent.textBetween(0, parentOffset, undefined, "\n").split("\n").pop() ?? "";
  const { text: spoken, leadSpace } = placeSpoken(text, before, lang);
  const chain = editor.chain().focus();
  if (after) chain.setTextSelection(after.from);
  for (const part of ((leadSpace ? " " : "") + spoken).split(/(\n\n|\n)/)) {
    if (part === "\n\n") chain.splitBlock();
    else if (part === "\n") chain.setHardBreak();
    else if (part) {
      chain.command(({ tr, state }) => {
        tr.replaceSelectionWith(state.schema.text(part, (tr.storedMarks ?? tr.selection.$from.marks()).filter((m) => !isAiIns(m))), false);
        return true;
      });
    }
  }
  chain.run();
}

/**
 * v1's formatting toolbar. It is only mounted once the editor exists (the document card passes a non-null editor) and subscribes to that
 * instance, so every control is live from the first paint, with no wait for a first transaction.
 */
export function FormatBar({ editor, openStudio: openWindow }: { editor: Editor; openStudio(pos: number | null): "opened" | "blocked" | "no-channel" }) {
  const t = useT();
  const { me, settings, update } = useSettings();
  const { project } = useProject();
  // With a vault the body is sealed whenever it is saved, so the sealed limit applies to a picture (lib/editor/sizeBudget.ts; "loading" counts as sealed).
  const vaultOn = useVault().status !== "off";
  const more = settings.fmtMore === true;
  const [findOpen, setFindOpen] = useState(false);
  const [findSeed, setFindSeed] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  /** The picture the editor is on, followed while it is open: where the photo studio is sent from its "bigger window" button. */
  const pictureAt = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const img = e.isActive("image");
      const dom = img ? (e.view.nodeDOM(e.state.selection.from) as HTMLElement | null) : null;
      const block: Block = e.isActive("blockquote") ? "quote" : e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "paragraph";
      const ts = e.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
      return {
        block,
        bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
        sup: e.isActive("superscript"), sub: e.isActive("subscript"),
        bullets: e.isActive("bulletList"), numbered: e.isActive("orderedList"),
        left: e.isActive({ textAlign: "left" }), center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }), justify: e.isActive({ textAlign: "justify" }),
        canUndo: e.can().undo(), canRedo: e.can().redo(),
        // In a list Indent/Outdent move the list item; elsewhere they step a paragraph's or heading's margin.
        canIndent: e.isActive("listItem") ? e.can().sinkListItem("listItem") : e.can().indent(),
        canOutdent: e.isActive("listItem") ? e.can().liftListItem("listItem") : e.can().outdent(),
        font: ts.fontFamily?.replace(/["']/g, "") ?? "", size: ts.fontSize ?? "", color: ts.color ?? "#000000",
        highlight: (e.getAttributes("highlight") as { color?: string }).color ?? "#fde68a",
        image: img, imageWidth: img ? Math.min(MAX_IMG, Math.max(MIN_IMG, Math.round(Number((e.getAttributes("image") as { width?: number }).width ?? dom?.offsetWidth ?? 640)))) : 0
      };
    }
  });
  const run = () => editor.chain().focus();

  // Ctrl/Cmd+F inside the document opens Find (the browser's own find stays for everywhere else), seeded with the selected words.
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        const { from, to } = editor.state.selection;
        const picked = from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
        setFindSeed(picked.length <= 80 ? picked : "");
        setFindOpen(true);
      } else if (ev.key === "Escape") setFindOpen(false);
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor]);

  // The picture moves as the document changes under the open editor (a paragraph put in above it, dictation typing): both its ends are mapped inwards, through
  // the transactions a plugin appends too, so a deleted picture is null and an identical copy that slides into its place is not it (the editor's own rule).
  useEffect(() => {
    if (!pictureOpen) return;
    const follow = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions: Transaction[] }) => {
      for (const tr of [transaction, ...appendedTransactions]) {
        const at = pictureAt.current;
        if (at === null) return;
        const from = tr.mapping.map(at, 1);
        pictureAt.current = tr.mapping.map(at + 1, -1) - from === 1 ? from : null;
      }
    };
    editor.on("transaction", follow);
    return () => { editor.off("transaction", follow); };
  }, [editor, pictureOpen]);

  // Dictation (v1 4246-4321; the engine is lib/editor/dictate.ts, the choices lib/editor/dictPrefs.ts).
  const userId = me?.id ?? null;
  const gate = useDictationGate(userId);
  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState("");
  const [pickedLang, setPickedLang] = useState<string | null>(null);
  // v1 dictLang (4254): the saved language, else Hindi for a Hindi project (the open project's language first, then the account's) and English (India).
  const lang = pickedLang ?? dictLangFor(userId, project ? project.contentLang : settings.contentLang);
  const dictation = useRef<Dictation | null>(null);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The recogniser's callbacks outlive the render that started it: they speak in the page's language as it is now.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  useEffect(() => () => {
    if (restart.current) clearTimeout(restart.current);
    dictation.current?.stop();
    dictation.current = null;
  }, []);
  /** Starts listening in `code`; the support check and the notice are the caller's. A recogniser that would not start shows nothing (v1). */
  function listen(code: string) {
    const started = startDictation({
      lang: code,
      onInterim: setInterim,
      onFinal: (raw) => typeSpoken(editor, raw, code),
      onEnd: () => { dictation.current = null; setDictating(false); setInterim(""); },
      onError: (c) => toast(dictErrorMessage(c, tRef.current)),
      onGiveUp: () => toast(tRef.current("dict_give_up"))
    });
    if (!started) return;
    dictation.current = started;
    setDictating(true);
  }
  function toggleDictation() {
    if (restart.current) { clearTimeout(restart.current); restart.current = null; }
    if (dictation.current) { dictation.current.stop(); return; }
    if (!dictationSupported()) { toast(t("dict_unsupported")); return; }
    gate.request(() => listen(lang));
  }
  /** v1 dictSetLang (4256): saved, and a change while listening stops and starts again in the new language after 300 ms. */
  function pickLang(code: string) {
    setPickedLang(code);
    writeDictLang(userId, code);
    if (!dictation.current && !restart.current) return;
    if (restart.current) clearTimeout(restart.current);
    dictation.current?.stop();
    restart.current = setTimeout(() => { restart.current = null; if (!dictation.current && !editor.isDestroyed) listen(code); }, 300);
  }

  /** Opens the picture editor on the picture the selection is on (a selected passage with a picture in it selects the picture first). */
  function openPictureEditor() {
    const pos = selectedImagePos(editor);
    if (pos === null) return;
    const sel = editor.state.selection;
    if (!(sel instanceof NodeSelection && sel.from === pos)) editor.commands.setNodeSelection(pos);
    pictureAt.current = pos;
    setPictureOpen(true);
  }
  /**
   * v1 psOpen (4589): a window that would not open says why, and the picture's small editor takes over when there was a picture. The picture is selected
   * again first (the selection may have moved while the editor was open) and the editor, which never closed, goes on with the work it has.
   */
  function openStudio(pos: number | null) {
    const out = openWindow(pos);
    if (out === "opened") return;
    toast(t(out === "blocked" ? "pop_blocked" : "ps_nochan"));
    if (pos === null) return;
    editor.commands.setNodeSelection(pos);
    setPictureOpen(true);
  }

  async function onPicture(file: File | undefined) {
    if (!file) return;
    try {
      const src = await resizeImage(file);
      // A picture is most of a document's size: say so before it goes in rather than let the save fail (wave D Task 9).
      if (!fitsBudget(editor, src.length, vaultOn)) { toast(t(sizeMessageKey)); return; }
      editor.chain().focus().insertContent({ type: "image", attrs: { src } }).run();
      // No drag handle: the size is set with the width slider that appears when the picture is selected.
      toast(t("fb_img_inserted"));
    } catch { toast(t("fb_img_fail")); }
  }

  function setBlock(v: Block) {
    const c = editor.chain().focus();
    if (v === "quote") { if (!editor.isActive("blockquote")) c.setParagraph().setBlockquote().run(); return; }
    if (editor.isActive("blockquote")) c.lift("blockquote");
    if (v === "paragraph") c.setParagraph().run();
    else c.setHeading({ level: v === "h1" ? 1 : v === "h2" ? 2 : 3 }).run();
  }

  return (
    <>
      <div className="fmtbar" role="toolbar" aria-label={t("fb_toolbar")} data-testid="format-bar">
        <select className="select" aria-label={t("fb_para_style")} data-testid="fmt-paragraph" value={s.block} onChange={(e) => setBlock(e.target.value as Block)}>
          <option value="paragraph">{t("fb_para")}</option>
          <option value="h1">{t("fb_h1")}</option>
          <option value="h2">{t("fb_h2")}</option>
          <option value="h3">{t("fb_h3")}</option>
          <option value="quote">{t("fb_quote")}</option>
        </select>
        <Sep />
        <Fmt name="bold" label={t("fb_bold")} active={s.bold} on={() => run().toggleBold().run()}><b>B</b></Fmt>
        <Fmt name="italic" label={t("fb_italic")} active={s.italic} on={() => run().toggleItalic().run()}><i>I</i></Fmt>
        <Fmt name="underline" label={t("fb_underline")} active={s.underline} on={() => run().toggleUnderline().run()}><u>U</u></Fmt>
        <Sep />
        <Fmt name="bullets" label={t("fb_bullets")} active={s.bullets} on={() => run().toggleBulletList().run()}>≡•</Fmt>
        <Fmt name="numbered" label={t("fb_numbered")} active={s.numbered} on={() => run().toggleOrderedList().run()}><span className="fmt-glyph" data-glyph="≡1" aria-hidden="true" /></Fmt>
        <Sep />
        <Fmt name="undo" label={t("fb_undo")} disabled={!s.canUndo} on={() => run().undo().run()}>↶</Fmt>
        <Fmt name="redo" label={t("fb_redo")} disabled={!s.canRedo} on={() => run().redo().run()}>↷</Fmt>
        <Sep />
        <Fmt name="image" label={t("fb_image")} on={() => fileRef.current?.click()}>{t("fb_image_btn")}</Fmt>
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="fmt-image-input" aria-label={t("fb_pick_picture")}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onPicture(f); }} />
        <Fmt name="table" label={t("fb_table")} on={() => setTableOpen(true)}>{t("fb_table_btn")}</Fmt>
        <Fmt name="caption" label={plainText(t("cap_btn"))} on={() => setCaptionOpen(true)}>{t("cap_btn")}</Fmt>
        <Fmt name="find" label={t("fb_find")} active={findOpen} on={() => { setFindSeed(""); setFindOpen((o) => !o); }}>{t("fb_find_btn")}</Fmt>
        <Fmt name="dictate" label={dictating ? t("dict_stop") : t("dict_btn")} title={t("dict_btn_title")} active={dictating} on={toggleDictation}>
          {dictating ? "⏹ " : "🎤 "}{dictating ? t("dict_stop") : t("dict_btn")}
        </Fmt>
        <select className="select" aria-label={t("dict_lang_label")} data-testid="fmt-dict-lang" value={lang} onChange={(e) => pickLang(e.target.value)}>
          {DICTATION_LANGS.map((l) => <option key={l.code} value={l.code}>{t(l.labelKey)}</option>)}
        </select>
        <button type="button" className="fmt" aria-label={t("fb_more_label")} aria-expanded={more} data-testid="fmt-more" onMouseDown={(e) => e.preventDefault()}
          onClick={() => { void update({ fmtMore: !more }); }}>{t("fmt_more_btn", { a: more ? "▴" : "▾" })}</button>
      </div>

      {more && (
        <div className="fmtbar fmtbar-more" role="toolbar" aria-label={t("fb_more_label")} data-testid="format-bar-more">
          <select className="select" aria-label={t("fb_font")} data-testid="fmt-font" value={FONTS.includes(s.font) ? s.font : ""}
            onChange={(e) => { const c = run(); if (e.target.value) c.setFontFamily(e.target.value).run(); else c.unsetFontFamily().run(); }}>
            <option value="">{t("fb_font")}</option>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="select" aria-label={t("ps_size")} data-testid="fmt-size" value={SIZES.some((n) => `${n}px` === s.size) ? s.size : ""}
            onChange={(e) => { const c = run(); if (e.target.value) c.setFontSize(e.target.value).run(); else c.unsetFontSize().run(); }}>
            <option value="">{t("ps_size")}</option>
            {SIZES.map((n) => <option key={n} value={`${n}px`}>{n} px</option>)}
          </select>
          <Sep />
          <Fmt name="strike" label={t("fb_strike")} active={s.strike} on={() => run().toggleStrike().run()}><s>S</s></Fmt>
          <Fmt name="sup" label={t("fb_sup")} active={s.sup} on={() => run().toggleSuperscript().run()}>x²</Fmt>
          <Fmt name="sub" label={t("fb_sub")} active={s.sub} on={() => run().toggleSubscript().run()}>x₂</Fmt>
          <Sep />
          <label className="fmt fmt-color" title={t("fb_text_colour")}>A
            <input type="color" aria-label={t("fb_text_colour")} data-testid="fmt-color" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#000000"} onChange={(e) => run().setColor(e.target.value).run()} />
          </label>
          <label className="fmt fmt-color" title={t("fb_highlight")}>🖍
            <input type="color" aria-label={t("fb_highlight_colour")} data-testid="fmt-highlight" value={/^#[0-9a-f]{6}$/i.test(s.highlight) ? s.highlight : "#fde68a"} onChange={(e) => run().setHighlight({ color: e.target.value }).run()} />
          </label>
          <Sep />
          <Fmt name="outdent" label={t("fb_outdent")} disabled={!s.canOutdent} on={() => (editor.isActive("listItem") ? run().liftListItem("listItem") : run().outdent()).run()}>⇤</Fmt>
          <Fmt name="indent" label={t("fb_indent")} disabled={!s.canIndent} on={() => (editor.isActive("listItem") ? run().sinkListItem("listItem") : run().indent()).run()}>⇥</Fmt>
          <Fmt name="clear" label={t("fb_clear")} on={() => { clearFormatting(editor); }}>Tx</Fmt>
          <Sep />
          <Fmt name="align-left" label={t("fb_align_left")} active={s.left} on={() => run().setTextAlign("left").run()}>⇚</Fmt>
          <Fmt name="align-center" label={t("fb_align_centre")} active={s.center} on={() => run().setTextAlign("center").run()}>≡</Fmt>
          <Fmt name="align-right" label={t("fb_align_right")} active={s.right} on={() => run().setTextAlign("right").run()}>⇛</Fmt>
          <Fmt name="align-justify" label={t("fb_justify")} active={s.justify} on={() => run().setTextAlign("justify").run()}>☰</Fmt>
          <Sep />
          <Fmt name="row" label={t("fb_row")} on={() => run().addRowAfter().run()}>{t("fb_row_btn")}</Fmt>
          <Fmt name="col" label={t("fb_col")} on={() => run().addColumnAfter().run()}>{t("fb_col_btn")}</Fmt>
          <Fmt name="photo" label={plainText(t("ps_tb_btn"))} on={() => openStudio(null)}>{t("ps_tb_btn")}</Fmt>
          <Fmt name="pagebreak" label={t("fb_pagebreak")} on={() => run().insertContentAt(editor.state.selection.to, { type: "pageBreak" }).run()}>{t("fb_pagebreak_btn")}</Fmt>
        </div>
      )}

      {s.image && (
        <div className="fmtbar imgbar" data-testid="img-bar">
          <label htmlFor="imgWidth">{t("fb_pic_width")}</label>
          <input id="imgWidth" type="range" min={MIN_IMG} max={MAX_IMG} step={10} value={s.imageWidth} data-testid="img-width"
            onChange={(e) => editor.chain().updateAttributes("image", { width: Number(e.target.value) }).run()} />
          <span className="findbar-count" data-testid="img-width-value">{s.imageWidth} px</span>
          <Fmt name="edit-picture" label={plainText(t("ie_btn"))} on={openPictureEditor}>{t("ie_btn")}</Fmt>
        </div>
      )}

      {findOpen && <FindReplace editor={editor} seed={findSeed} onClose={() => { setFindOpen(false); editor.commands.focus(); }} />}
      {dictating && <div className="dict-live" role="status" aria-live="polite" data-testid="dict-live">{t("dict_listening")} {interim.slice(-70)}</div>}

      <TableSize open={tableOpen} onOpenChange={setTableOpen}
        onInsert={(rows, cols) => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); }} />
      <CaptionDialog open={captionOpen} onOpenChange={setCaptionOpen} editor={editor} />
      <PictureEditor open={pictureOpen} onOpenChange={setPictureOpen} editor={editor} onOpenStudio={() => openStudio(pictureAt.current)} />
      {gate.notice}
    </>
  );
}
