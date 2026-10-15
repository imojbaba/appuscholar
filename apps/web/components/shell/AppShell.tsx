import { Wordmark } from "./Wordmark";
import { UserMenu } from "./UserMenu";
import { signOut } from "@/auth";
export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  async function signOutAction() { "use server"; await signOut({ redirectTo: "/signin" }); }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <UserMenu email={email} signOutAction={signOutAction} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
