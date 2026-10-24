"use client";
import { NumbersCheck } from "./NumbersCheck";
import { ResultsLinking } from "./ResultsLinking";

/** The Check tab (v1's "Numbers check" and "Results and data" dialogs, ncDlg and rtDlg): the numbers written in the document against their statistics, and the inserted results against their data. */
export function CheckTab({ projectId }: { projectId: string }) {
  return (
    <div className="panel" data-testid="stats-check">
      <NumbersCheck />
      <ResultsLinking projectId={projectId} />
    </div>
  );
}
