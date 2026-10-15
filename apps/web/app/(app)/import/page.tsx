import Link from "next/link";
import { ImportV1 } from "@/components/ImportV1";
export default function ImportPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <Link href="/projects">← Research Projects</Link>
      <h1 style={{ color: "var(--primary)" }}>Import a v1 backup</h1>
      <ImportV1 />
    </div>
  );
}
