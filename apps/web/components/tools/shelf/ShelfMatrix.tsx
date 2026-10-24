"use client";
import { SHELF_DEFAULT_COLS, shColsOf } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { addColumn, deleteColumn, setCell } from "@/lib/shelf/actions";
import { useShelfStore } from "@/lib/shelf/useShelf";
import { Matrix } from "./Matrix";

/**
 * The shelf's comparison table on its own (the Matrix tab's body of the old Reading shelf dialog, which wave B Task 21 deleted), for the Literature place's Compare tab until Task 22
 * replaces it: the same store, columns and cells as the dialog's Matrix tab had.
 */
export function ShelfMatrix() {
  const t = useT();
  const store = useShelfStore();
  const { index, items } = store;
  const defaults = SHELF_DEFAULT_COLS;
  const cols = shColsOf(store.cols.value, defaults);
  return (
    <div className="sh-body" data-testid="shelf-matrix">
      {(index.locked || store.cols.locked) && <p className="sh-small" role="status" data-testid="sh-locked">{t("vault_shelf_locked")}</p>}
      <Matrix items={items} loading={index.loading && !index.locked} cols={cols}
        onAddCol={(name) => addColumn(name, defaults, store.setCols)}
        onDelCol={(i) => deleteColumn(i, defaults, store.setCols)}
        onCell={(id, col, value) => setCell(id, col, value, store.ops)} />
    </div>
  );
}
