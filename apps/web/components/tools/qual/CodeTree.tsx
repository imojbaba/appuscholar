"use client";
import { Fragment, useEffect, useId, useRef } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
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
 * A button for viewing the passages comes with the passages (a later task). `codes` must be a list that can be walked (the panel checks that first).
 */
export function CodeTree({ codes, editing, setEditing, disabled, onAdd, onRename, onDelete, confirmFor }: {
  codes: QualCode[];
  editing: Editing;
  setEditing: (e: Editing) => void;
  disabled: boolean;
  onAdd: (name: string, parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
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
              <span className="size-3.5 shrink-0 rounded-full border border-black/10" style={{ background: c.color }} aria-hidden="true" data-testid={"qual-swatch-" + c.id} />
              {ed === "rename" ? (
                <NameField label={t("qual_label_rename")} initial={c.name} saveLabel={t("qual_btn_save")} onSave={(n) => onRename(c.id, n)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <span className="min-w-0 flex-1 break-words text-[13.5px]" data-testid={"qual-name-" + c.id}>{c.name}</span>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} data-testid={"qual-add-sub-" + c.id} title={t("qual_tip_add_sub")} aria-label={t("qual_aria_add_sub", { name: c.name })} onClick={() => setEditing({ kind: "sub", id: c.id })}><Plus aria-hidden="true" /></Button>
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
