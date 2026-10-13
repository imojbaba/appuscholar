import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
export function db(url: string) {
  return drizzle(neon(url), { schema });
}
export type Db = ReturnType<typeof db>;
