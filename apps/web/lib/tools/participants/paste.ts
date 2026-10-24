import { codeOf } from "@appuscholar/core";
import type { Participant } from "@/lib/blobs/kinds/participants";
import type { PastedPerson, SkippedPerson } from "./list";

/*
 * Paste a list (spec 2026-10-24-participants-design.md §5 and call C16). The text is read into people for list.ts addPeople, which does the rest (the next codes, joined = today, skipping a
 * name or a code already used). One person per line; the first cell is the name and the cells after it are other spellings (so "the text after the first comma"), and a tab splits cells
 * as a comma does, so a list pasted from a spreadsheet reads the same. A key file is read with its codes kept: v1's key file (Statistics' appuscholar_key_keep_separate.csv) starts with
 * the heading ParticipantCode and each line after it is the code and then the name (its later cells are other coded columns of the data, not spellings, so they are not read); without
 * that heading, a line that starts with a code (P and one to six digits, any case) is read the same way, with the cells after the name as spellings. Blank lines are skipped, and so
 * is a line with no name. Quotes around a cell are removed and a comma inside quotes stays in the cell.
 */

/** A participant code as a line may start with it (the same shape list.ts keeps: P and one to six digits). */
const CODE = /^P\d{1,6}$/i;

/** The cells of one line: split on commas and tabs outside double quotes, trimmed, the quotes around a cell removed (a doubled quote inside quotes is one quote). */
function cellsOf(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
    } else if (c === '"' && cur.trim() === "") { quoted = true; cur = ""; }
    else if (c === "," || c === "\t") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  // Curly quotes round a whole cell come from a word processor; they go as straight ones do.
  return out.map((s) => s.trim().replace(/^“([^]*?)”$/, "$1").trim());
}

/** The people a pasted text names, in order. Codes are upper case; a code is given only where the text had one. */
export function parsePaste(text: string): PastedPerson[] {
  const rows = text.replace(/^﻿/, "").split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").map(cellsOf);
  const keyFile = rows.length > 0 && rows[0]![0]!.toLowerCase() === "participantcode";
  const out: PastedPerson[] = [];
  rows.forEach((row, i) => {
    if (keyFile && i === 0) return;
    const coded = keyFile || CODE.test(row[0]!);
    const name = coded ? (row[1] ?? "") : row[0]!;
    if (!name) return;
    const spellings = keyFile ? [] : row.slice(coded ? 2 : 1).filter(Boolean);
    const code = coded && row[0] ? row[0].toUpperCase() : undefined;
    out.push({ name, spellings, ...(code ? { code } : {}) });
  });
  return out;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The codes of the people added as the result line shows them: a run as "P006–P007", otherwise each, up to eight. */
function codesText(codes: string[]): string {
  if (codes.length === 1) return codes[0]!;
  const nums = codes.map((c) => Number(c.slice(1)));
  if (nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1)) return codes[0]! + "–" + codes[codes.length - 1]!;
  return codes.slice(0, 8).join(", ") + (codes.length > 8 ? ", …" : "");
}

/** Names as the result line lists them: all of them, or the first ten and how many more. */
function namesText(t: Translate, names: string[]): string {
  return names.length <= 10 ? names.join(", ") : names.slice(0, 10).join(", ") + " " + t("pp_paste_more", { n: names.length - 10 });
}

/** A code as the list stores it ("P0003" is "P003"); a first cell that is not a code (a key file's odd cell) as it was typed. */
function storedCode(code: string): string {
  const m = /^P(\d{1,6})$/i.exec(code);
  return m && Number(m[1]) >= 1 ? codeOf(Number(m[1])) : code;
}

/**
 * The plain sentence after Paste a list, built from what addPeople did ("Added 2 people (P006–P007). Skipped 1 already on your list: Priya Sharma."). It sits in the page, where the
 * student can read the names; it is never a toast. A skip for a code already used names the code the line gave ("P003 Rahul Verma"), from `parsed`.
 */
export function pasteSummary(t: Translate, added: Participant[], skipped: SkippedPerson[], parsed: PastedPerson[]): string {
  const parts: string[] = [];
  const codes = codesText(added.map((p) => p.code));
  parts.push(added.length === 0 ? t("pp_paste_none") : added.length === 1 ? t("pp_paste_added_one", { codes }) : t("pp_paste_added_many", { n: added.length, codes }));
  const already = skipped.filter((s) => s.why === "already").map((s) => s.name.trim());
  const used = skipped.filter((s) => s.why === "code-taken").map((s) => {
    const code = parsed.find((p) => p.name === s.name && p.code)?.code;
    return (code ? storedCode(code) + " " : "") + s.name.trim();
  });
  if (already.length) parts.push(t("pp_paste_skipped_already", { n: already.length, names: namesText(t, already) }));
  if (used.length) parts.push(t("pp_paste_skipped_code", { n: used.length, names: namesText(t, used) }));
  return parts.join(" ");
}
