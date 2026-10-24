"use client";
import type { SnippetPart } from "@appuscholar/core";

/** Text runs from core (shSnippetParts, shMarkedParts), the marked ones in <mark>: React escapes the text, so nothing is set as HTML. */
export function Parts({ parts }: { parts: SnippetPart[] }) {
  return <>{parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
