import { redirect } from "next/navigation";
/** The v1 backup import is a workspace dialog (opened from Help); /import keeps old links working. */
export default function ImportPage() { redirect("/?import=1"); }
