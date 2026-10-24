import { db, type Db } from "@appuscholar/db";
import { QA_DATABASE_URL } from "./origins";

/**
 * What the server holds for one account, read from the test database the QA servers share (spec section 6: the server must never hold the student's words in clear). Reads only:
 * every query runs in one `begin isolation level repeatable read read only` transaction (so a write cannot slip in, and every read sees the one snapshot the first took: at READ COMMITTED, Postgres's default, each statement would take its own), with the uid as a parameter.
 *
 *  - `blobs`: every project blob of the account's projects, as stored: its kind and its body (ciphertext once the vault is on).
 *  - `titles`: the account's project titles and its documents' titles, as stored.
 *  - `userRows`: how many rows the account has in each table that belongs to it, by SQL table name, its `users` row included. The tables are found in the database, not listed
 *    here: a table with a `user_id` column is counted by it; a table with `project_id` by the account's projects; one with `document_id` by the account's documents. Two tables are
 *    not reachable that way: `verification_tokens` is keyed by the address (`identifier`), not the account, and is not counted; and `audit_log` has no foreign key on purpose
 *    (packages/db/src/schema.ts: audit rows must survive account erasure), so after Delete my account every count is 0 except `audit_log`.
 *
 * The queries go through the node-postgres pool under the drizzle client (`$client`), because the query builder's operators come from drizzle-orm, which only packages/db
 * depends on: apps/web cannot import it, and nothing but package scripts may change in apps/web/package.json for the QA layer.
 */
export type ServerRows = {
  blobs: Array<{ kind: string; body: string }>;
  titles: string[];
  userRows: Record<string, number>;
};

/** The two things of node-postgres's pool and client that are used here. */
type Client = { query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>; release(): void };
type Pool = { connect(): Promise<Client> };

let cached: Db | undefined;
/** One pool per test worker. */
function database(): Db {
  return (cached ??= db(QA_DATABASE_URL));
}

/** A table name read from the database, quoted as an identifier. */
function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`QA serverRows: ${JSON.stringify(name)} is not a table name this reads.`);
  return `"${name}"`;
}

/** How a table belongs to an account: by the account's id on it, or through its projects, or through its documents. */
const OF_ACCOUNT = {
  user_id: (table: string) => `select count(*)::int as n from ${table} where user_id = $1`,
  project_id: (table: string) => `select count(*)::int as n from ${table} where project_id in (select id from projects where user_id = $1)`,
  document_id: (table: string) =>
    `select count(*)::int as n from ${table} where document_id in (select id from documents where project_id in (select id from projects where user_id = $1))`
} as const;
const COLUMNS = Object.keys(OF_ACCOUNT) as Array<keyof typeof OF_ACCOUNT>;

export async function serverRows(uid: string): Promise<ServerRows> {
  if (!uid) throw new Error("QA serverRows: needs the account's id (what signInAs returns as uid).");
  // node-postgres (the only driver a localhost database gets: packages/db/src/client.ts) answers { rows }.
  const client = await (database() as unknown as { $client: Pool }).$client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const mine = "select id from projects where user_id = $1";
    const blobs = (await client.query(`select kind, body from project_blobs where project_id in (${mine}) order by project_id, kind`, [uid])).rows;
    const projectTitles = (await client.query("select title from projects where user_id = $1 order by created_at, id", [uid])).rows;
    const documentTitles = (await client.query(`select title from documents where project_id in (${mine}) order by created_at, id`, [uid])).rows;

    // The tables that belong to an account, as the database says: by the first of user_id, project_id, document_id a table has.
    const columns = (
      await client.query(
        "select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name = any($1::text[]) order by table_name",
        [COLUMNS]
      )
    ).rows as Array<{ table_name: string; column_name: keyof typeof OF_ACCOUNT }>;
    const by = new Map<string, keyof typeof OF_ACCOUNT>();
    for (const c of columns) {
      const had = by.get(c.table_name);
      if (!had || COLUMNS.indexOf(c.column_name) < COLUMNS.indexOf(had)) by.set(c.table_name, c.column_name);
    }
    const userRows: Record<string, number> = {};
    userRows["users"] = Number((await client.query("select count(*)::int as n from users where id = $1", [uid])).rows[0]!["n"]);
    for (const [table, column] of by) userRows[table] = Number((await client.query(OF_ACCOUNT[column](ident(table)), [uid])).rows[0]!["n"]);

    return {
      blobs: blobs.map((b) => ({ kind: String(b["kind"]), body: String(b["body"]) })),
      titles: [...projectTitles, ...documentTitles].map((t) => String(t["title"])),
      userRows
    };
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
