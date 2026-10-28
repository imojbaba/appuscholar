"use client";
import type { ReactNode } from "react";
import { getResearch, setResearch, useResearchState } from "@/lib/research/useSearch";

/** One of the panel's <details> (v1 976, 999, 1011, 1026): opened or closed by the student, and kept so while the dock shows the AI tab. */
export function RsDetails({ name, id, className, testid, summary, children }: { name: string; id?: string; className?: string; testid: string; summary: ReactNode; children: ReactNode }) {
  const s = useResearchState();
  return (
    <details id={id} className={"rs-details" + (className ? " " + className : "")} data-testid={testid} open={!!s.details[name]} onToggle={(e) => {
      const on = e.currentTarget.open;
      if (on !== !!getResearch().details[name]) setResearch((st) => ({ details: { ...st.details, [name]: on } }));
    }}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
