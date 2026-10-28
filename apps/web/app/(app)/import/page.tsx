import { redirect } from "next/navigation";
/** The v1 backup import is a dialog on the project list (also opened from Help); /import keeps old links working. */
export default function ImportPage() { redirect("/projects?import=1"); }
