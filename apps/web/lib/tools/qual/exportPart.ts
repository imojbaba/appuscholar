import { qualBuildMarkdown, type QualCode } from "@appuscholar/core";
import { parseBlob } from "@/lib/blobs/kinds";
import type { ProjectDocument } from "@/lib/editor/docAccess";
import type { ExportDeps } from "@/lib/export/projectExport";
import type { ExportPartDef } from "@/lib/tools/registry";
import { VaultError } from "@/lib/vault/crypto";
import { localDay } from "@/lib/vault/export";
import { fileTitle } from "@/lib/vault/titles";
import { codeListDamaged } from "./codeList";
import { findPassages } from "./passages";

/*
 * Coding's export (v1 qualExportMarkdown 6311-6340): every code with the passages tagged with it, as Markdown made by core's qualBuildMarkdown (never reimplemented here),
 * for the Panel's button and for the project export's part. No code colour is in it (ruling R4: the tags in the documents carry none either).
 * This file imports the registry and the project export for types only (the tool modules' load-order rule, lib/tools/registry.ts).
 */

/** v1's file name, appuscholar-coded-passages-YYYY-MM-DD.md, by the local calendar day. */
export function qualExportName(now: Date): string {
  return `appuscholar-coded-passages-${localDay(now)}.md`;
}

/** The Markdown for these codes over these documents (in the order given). The code list must not be damaged: the engine walks parentId with no cycle guard. */
export function qualMarkdown(codes: QualCode[], docs: ProjectDocument[]): string {
  return qualBuildMarkdown(codes, (id) => findPassages(docs, id));
}

/** The project's documents the way the part opens them: live ones only, in creation order (the Panel's allDocuments() order), one that does not open left out. */
async function openDocuments(d: ExportDeps): Promise<ProjectDocument[]> {
  const list = (await d.listDocuments()).filter((s) => !s.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: ProjectDocument[] = [];
  for (const s of list) {
    const title = fileTitle(await d.openTitle(s, s.id));
    try {
      out.push({ id: s.id, title, html: await d.decrypt(await d.getDocument(s.id)), text: "" });
    } catch (e) {
      // As the Documents part does: a document that does not open is left out, anything else fails the export.
      if (e instanceof VaultError && e.code === "corrupt") continue;
      throw e;
    }
  }
  return out;
}

/** The codes stored for the project, or null when there are none to export: no blob, one that does not open or is not a list of codes, an empty list, or one whose parents loop. */
async function storedCodes(d: ExportDeps): Promise<QualCode[] | null> {
  let raw: string | null;
  try { raw = await d.readBlob("qual_codes"); } catch (e) {
    if (e instanceof VaultError && e.code === "corrupt") return null;
    throw e;
  }
  const codes = raw === null ? null : parseBlob("qual_codes", raw);
  return codes && codes.length > 0 && !codeListDamaged(codes) ? codes : null;
}

/** The module's part of the project export: qual/appuscholar-coded-passages-DATE.md, ticked, project-wide (every document of the project, register row D-S2-84). */
export const exportParts: ExportPartDef[] = [{
  part: "qual",
  labelKey: "qual_part_label",
  detailKey: "qual_part_detail",
  formatKey: "qual_part_format",
  ticked: true,
  async build(d) {
    const codes = await storedCodes(d);
    if (!codes) return [];
    return [{ path: `qual/${qualExportName(d.now)}`, data: qualMarkdown(codes, await openDocuments(d)) }];
  }
}];
