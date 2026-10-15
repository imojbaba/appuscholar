import { signIn } from "@/auth";
import { e2eAuthEnabled } from "@/lib/e2eAuth";
import { signinErrorMessage } from "@/lib/signinError";
import { STAGES } from "@/lib/stages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/Wordmark";
import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const e2e = e2eAuthEnabled();
  const emailEnabled = Boolean(process.env.AUTH_RESEND_KEY);
  const error = signinErrorMessage((await searchParams).error);
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-secondary px-6 py-8 lg:px-14 lg:py-12">
        <Wordmark href="/signin" />
        <div className="my-12 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">A research supervisor in your browser, for psychology students.</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">Appuscholar walks a thesis from the first idea to the viva. It keeps every revision, checks your numbers, and asks questions instead of writing for you.</p>
          <ol className="mt-8 grid gap-2 text-sm">
            {STAGES.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-medium text-primary">{i + 1}</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">Private preview. Copyright 2026 Dr. Shiv Raj Sharma.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your projects are stored under your account and kept across devices.</p>
          {error ? <p role="alert" data-testid="signin-error" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/projects" }); }} className="mt-6">
            <Button type="submit" className="w-full" size="lg"><GoogleLogo size={20} weight="bold" /> Continue with Google</Button>
          </form>
          {emailEnabled ? (
            <form action={async (fd: FormData) => { "use server"; await signIn("resend", { email: String(fd.get("email")), redirectTo: "/projects" }); }} className="mt-6 grid gap-2">
              <Label htmlFor="email">Or get a sign-in link by email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@college.edu" />
              <Button type="submit" variant="outline" className="w-full">Email me a sign-in link</Button>
            </form>
          ) : null}
          {e2e ? (
            <form action={async (fd: FormData) => { "use server"; await signIn("credentials", { email: String(fd.get("email")), redirectTo: "/projects" }); }} className="mt-8 grid gap-2 rounded-md border border-dashed p-3" data-testid="e2e-form">
              <Label htmlFor="e2e-email">Test sign-in (development only)</Label>
              <Input id="e2e-email" name="email" type="email" defaultValue="tester@e2e.local" data-testid="e2e-email" />
              <Button type="submit" variant="secondary" data-testid="e2e-submit">E2E sign in</Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
