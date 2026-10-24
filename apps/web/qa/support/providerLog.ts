import { readFileSync } from "node:fs";
import type { ShimLogEntry } from "../provider-shim/core.mjs";
import { QA_PROVIDER_LOG } from "./origins";

export type { ShimLogEntry };

/**
 * The requests the fake AI provider has received, oldest first: the JSON lines of QA_PROVIDER_LOG, which the shim inside the api appends one request at a time.
 *
 * Only complete lines are read. Other workers' requests are being appended while this runs, and a long prompt (up to 60,000 characters) is not written in one
 * instant for a reader: what follows the last newline may be half a line, so it is left out (it is whole on the next read). A missing file is an empty log.
 */
export function readProviderLog(file: string = QA_PROVIDER_LOG): ShimLogEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const lines = text.split("\n");
  lines.pop(); // after the final newline: "" when the file ends cleanly, the start of a line still being written otherwise
  return lines.filter(Boolean).map((l) => JSON.parse(l) as ShimLogEntry);
}
