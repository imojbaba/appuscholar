import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { DocumentList } from "@/components/DocumentList";
import { StageBar } from "@/components/StageBar";
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { id } = await params;
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
      <Link href="/projects">← Research Projects</Link>
      <StageBar stage="writing" />
      <h1 style={{ color: "var(--purple-800)" }}>Documents</h1>
      <DocumentList projectId={id} />
    </main>
  );
}
