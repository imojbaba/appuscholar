import { db, type Db } from "@appuscholar/db";
import { QA_DATABASE_URL } from "./origins";

/**
 * What the server holds for one account, read from the test database the QA servers share (spec section 6: the server must never hold the student's words in clear). Reads only.
 *
 *  - `blobs`: every project blob of the account's projects, as stored: its kind and its body (ciphertext once the vault is on).
 *  - `titles`: the account's project titles and its documents' titles, as stored.
 *  - `userRows`: how many rows the account has in each table (by SQL table name), the account's own row included: after Delete my account every count is 0.
 *
 * These are SQL strings, not the schema's query builder: the builder's operators (`eq`, `inArray`) come from drizzle-orm, which only packages/db depends on and apps/web cannot
 * import, and nothing but package scripts may change in apps/web/package.json for the QA layer. The uid is a UUID and is checked to be one before it goes into a statement.
 */
export type ServerRows = {
  blobs: Array<{ kind: string; body: string }>;
  titles: string[];
  userRows: Record<string, number>;
};

let cached: Db | undefined;
/** One pool per test worker. */
function database(): Db {
  return (cached ??= db(QA_DATABASE_URL));
}

async function rows<T>(statement: string): Promise<T[]> {
  // node-postgres (the only driver a localhost database gets: packages/db/src/client.ts) answers { rows }.
  return ((await database().execute(statement)) as unknown as { rows: T[] }).rows;
}

/** A project of this account: its id is the key to its documents and blobs. */
const mine = (uid: string) => `select id from projects where user_id = '${uid}'`;

export async function serverRows(uid: string): Promise<ServerRows> {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uid)) throw new Error(`QA serverRows: ${JSON.stringify(uid)} is not an account id (a UUID, as signInAs returns it).`);
  const blobs = await rows<{ kind: string; body: string }>(`select kind, body from project_blobs where project_id in (${mine(uid)}) order by project_id, kind`);
  const projectTitles = await rows<{ title: string }>(`select title from projects where user_id = '${uid}' order by created_at, id`);
  const documentTitles = await rows<{ title: string }>(`select title from documents where project_id in (${mine(uid)}) order by created_at, id`);
  const counts = await rows<{ t: string; n: number }>(
    [
      `select 'users' as t, count(*)::int as n from users where id = '${uid}'`,
      `select 'projects', count(*)::int from projects where user_id = '${uid}'`,
      `select 'documents', count(*)::int from documents where project_id in (${mine(uid)})`,
      `select 'document_revisions', count(*)::int from document_revisions where document_id in (select id from documents where project_id in (${mine(uid)}))`,
      `select 'project_blobs', count(*)::int from project_blobs where project_id in (${mine(uid)})`,
      `select 'credentials', count(*)::int from credentials where user_id = '${uid}'`,
      `select 'ai_use_log', count(*)::int from ai_use_log where user_id = '${uid}'`,
      `select 'vault_keys', count(*)::int from vault_keys where user_id = '${uid}'`,
      `select 'audit_log', count(*)::int from audit_log where user_id = '${uid}'`,
      `select 'accounts', count(*)::int from accounts where user_id = '${uid}'`,
      `select 'sessions', count(*)::int from sessions where user_id = '${uid}'`
    ].join(" union all ")
  );
  return {
    blobs: blobs.map((b) => ({ kind: b.kind, body: b.body })),
    titles: [...projectTitles, ...documentTitles].map((t) => t.title),
    userRows: Object.fromEntries(counts.map((c) => [c.t, Number(c.n)]))
  };
}
