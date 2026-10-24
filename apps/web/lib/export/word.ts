import { safeFileName } from "./download";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** v1's Download (Word): the editor HTML wrapped in the Word namespace (Times New Roman 12 pt, double spaced), saved as `.doc` with a BOM. */
export function wordDocument(title: string, bodyHtml: string): { filename: string; blob: Blob } {
  const name = title || "appuscholar-document";
  return { filename: safeFileName(name) + ".doc", blob: new Blob([wordText(title, bodyHtml)], { type: "application/msword" }) };
}

/** The `.doc` file's text (BOM included), for callers that write it somewhere other than a Blob, such as the export zip. */
export function wordText(title: string, bodyHtml: string): string {
  const name = title || "appuscholar-document";
  return "\uFEFF" + '<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
    "<title>" + escHtml(name) + '</title><style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:2}</style>' +
    "</head><body>" + bodyHtml + "</body></html>";
}
