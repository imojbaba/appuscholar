import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { ImportV1 } from "@/components/ImportV1";
export default async function ImportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <Link href="/projects">← Research Projects</Link>
      <h1 style={{ color: "var(--purple-800)" }}>Import a v1 backup</h1>
      <ImportV1 />
    </main>
  );
}
