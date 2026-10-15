"use client";
import { useEditorState, type Editor } from "@tiptap/react";
import { ArrowCounterClockwise, ArrowClockwise, ListBullets, ListNumbers, Table, TextB, TextHOne, TextHTwo, TextItalic, TextStrikethrough } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function Tb({ on, active, label, testId, children }: { on: () => void; active?: boolean; label: string; testId: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={active} data-testid={testId} onMouseDown={e => e.preventDefault()} onClick={on} className={cn("size-8", active && "bg-accent text-accent-foreground")}>
      {children}
    </Button>
  );
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  // useEditor does not re-render on transactions by default, so active flags are subscribed to explicitly.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      bullets: e.isActive("bulletList"),
      numbered: e.isActive("orderedList")
    }) : null
  });
  if (!editor || !active) return <div className="h-10" aria-hidden="true" />;
  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1" role="toolbar" aria-label="Formatting" data-testid="toolbar">
      <Tb on={() => chain().toggleHeading({ level: 1 }).run()} active={active.h1} label="Heading 1" testId="tb-h1"><TextHOne size={18} /></Tb>
      <Tb on={() => chain().toggleHeading({ level: 2 }).run()} active={active.h2} label="Heading 2" testId="tb-h2"><TextHTwo size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => chain().toggleBold().run()} active={active.bold} label="Bold" testId="tb-bold"><TextB size={18} /></Tb>
      <Tb on={() => chain().toggleItalic().run()} active={active.italic} label="Italic" testId="tb-italic"><TextItalic size={18} /></Tb>
      <Tb on={() => chain().toggleStrike().run()} active={active.strike} label="Strikethrough" testId="tb-strike"><TextStrikethrough size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => chain().toggleBulletList().run()} active={active.bullets} label="Bulleted list" testId="tb-bullets"><ListBullets size={18} /></Tb>
      <Tb on={() => chain().toggleOrderedList().run()} active={active.numbered} label="Numbered list" testId="tb-numbered"><ListNumbers size={18} /></Tb>
      <Tb on={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} label="Insert table" testId="tb-table"><Table size={18} /></Tb>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tb on={() => chain().undo().run()} label="Undo" testId="tb-undo"><ArrowCounterClockwise size={18} /></Tb>
      <Tb on={() => chain().redo().run()} label="Redo" testId="tb-redo"><ArrowClockwise size={18} /></Tb>
    </div>
  );
}
