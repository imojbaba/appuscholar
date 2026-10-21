import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * Task G2, fix round 1: the tool registry's load order. A session's components/tools/<tool>/index.ts exports a Panel whose imports lead back to
 * the frame (placeHref, lib/tools). Here the qual module is that probe (test/fixtures/probe-tool), and it is the first module loaded, as a
 * session's own unit test of its facts or exportParts loads it: nothing on the way may read a module that is still loading. The registry reads
 * every module as it loads, so a tool's own files import it for types only (the structural check below).
 */

const WEB = join(__dirname, "..");
const TOOLS = ["design", "stats", "qual", "style", "words", "close", "slides", "viva"];
const REGISTRY = join(WEB, "lib/tools/registry");

/** Every .ts and .tsx file under a directory (none when it does not exist). */
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** Whether an import specifier in `file` names lib/tools/registry (by the @ alias or a relative path). */
function isRegistry(file: string, spec: string): boolean {
  const path = spec.startsWith("@/") ? join(WEB, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(file), spec) : null;
  return path !== null && path.replace(/\.tsx?$/, "").replace(/\/index$/, "") === REGISTRY;
}

/**
 * The imports of lib/tools/registry in a source that are more than types, as "file:line": `import`/`export … from` without `type`, a bare
 * `import "…"` and a dynamic `import("…")`. `import type` and `export type … from` are erased, so they are allowed.
 */
function registryValueImports(file: string, src: string): string[] {
  const hits: string[] = [];
  const at = (i: number) => relative(WEB, file) + ":" + (src.slice(0, i).split("\n").length);
  for (const m of src.matchAll(/\b(import|export)(\s+type\b)?[^;'"]*?\bfrom\s*["']([^"']+)["']/g)) if (!m[2] && isRegistry(file, m[3]!)) hits.push(at(m.index));
  for (const m of src.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g)) if (isRegistry(file, m[1]!)) hits.push(at(m.index));
  return hits;
}

vi.mock("@/components/tools/qual", () => vi.importActual("./fixtures/probe-tool/index"));
// The other tool modules are pinned to their unbuilt stub, so a tool session turning its own module on never changes BUILT_IN here (session B, 2026-10-21).
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

describe("the tool registry's load order (Task G2)", () => {
  it("a tool's index.ts loads first, its Panel importing placeHref and lib/tools, and the registry still reads every module", async () => {
    // Typed as the probe it is mocked with (the real qual module exports only `built`).
    const probe = (await import("@/components/tools/qual")) as unknown as typeof import("./fixtures/probe-tool/index");
    expect(probe.built).toBe(false);
    expect(typeof probe.Panel).toBe("function");
    const { placeHref, PLACE_TABS } = await import("@/lib/frame/places");
    expect(placeHref("p1", "collect", "coding")).toBe("/p/p1/collect/coding");
    expect(PLACE_TABS.collect).toEqual(["data", "power", "charts", "check", "scales", "coding"]);
    const registry = await import("@/lib/tools/registry");
    expect(registry.toolModule("qual").Panel).toBe(probe.Panel);
    expect([...registry.BUILT_IN].sort()).toEqual(["analyse", "chat", "cite", "idea", "psych", "research"]);
  });

  it("no tool's own file imports the registry for more than types (it reads TOOL_TABS from @/lib/tools/tabs)", () => {
    // The check itself: a value import, a re-export and a dynamic import are caught, by alias or relative path; a type import is not.
    const probe = join(WEB, "components/tools/qual/x.ts");
    expect(registryValueImports(probe, 'import { TOOL_TABS } from "@/lib/tools/registry";\nimport type { ToolFacts } from "@/lib/tools/registry";')).toEqual(["components/tools/qual/x.ts:1"]);
    expect(registryValueImports(probe, 'export { toolModule } from "../../../lib/tools/registry";')).toHaveLength(1);
    expect(registryValueImports(probe, 'const r = () => import("@/lib/tools/registry");')).toHaveLength(1);
    expect(registryValueImports(probe, 'import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";\nimport { TOOL_TABS } from "@/lib/tools/tabs";')).toEqual([]);
    const hits = TOOLS.flatMap((t) => [...files(join(WEB, "components/tools", t)), ...files(join(WEB, "lib/tools", t))])
      .flatMap((f) => registryValueImports(f, readFileSync(f, "utf8")));
    expect(hits, "A tool's files may import @/lib/tools/registry with `import type` only: the registry reads every tool module as it loads, so a value import is a load-order cycle. Import TOOL_TABS from @/lib/tools/tabs instead.").toEqual([]);
  });
});
