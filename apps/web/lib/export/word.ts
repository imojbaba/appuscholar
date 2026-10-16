import { safeFileName } from "./download";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** v1's Download (Word): the editor HTML wrapped in the Word namespace (Times New Roman 12 pt, double spaced), saved as `.doc` with a BOM. */
export function wordDocument(title: string, bodyHtml: string): { filename: string; blob: Blob } {
  const name = title || "appuscholar-document";
  const html = '<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
    "<title>" + escHtml(name) + '</title><style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:2}</style>' +
    "</head><body>" + bodyHtml + "</body></html>";
  return { filename: safeFileName(name) + ".doc", blob: new Blob(["\uFEFF" + html], { type: "application/msword" }) };
}
