import { randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { db, users, type Db } from "@appuscholar/db";
import { encode } from "next-auth/jwt";
import { QA_AUTH_SECRET, QA_DATABASE_URL } from "./origins";

/** Auth.js's session cookie on http (it is `__Secure-authjs.session-token` on https). The cookie name is also the JWT's salt. */
const SESSION_COOKIE = "authjs.session-token";

let cached: Db | undefined;
/** One pool per test worker. */
function database(): Db {
  return (cached ??= db(QA_DATABASE_URL));
}

/**
 * Signs `context` in as a student: inserts the `users` row, mints the Auth.js session cookie and sets it on localhost.
 *
 * The production build has no test sign-in (apps/web/lib/e2eAuth.ts keeps the credentials provider off), so this does what the provider would: sessions are
 * JWTs (apps/web/auth.ts), and the session callback reads `token.uid`. The cookie is encrypted with the web server's AUTH_SECRET.
 *
 * Every call makes a new account (`qa-<uuid8>@qa.test`). With `email` it signs in as that address, and as the existing account if the address is already there
 * (a second device of the same student). The address must end with `@qa.test`: anything else is refused.
 */
export async function signInAs(context: BrowserContext, o: { email?: string } = {}): Promise<{ uid: string; email: string }> {
  const email = o.email ?? `qa-${randomUUID().slice(0, 8)}@qa.test`;
  // A QA run writes this account into the database and never removes it, so it must be an address no real person has.
  if (!email.endsWith("@qa.test")) throw new Error(`QA signInAs: ${JSON.stringify(email)} is not a QA address. Test accounts end with @qa.test.`);
  const name = "QA student";
  // The upsert returns the row either way, as the e2e provider's does (apps/web/auth.ts), so a known address gives its existing uid.
  const [row] = await database().insert(users).values({ email, name }).onConflictDoUpdate({ target: users.email, set: { name } }).returning({ id: users.id });
  if (!row) throw new Error(`QA signInAs: no users row for ${email}`);
  const uid = row.id;
  const value = await encode({ token: { uid, sub: uid, email, name }, secret: QA_AUTH_SECRET, salt: SESSION_COOKIE });
  await context.addCookies([{ name: SESSION_COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
  return { uid, email };
}
