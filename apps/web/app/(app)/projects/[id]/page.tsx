import Link from "next/link";
import { DocumentList } from "@/components/DocumentList";
import { StageBar } from "@/components/StageBar";
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
      <Link href="/projects">← Research Projects</Link>
      <StageBar stage="writing" />
      <h1 style={{ color: "var(--primary)" }}>Documents</h1>
      <DocumentList projectId={id} />
    </div>
  );
}
