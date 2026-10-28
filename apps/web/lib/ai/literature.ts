"use client";
import { useMemo } from "react";
import type { CallOpts } from "./callAI";

/*
 * Requests whose text is published papers (Analyse a paper, the reading shelf, research ranking and reading, citation tools) opt out of name suggestions (spec
 * 2026-10-24-participants-design.md C13): a paper is full of authors named "Carl" and "Meena" that are nobody in the student's study. Names on the participant list are still
 * matched in them. The caller wraps the AI button's entry point once, so every request it makes says so; the wrapper keeps whatever else the caller put in the options.
 */
type Call = (prompt: string, opts?: CallOpts) => Promise<string>;

/** `call` with `literature: true` added to every request's options. */
export const asLiterature = (call: Call): Call => (prompt, opts = {}) => call(prompt, { ...opts, literature: true });

/** asLiterature for a component: the same function while `call` is the same. */
export function useLiterature(call: Call): Call {
  return useMemo(() => asLiterature(call), [call]);
}
