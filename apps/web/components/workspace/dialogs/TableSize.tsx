"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { parseTableSize } from "@/lib/editor/tableSize";
import { useT } from "@/lib/i18n";

/** v1's table-size prompt: one box, "3x4", at most 30 rows and 12 columns. */
export function TableSize({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange(open: boolean): void; onInsert(rows: number, cols: number): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="table-dialog" aria-describedby={undefined}>
        {open && <Form onCancel={() => onOpenChange(false)} onInsert={(r, c) => { onOpenChange(false); onInsert(r, c); }} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ onCancel, onInsert }: { onCancel(): void; onInsert(rows: number, cols: number): void }) {
  const t = useT();
  const [value, setValue] = useState("3x4");
  function submit() {
    const size = parseTableSize(value);
    if (!size) { toast("Type rows x columns, for example 3x4"); return; }
    onInsert(size.rows, size.cols);
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-3">
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">Insert table</DialogTitle>
      </DialogHeader>
      <Label htmlFor="tableSize">Table size — rows x columns (e.g. 3x4):</Label>
      <Input id="tableSize" value={value} onChange={(e) => setValue(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} data-testid="table-size-input" />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} data-testid="table-cancel">{t("sap_cancel_btn")}</Button>
        <Button type="submit" variant="primary" data-testid="table-insert">Insert</Button>
      </DialogFooter>
    </form>
  );
}
