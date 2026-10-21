import { qualBuildMarkdown, type QualCode } from "@appuscholar/core";
import { parseBlob } from "@/lib/blobs/kinds";
import type { ProjectDocument } from "@/lib/editor/docAccess";
import type { ExportDeps } from "@/lib/export/projectExport";
import type { ExportPartDef } from "@/lib/tools/registry";
import { VaultError } from "@/lib/vault/crypto";
import { fileTitle } from "@/lib/vault/titles";
import { codeListDamaged } from "./codeList";
import { findPassages } from "./passages";

/*
 * Coding's export (v1 qualExportMarkdown 6311-6340): every code with the passages tagged with it, as Markdown made by core's qualBuildMarkdown (never reimplemented here),
 * for the Panel's button and for the project export's part. No code colour is in it (ruling R4: the tags in the documents carry none either).
 * This file imports the registry and the project export for types only (the tool modules' load-order rule, lib/tools/registry.ts).
 */

/** The local calendar day, YYYY-MM-DD (the rule of lib/vault/export localDay, repeated: that module pulls JSZip into this light one's import graph). */
const localDay = (d: Date) => { const z = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

/** appuscholar-coded-passages-YYYY-MM-DD.md, by the local calendar day (v1 took the UTC day). */
export function qualExportName(now: Date): string {
  return `appuscholar-coded-passages-${localDay(now)}.md`;
}

/** The Markdown for these codes over these documents (in the order given). The code list must not be damaged: the engine walks parentId with no cycle guard. */
export function qualMarkdown(codes: QualCode[], docs: ProjectDocument[]): string {
  return qualBuildMarkdown(codes, (id) => findPassages(docs, id));
}

/** The project's documents the way the part opens them: live ones only, in creation order (the Panel's allDocuments() order). One that does not open is left out and its title goes in `lost`. */
async function openDocuments(d: ExportDeps, lost: string[]): Promise<ProjectDocument[]> {
  const list = (await d.listDocuments()).filter((s) => !s.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: ProjectDocument[] = [];
  for (const s of list) {
    const title = fileTitle(await d.openTitle(s, s.id));
    try {
      out.push({ id: s.id, title, html: await d.decrypt(await d.getDocument(s.id)), text: "" });
    } catch (e) {
      // A document that does not open is left out and named in qual/unreadable.txt; any other failure fails the export.
      if (e instanceof VaultError && e.code === "corrupt") { lost.push(d.t("exp_unreadable_doc", { name: title })); continue; }
      throw e;
    }
  }
  return out;
}

/**
 * The codes stored for the project: `codes` is null when there are none to export. A blob that exists but cannot be used (it does not open, is not a list of codes, or its parents
 * loop) is also `lost`: the export says so rather than leave the file out silently. No blob, or an empty list, is simply no codes.
 */
async function storedCodes(d: ExportDeps): Promise<{ codes: QualCode[] | null; lost: boolean }> {
  let raw: string | null;
  try { raw = await d.readBlob("qual_codes"); } catch (e) {
    if (e instanceof VaultError && e.code === "corrupt") return { codes: null, lost: true };
    throw e;
  }
  if (raw === null) return { codes: null, lost: false };
  const codes = parseBlob("qual_codes", raw);
  if (!codes || codeListDamaged(codes)) return { codes: null, lost: true };
  return { codes: codes.length > 0 ? codes : null, lost: false };
}

/** The module's part of the project export: qual/appuscholar-coded-passages-DATE.md, ticked, project-wide (every document of the project, register row D-S2-84). */
export const exportParts: ExportPartDef[] = [{
  part: "qual",
  labelKey: "qual_part_label",
  detailKey: "qual_part_detail",
  formatKey: "qual_part_format",
  ticked: true,
  async build(d) {
    const { codes, lost: codesLost } = await storedCodes(d);
    // What could not be used is named in qual/unreadable.txt (the zip's root unreadable.txt is the export's own, and lists documents only when Documents is ticked).
    const lost: string[] = codesLost ? [d.t("exp_unreadable_data", { name: d.t("qual_part_label") })] : [];
    const files: Array<{ path: string; data: string }> = [];
    if (codes) files.push({ path: `qual/${qualExportName(d.now)}`, data: qualMarkdown(codes, await openDocuments(d, lost)) });
    if (lost.length) files.push({ path: "qual/unreadable.txt", data: d.t("exp_unreadable_head") + "\n\n" + lost.join("\n") + "\n" });
    return files;
  }
}];
