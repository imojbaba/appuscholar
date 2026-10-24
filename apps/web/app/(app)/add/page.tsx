import { AddingPaper } from "@/components/literature/AddingPaper";

/**
 * "Adding this paper" (wave B Task 20, walk faults W5 and W13): the page the bookmark opens, `/add#capture=...`. It is the adding screen alone, with no ProjectShell around it: the
 * workspace (its header, its project, its document and its places) never renders in this tab, so the student sees the paper before the passphrase is asked, and nothing of the
 * workspace waits behind it.
 */
export default function AddPage() {
  return <AddingPaper />;
}
