import { describe, it, expect } from "vitest";
import pg from "pg";
import { db, isNeonUrl } from "../src/client";

describe("db driver selection", () => {
  it("recognises Neon hosts, including pooled endpoints", () => {
    expect(isNeonUrl("postgres://u:p@ep-cool-sun-123.us-east-2.aws.neon.tech/neondb?sslmode=require")).toBe(true);
    expect(isNeonUrl("postgresql://u:p@ep-cool-sun-123-pooler.eu-central-1.aws.neon.tech/db")).toBe(true);
  });
  it("treats local, CI and other hosts as plain Postgres", () => {
    expect(isNeonUrl("postgres://postgres:postgres@localhost:5432/appuscholar")).toBe(false);
    expect(isNeonUrl("postgres://u:p@127.0.0.1/db")).toBe(false);
    expect(isNeonUrl("postgres://u:p@db.notneon.tech.example.com/db")).toBe(false);
    expect(isNeonUrl("postgres://u:p@evilneon.tech/db")).toBe(false);
    expect(isNeonUrl("not a url")).toBe(false);
  });
  it("uses node-postgres for a non-Neon URL (lazy pool, no connection made)", async () => {
    const d = db("postgres://postgres:postgres@localhost:5432/appuscholar") as unknown as { $client: unknown };
    expect(d.$client).toBeInstanceOf(pg.Pool);
    await (d.$client as pg.Pool).end();
  });
  it("uses the Neon HTTP driver for a Neon URL", () => {
    const d = db("postgres://u:p@ep-x.us-east-2.aws.neon.tech/db") as unknown as { $client: unknown };
    expect(d.$client).not.toBeInstanceOf(pg.Pool);
    expect(typeof d.$client).toBe("function");
  });
});
