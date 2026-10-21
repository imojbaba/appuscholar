import { budgetMarkdown, budgetRows, ctriMarkdown, piCvText } from "@appuscholar/core";
import { parseBlob, type BlobKind, type BlobShape } from "@/lib/blobs/kinds";
import type { ExportDeps } from "@/lib/export/projectExport";
import { VaultError } from "@/lib/vault/crypto";
import { zipPath } from "./files";

/*
 * Design and ethics' part of the project export (Task A3; ExportPartDef in lib/tools/registry): the three files the tabs download, made from the
 * project's own blobs with the same core functions, so the zip and the tab say the same. components/tools/design/index.ts loads this on demand.
 */

/**
 * One blob of the project, opened and of its kind's shape: null when the project has none, when it does not open (VaultError "corrupt") or when it is
 * not of its kind's shape (that file is left out and the rest still export). Any other failure, such as a locked vault, rejects.
 */
async function read<K extends BlobKind>(d: ExportDeps, kind: K): Promise<BlobShape<K> | null> {
  try {
    const s = await d.readBlob(kind);
    return s === null ? null : parseBlob(kind, s);
  } catch (e) {
    if (e instanceof VaultError && e.code === "corrupt") return null;
    throw e;
  }
}

/**
 * The files, in this order, under design/: the CTRI readiness report (when the checklist was ever ticked), the PI's CV text (when a CV is written) and
 * the budget (when rows are stored). A blob never filled in leaves its file out, so a project that never used the tabs adds nothing to the zip.
 */
export async function designFiles(d: ExportDeps): Promise<Array<{ path: string; data: string }>> {
  const files: Array<{ path: string; data: string }> = [];
  const ctri = await read(d, "design_ctri");
  if (ctri?.checklist && Object.keys(ctri.checklist).length > 0) files.push({ path: zipPath("ctri"), data: ctriMarkdown(ctri.checklist as unknown as Record<number, boolean>) });
  const pi = await read(d, "design_pi");
  const cv = piCvText((pi?.cv ?? "").trim());
  if (typeof cv === "string") files.push({ path: zipPath("pi"), data: cv });
  const budget = await read(d, "design_budget");
  if (budget?.rows && budget.rows.length > 0) files.push({ path: zipPath("budget"), data: budgetMarkdown(budgetRows(budget.rows)) });
  return files;
}
