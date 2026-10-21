"use client";
import { Fragment, useEffect, useId, useRef } from "react";
import { Eye, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { QualCode } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { NameField } from "./NameField";

/** Which inline field or question is open (only one at a time): the new top-level code (the panel draws that one), a sub-code under a row, a rename of a row, a delete question for a row. */
export type Editing = { kind: "top" } | { kind: "sub" | "rename" | "delete"; id: string } | null;

type Row = { code: QualCode; depth: number };

/** The codes in v1's order (qualRenderTree 6270-6288): from the top-level codes, each code and then its sub-codes in the order stored. A code whose parent is missing is never reached. Iterative: the list is a tree, but may be deep. */
function rows(codes: QualCode[]): Row[] {
  const kids = new Map<string | null, QualCode[]>();
  for (const c of codes) {
    const l = kids.get(c.parentId);
    if (l) l.push(c); else kids.set(c.parentId, [c]);
  }
  const out: Row[] = [];
  const stack: Row[] = [...(kids.get(null) ?? [])].reverse().map((code) => ({ code, depth: 0 }));
  while (stack.length) {
    const r = stack.pop()!;
    out.push(r);
    for (const code of [...(kids.get(r.code.id) ?? [])].reverse()) stack.push({ code, depth: r.depth + 1 });
  }
  return out;
}

/**
 * The code tree (v1 #qualTree): a row for each code with its colour, its name and three buttons, "+" (add a sub-code), rename and delete, indented 18px for each level of depth.
 * The sub-code field opens under the row, the rename field replaces the name, and the delete question (v1's confirm, in v1's words) opens under the row with Delete and Keep.
 * Tapping a code's name or its colour tags the selected passage of the document with it (v1 qualTagSelection, 6245-6263; `onTag`): both are buttons, and a press does not
 * take the selection from the editor (mousedown is cancelled, as the shelf's save button does). The eye button opens the code's passages (`onPassages`).
 * `codes` must be a list that can be walked (the panel checks that first).
 */
export function CodeTree({ codes, editing, setEditing, disabled, onAdd, onRename, onDelete, onTag, onPassages, confirmFor }: {
  codes: QualCode[];
  editing: Editing;
  setEditing: (e: Editing) => void;
  disabled: boolean;
  onAdd: (name: string, parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onTag: (id: string) => void;
  onPassages: (id: string) => void;
  confirmFor: (id: string) => string | null;
}) {
  const t = useT();
  return (
    <ul className="m-0 list-none p-0" data-testid="qual-tree" aria-label={t("qual_tree_label")}>
      {rows(codes).map(({ code: c, depth }) => {
        const ed = editing && editing.kind !== "top" && editing.id === c.id ? editing.kind : null;
        const indent = (d: number) => `${d * 18}px`;
        return (
          <Fragment key={c.id}>
            <li className="flex items-center gap-1.5 py-1" style={{ paddingLeft: indent(depth) }} data-testid={"qual-code-" + c.id}>
              <button
                type="button"
                className="relative size-3.5 shrink-0 cursor-pointer rounded-full border border-black/10 outline-none after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
                style={{ background: c.color }}
                disabled={disabled}
                data-testid={"qual-swatch-" + c.id}
                title={t("qual_tip_tag")}
                aria-label={t("qual_aria_tag", { name: c.name })}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onTag(c.id)}
              />
              {ed === "rename" ? (
                <NameField label={t("qual_label_rename")} initial={c.name} saveLabel={t("qual_btn_save")} onSave={(n) => onRename(c.id, n)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer break-words rounded-sm bg-transparent p-0 text-left text-[13.5px] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:no-underline"
                    disabled={disabled}
                    data-testid={"qual-name-" + c.id}
                    title={t("qual_tip_tag")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onTag(c.id)}
                  >{c.name}</button>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} data-testid={"qual-add-sub-" + c.id} title={t("qual_tip_add_sub")} aria-label={t("qual_aria_add_sub", { name: c.name })} onClick={() => setEditing({ kind: "sub", id: c.id })}><Plus aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" data-testid={"qual-passages-" + c.id} title={t("qual_tip_passages")} aria-label={t("qual_aria_passages", { name: c.name })} onClick={() => onPassages(c.id)}><Eye aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} data-testid={"qual-rename-" + c.id} title={t("qual_tip_rename")} aria-label={t("qual_aria_rename", { name: c.name })} onClick={() => setEditing({ kind: "rename", id: c.id })}><PencilSimple aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} data-testid={"qual-delete-" + c.id} title={t("qual_tip_delete")} aria-label={t("qual_aria_delete", { name: c.name })} onClick={() => setEditing({ kind: "delete", id: c.id })}><Trash aria-hidden="true" /></Button>
                </>
              )}
            </li>
            {ed === "sub" && (
              <li className="flex py-1" style={{ paddingLeft: indent(depth + 1) }} data-testid={"qual-sub-field-" + c.id}>
                <NameField label={t("qual_label_new_sub")} saveLabel={t("qual_btn_add")} onSave={(n) => onAdd(n, c.id)} onCancel={() => setEditing(null)} />
              </li>
            )}
            {ed === "delete" && (
              <li className="py-1" style={{ paddingLeft: indent(depth + 1) }} data-testid="qual-delete-confirm-row">
                <DeleteQuestion text={confirmFor(c.id)} onDelete={() => onDelete(c.id)} onKeep={() => setEditing(null)} />
              </li>
            )}
          </Fragment>
        );
      })}
    </ul>
  );
}

/**
 * v1's delete question, announced as an alert dialog named by its own sentence; focus goes to Keep (the safe answer) when it opens.
 * The panel returns focus when it closes.
 */
function DeleteQuestion({ text, onDelete, onKeep }: { text: string | null; onDelete: () => void; onKeep: () => void }) {
  const t = useT();
  const id = useId();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus(); }, []);
  return (
    <div role="alertdialog" aria-labelledby={id} data-testid="qual-delete-confirm">
      <p id={id} className="m-0 text-[13px]">{text}</p>
      <div className="mt-1.5 flex gap-2">
        <Button type="button" variant="primary" size="sm" data-testid="qual-delete-confirm-yes" onClick={onDelete}>{t("qual_btn_delete")}</Button>
        <Button ref={keep} type="button" variant="ghost" size="sm" data-testid="qual-delete-keep" onClick={onKeep}>{t("qual_btn_keep")}</Button>
      </div>
    </div>
  );
}
