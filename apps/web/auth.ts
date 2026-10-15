import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens } from "@appuscholar/db";
import { e2eAuthEnabled } from "@/lib/e2eAuth";

let cached: ReturnType<typeof db> | undefined;
function getDb() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = db(url);
  }
  return cached;
}
const e2e = e2eAuthEnabled();

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const database = getDb();
  return {
    adapter: DrizzleAdapter(database, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
    session: { strategy: "jwt" },
    pages: { signIn: "/signin" },
    providers: [
      // Google verifies email ownership, so linking a Google sign-in to an existing email-link account is safe and
      // avoids the OAuthAccountNotLinked dead end for students who first signed in by email.
      Google({ allowDangerousEmailAccountLinking: true }),
      Resend({ from: process.env.AUTH_EMAIL_FROM }),
      ...(e2e ? [Credentials({
        name: "E2E",
        credentials: { email: { type: "email" } },
        async authorize(c) {
          const email = String(c?.email ?? "");
          if (!email.endsWith("@e2e.local")) return null;
          const [u] = await database.insert(users).values({ email, name: "E2E user" }).onConflictDoUpdate({ target: users.email, set: { name: "E2E user" } }).returning();
          return u ? { id: u.id, email: u.email, name: u.name } : null;
        }
      })] : [])
    ],
    callbacks: {
      jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
      session({ session, token }) { if (typeof token.uid === "string") session.user.id = token.uid; return session; }
    }
  };
});
