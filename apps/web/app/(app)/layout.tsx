import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return <AppShell email={session.user.email ?? ""}>{children}</AppShell>;
}
