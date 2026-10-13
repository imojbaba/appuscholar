import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ProjectList } from "@/components/ProjectList";
export default async function Projects() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ color: "var(--purple-800)" }}>Research Projects</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" href="/import">Import v1 backup</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}><button className="btn">Sign out</button></form>
        </div>
      </header>
      <ProjectList />
    </main>
  );
}
