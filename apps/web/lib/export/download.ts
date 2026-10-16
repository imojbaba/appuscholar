/** Save a Blob as a file: a temporary link, clicked, whose object URL is revoked 4 s later (v1's timing). */
export function downloadBlob(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** v1's file-name rule: drop everything but word characters, hyphens and spaces; an empty result falls back to a default. */
export function safeFileName(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim() || "appuscholar-document";
}
