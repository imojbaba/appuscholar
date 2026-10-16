import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { SettingsProvider } from "@/lib/settings";
import { SessionProvider } from "@/lib/session";
import { KeysProvider } from "@/lib/ai/useKeys";
import { VaultProvider } from "@/lib/vault/useVault";
import { ToastHost } from "@/components/ui/toast";
import { getServerLang } from "@/lib/serverLang";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const lang = await getServerLang();
  async function signOutAction() { "use server"; await signOut({ redirectTo: "/signin" }); }
  return (
    <SettingsProvider initialLang={lang}>
      <SessionProvider value={{ email: session.user.email ?? "", signOutAction }}>
        <ToastHost />
        <KeysProvider><VaultProvider>{children}</VaultProvider></KeysProvider>
      </SessionProvider>
    </SettingsProvider>
  );
}
