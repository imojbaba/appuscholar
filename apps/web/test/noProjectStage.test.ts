import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every line of web code under app, components and lib that matches `re`, as "path:line: text". */
function hits(re: RegExp): string[] {
  const out: string[] = [];
  for (const d of ["app", "components", "lib"]) {
    for (const f of files(join(ROOT, d))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => { if (re.test(line)) out.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`); });
    }
  }
  return out;
}

describe("project.stage", () => {
  // Stages are places with their own states (lib/frame/stages); the one stored stage is never read (impact map D1a, walk faults W10 and W29).
  it("no web code reads a project's stage (W29)", () => {
    expect(hits(/\b(project|proj|p|r\.project)\??\.stage\b/)).toEqual([]);
  });
});
