import { signIn } from "@/auth";
import { e2eAuthEnabled } from "@/lib/e2eAuth";
import { signinErrorMessage } from "@/lib/signinError";
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const e2e = e2eAuthEnabled();
  const error = signinErrorMessage((await searchParams).error);
  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>
      <h1 style={{ color: "var(--purple-800)" }}>Appuscholar</h1>
      <p style={{ color: "var(--muted)" }}>Sign in to open your projects.</p>
      {error ? <p role="alert" data-testid="signin-error" style={{ color: "crimson" }}>{error}</p> : null}
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/projects" }); }}>
        <button className="btn btn-purple" style={{ width: "100%" }}>Continue with Google</button>
      </form>
      <form action={async (fd: FormData) => { "use server"; await signIn("resend", { email: String(fd.get("email")), redirectTo: "/projects" }); }} style={{ marginTop: 12 }}>
        <input name="email" type="email" required placeholder="you@college.edu" style={{ width: "100%", padding: 10, marginBottom: 8 }} />
        <button className="btn" style={{ width: "100%" }}>Email me a sign-in link</button>
      </form>
      {e2e ? (
        <form action={async (fd: FormData) => { "use server"; await signIn("credentials", { email: String(fd.get("email")), redirectTo: "/projects" }); }} style={{ marginTop: 12 }} data-testid="e2e-form">
          <input name="email" type="email" defaultValue="tester@e2e.local" data-testid="e2e-email" />
          <button className="btn" data-testid="e2e-submit">E2E sign in</button>
        </form>
      ) : null}
    </main>
  );
}
