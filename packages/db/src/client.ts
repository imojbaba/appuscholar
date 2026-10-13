import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Neon's HTTP driver only speaks to Neon. Everything else (local Postgres, CI service containers) goes through node-postgres. */
export function isNeonUrl(url: string): boolean {
  try {
    return /(^|\.)neon\.tech$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function db(url: string): Db {
  if (isNeonUrl(url)) return drizzleNeon(neon(url), { schema });
  return drizzleNodePg(new pg.Pool({ connectionString: url }), { schema });
}
