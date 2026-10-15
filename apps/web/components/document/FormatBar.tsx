"use client";
import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { clearFormatting } from "@/lib/editor/clearFormatting";
import { resizeImage } from "@/lib/editor/image";
import { DICTATION_LANGS, UNSUPPORTED_MESSAGE, defaultDictationLang, startDictation, type Dictation } from "@/lib/editor/dictate";
import { TableSize } from "@/components/workspace/dialogs/TableSize";
import { FindReplace } from "./FindReplace";

const FONTS = ["Georgia", "Times New Roman", "Arial", "Noto Sans Devanagari"];
const SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const MIN_IMG = 320;
const MAX_IMG = 1600;

type Block = "paragraph" | "h1" | "h2" | "h3" | "quote";

/** Buttons keep the editor's selection: pressing one must not move focus out of the document. */
function Fmt({ name, label, on, active, disabled, children }: { name: string; label: string; on(): void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="fmt" aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled}
      data-testid={`fmt-${name}`} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  );
}
const Sep = () => <span className="sep" aria-hidden="true" />;

/**
 * v1's formatting toolbar. It is only mounted once the editor exists (the document card passes a non-null editor) and subscribes to that
 * instance, so every control is live from the first paint, with no wait for a first transaction.
 */
export function FormatBar({ editor }: { editor: Editor }) {
  const t = useT();
  const { settings, update } = useSettings();
  const more = settings.fmtMore === true;
  const [findOpen, setFindOpen] = useState(false);
  const [findSeed, setFindSeed] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
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

  // Dictation.
  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState("");
  const [pickedLang, setPickedLang] = useState<string | null>(null);
  const lang = pickedLang ?? defaultDictationLang(settings.contentLang);
  const dictation = useRef<Dictation | null>(null);
  useEffect(() => () => { dictation.current?.stop(); dictation.current = null; }, []);
  function toggleDictation() {
    if (dictation.current) { dictation.current.stop(); return; }
    const started = startDictation({
      lang,
      onInterim: setInterim,
      onFinal: (text) => { if (!editor.isDestroyed && text.trim()) editor.chain().focus().insertContent(text.trim() + " ").run(); },
      onEnd: () => { dictation.current = null; setDictating(false); setInterim(""); },
      onError: (code) => { if (code === "not-allowed" || code === "service-not-allowed") toast("Microphone access is blocked. Allow it in the browser to dictate."); }
    });
    if (!started) { toast(UNSUPPORTED_MESSAGE); return; }
    dictation.current = started;
    setDictating(true);
  }

  async function onPicture(file: File | undefined) {
    if (!file) return;
    try {
      const src = await resizeImage(file);
      editor.chain().focus().insertContent({ type: "image", attrs: { src } }).run();
      // No drag handle: the size is set with the width slider that appears when the picture is selected.
      toast("Image inserted — select it to change its size");
    } catch { toast("Could not read that picture. Try a JPEG or PNG."); }
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
      <div className="fmtbar" role="toolbar" aria-label="Formatting" data-testid="format-bar">
        <select className="select" aria-label="Paragraph style" data-testid="fmt-paragraph" value={s.block} onChange={(e) => setBlock(e.target.value as Block)}>
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
        </select>
        <Sep />
        <Fmt name="bold" label="Bold" active={s.bold} on={() => run().toggleBold().run()}><b>B</b></Fmt>
        <Fmt name="italic" label="Italic" active={s.italic} on={() => run().toggleItalic().run()}><i>I</i></Fmt>
        <Fmt name="underline" label="Underline" active={s.underline} on={() => run().toggleUnderline().run()}><u>U</u></Fmt>
        <Sep />
        <Fmt name="bullets" label="Bulleted list" active={s.bullets} on={() => run().toggleBulletList().run()}>≡•</Fmt>
        <Fmt name="numbered" label="Numbered list" active={s.numbered} on={() => run().toggleOrderedList().run()}>≡1</Fmt>
        <Sep />
        <Fmt name="undo" label="Undo" disabled={!s.canUndo} on={() => run().undo().run()}>↶</Fmt>
        <Fmt name="redo" label="Redo" disabled={!s.canRedo} on={() => run().redo().run()}>↷</Fmt>
        <Sep />
        <Fmt name="image" label="Insert image" on={() => fileRef.current?.click()}>🖼 Image</Fmt>
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="fmt-image-input" aria-label="Choose a picture"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onPicture(f); }} />
        <Fmt name="table" label="Insert table" on={() => setTableOpen(true)}>⊞ Table</Fmt>
        <Fmt name="find" label="Find and replace" active={findOpen} on={() => { setFindSeed(""); setFindOpen((o) => !o); }}>🔍 Find</Fmt>
        <Fmt name="dictate" label={dictating ? "Stop dictation" : "Dictate"} active={dictating} on={toggleDictation}>🎤 Dictate</Fmt>
        <select className="select" aria-label="Dictation language" data-testid="fmt-dict-lang" value={lang} onChange={(e) => setPickedLang(e.target.value)}>
          {DICTATION_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button type="button" className="fmt" aria-label="More formatting" aria-expanded={more} data-testid="fmt-more" onMouseDown={(e) => e.preventDefault()}
          onClick={() => { void update({ fmtMore: !more }); }}>{t("fmt_more_btn", { a: more ? "▴" : "▾" })}</button>
      </div>

      {more && (
        <div className="fmtbar fmtbar-more" role="toolbar" aria-label="More formatting" data-testid="format-bar-more">
          <select className="select" aria-label="Font" data-testid="fmt-font" value={FONTS.includes(s.font) ? s.font : ""}
            onChange={(e) => { const c = run(); if (e.target.value) c.setFontFamily(e.target.value).run(); else c.unsetFontFamily().run(); }}>
            <option value="">Font</option>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="select" aria-label="Size" data-testid="fmt-size" value={SIZES.some((n) => `${n}px` === s.size) ? s.size : ""}
            onChange={(e) => { const c = run(); if (e.target.value) c.setFontSize(e.target.value).run(); else c.unsetFontSize().run(); }}>
            <option value="">Size</option>
            {SIZES.map((n) => <option key={n} value={`${n}px`}>{n} px</option>)}
          </select>
          <Sep />
          <Fmt name="strike" label="Strikethrough" active={s.strike} on={() => run().toggleStrike().run()}><s>S</s></Fmt>
          <Fmt name="sup" label="Superscript" active={s.sup} on={() => run().toggleSuperscript().run()}>x²</Fmt>
          <Fmt name="sub" label="Subscript" active={s.sub} on={() => run().toggleSubscript().run()}>x₂</Fmt>
          <Sep />
          <label className="fmt fmt-color" title="Text colour">A
            <input type="color" aria-label="Text colour" data-testid="fmt-color" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#000000"} onChange={(e) => run().setColor(e.target.value).run()} />
          </label>
          <label className="fmt fmt-color" title="Highlight">🖍
            <input type="color" aria-label="Highlight colour" data-testid="fmt-highlight" value={/^#[0-9a-f]{6}$/i.test(s.highlight) ? s.highlight : "#fde68a"} onChange={(e) => run().setHighlight({ color: e.target.value }).run()} />
          </label>
          <Sep />
          <Fmt name="outdent" label="Outdent" disabled={!s.canOutdent} on={() => (editor.isActive("listItem") ? run().liftListItem("listItem") : run().outdent()).run()}>⇤</Fmt>
          <Fmt name="indent" label="Indent" disabled={!s.canIndent} on={() => (editor.isActive("listItem") ? run().sinkListItem("listItem") : run().indent()).run()}>⇥</Fmt>
          <Fmt name="clear" label="Clear formatting" on={() => { clearFormatting(editor); }}>Tx</Fmt>
          <Sep />
          <Fmt name="align-left" label="Align left" active={s.left} on={() => run().setTextAlign("left").run()}>⇚</Fmt>
          <Fmt name="align-center" label="Align centre" active={s.center} on={() => run().setTextAlign("center").run()}>≡</Fmt>
          <Fmt name="align-right" label="Align right" active={s.right} on={() => run().setTextAlign("right").run()}>⇛</Fmt>
          <Fmt name="align-justify" label="Justify" active={s.justify} on={() => run().setTextAlign("justify").run()}>☰</Fmt>
          <Sep />
          <Fmt name="row" label="Add row below" on={() => run().addRowAfter().run()}>+Row</Fmt>
          <Fmt name="col" label="Add column right" on={() => run().addColumnAfter().run()}>+Col</Fmt>
          <Fmt name="pagebreak" label="Insert page break" on={() => run().insertContentAt(editor.state.selection.to, { type: "pageBreak" }).run()}>⤓ Page Break</Fmt>
        </div>
      )}

      {s.image && (
        <div className="fmtbar imgbar" data-testid="img-bar">
          <label htmlFor="imgWidth">Picture width</label>
          <input id="imgWidth" type="range" min={MIN_IMG} max={MAX_IMG} step={10} value={s.imageWidth} data-testid="img-width"
            onChange={(e) => editor.chain().updateAttributes("image", { width: Number(e.target.value) }).run()} />
          <span className="findbar-count" data-testid="img-width-value">{s.imageWidth} px</span>
        </div>
      )}

      {findOpen && <FindReplace editor={editor} seed={findSeed} onClose={() => { setFindOpen(false); editor.commands.focus(); }} />}
      {dictating && <div className="dict-live" role="status" aria-live="polite" data-testid="dict-live">Listening… {interim}</div>}

      <TableSize open={tableOpen} onOpenChange={setTableOpen}
        onInsert={(rows, cols) => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); }} />
    </>
  );
}
