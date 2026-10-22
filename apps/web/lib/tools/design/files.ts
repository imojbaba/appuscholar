import { downloadBlob } from "@/lib/export/download";
import { localDay } from "@/lib/vault/export";

/** The three files Design and ethics makes (v1 ctriExport 6085-6096, piExportCv 6118-6127, budgetExport 6167-6177), by sub-tool. */
export type DesignFile = "ctri" | "pi" | "budget";

const FILES: Record<DesignFile, { stem: string; ext: string; type: string; zip: string }> = {
  ctri: { stem: "ctri-readiness", ext: "md", type: "text/markdown", zip: "design/ctri-readiness.md" },
  pi: { stem: "pi-cv", ext: "txt", type: "text/plain", zip: "design/pi-cv.txt" },
  budget: { stem: "trial-budget", ext: "md", type: "text/markdown", zip: "design/trial-budget.md" }
};

/** The download's name: v1's `<stem>-YYYY-MM-DD.<ext>`, by the local calendar day (v1 cut the day from UTC time, which in India is the day before from midnight until 05:30). */
export function datedName(file: DesignFile, now: Date): string {
  const f = FILES[file];
  return `${f.stem}-${localDay(now)}.${f.ext}`;
}

/** What of the three could not be opened, named in the project export (the root unreadable.txt is the export's own, so this part keeps its own under design/). */
export const UNREADABLE_PATH = "design/unreadable.txt";

/** The file's path in the project export (the same bodies, no date in the name: the zip's own name carries it). */
export function zipPath(file: DesignFile): string {
  return FILES[file].zip;
}

/** Saves one of the files as a download, with v1's media type. Returns the name it was saved as. */
export function saveDesignFile(file: DesignFile, body: string, now: Date): string {
  const name = datedName(file, now);
  downloadBlob(name, new Blob([body], { type: FILES[file].type }));
  return name;
}
