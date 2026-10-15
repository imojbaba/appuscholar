import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsProvider } from "@/lib/settings";
import { ToastHost } from "@/components/ui/toast";
import { getServerLang } from "@/lib/serverLang";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const lang = await getServerLang();
  return (
    <SettingsProvider initialLang={lang}>
      <AppShell email={session.user.email ?? ""}>{children}</AppShell>
      <ToastHost />
    </SettingsProvider>
  );
}
