import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../scripts/deploy-vercel.sh");
const run = (cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) =>
  spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
const git = (cwd: string, ...args: string[]) => {
  const r = run("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "protocol.file.allow=always", ...args], cwd);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const deploy = (cwd: string, app = "web") => run("bash", [SCRIPT, app], cwd, { DRY_RUN: "1" });

// Each case builds its own clone and origin, so the cases run in any order.
const roots: string[] = [];
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-script-"));
  roots.push(root);
  const origin = join(root, "origin.git");
  const repo = join(root, "clone");
  mkdirSync(origin);
  git(origin, "init", "--bare", "-b", "main");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  writeFileSync(join(repo, ".gitignore"), ".vercel/\n");
  writeFileSync(join(repo, "README.md"), "x\n");
  mkdirSync(join(repo, "apps/web/.vercel"), { recursive: true });
  writeFileSync(join(repo, "apps/web/.vercel/project.json"), '{"projectId":"prj_web","orgId":"team_x"}\n');
  git(repo, "add", ".");
  git(repo, "commit", "-m", "init");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-u", "origin", "main");
  return { root, origin, repo };
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("scripts/deploy-vercel.sh", () => {
  it("prints the vercel command with the commit as GITHUB_SHA (DRY_RUN=1)", () => {
    const { repo } = setup();
    const r = deploy(repo);
    const out = r.stdout;
    expect(r.status).toBe(0);
    expect(out).toMatch(/^vercel --prod --yes --archive=tgz --build-env GITHUB_SHA=[0-9a-f]{40}$/m);
    expect(out).toContain("GITHUB_SHA=" + git(repo, "rev-parse", "HEAD"));
    expect(out).toContain("Expect Help to show: Version " + git(repo, "rev-parse", "HEAD").slice(0, 7));
    expect(readFileSync(join(repo, ".vercel/project.json"), "utf8")).toBe(readFileSync(join(repo, "apps/web/.vercel/project.json"), "utf8"));
  });
  it("refuses a git worktree (exit 2)", () => {
    const { root, repo } = setup();
    const wt = join(root, "wt");
    git(repo, "worktree", "add", "--detach", wt);
    const r = deploy(wt);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/full clone, not a worktree/);
    expect(r.stdout).not.toMatch(/^vercel /m);
  });
  it("refuses a dirty tree (exit 3)", () => {
    const { repo } = setup();
    writeFileSync(join(repo, "README.md"), "changed\n");
    const r = deploy(repo);
    expect(r.status).toBe(3);
    expect(r.stdout).not.toMatch(/^vercel /m);
  });
  it("refuses a commit that is not pushed (exit 4) and an unlinked app (exit 5)", () => {
    const { repo } = setup();
    writeFileSync(join(repo, "README.md"), "local only\n");
    git(repo, "commit", "-am", "local");
    const unpushed = deploy(repo);
    expect(unpushed.status).toBe(4);
    expect(unpushed.stderr).toMatch(/push first/);
    git(repo, "push", "origin", "main");
    const unlinked = deploy(repo, "api");
    expect(unlinked.status).toBe(5);
    expect(unlinked.stdout).not.toMatch(/^vercel /m);
  });
  it("refuses when origin cannot be reached (exit 6)", () => {
    const { root, repo } = setup();
    git(repo, "remote", "set-url", "origin", join(root, "gone.git"));
    const r = deploy(repo);
    expect(r.status).toBe(6);
    expect(r.stderr).toMatch(/cannot reach origin/);
    expect(r.stdout).not.toMatch(/^vercel /m);
  });
  it("reads the remote's branches fresh: a commit pushed to the remote outside this clone's remote refs is deployable", () => {
    const { origin, repo } = setup();
    writeFileSync(join(repo, "README.md"), "pushed elsewhere\n");
    git(repo, "commit", "-am", "elsewhere");
    // Pushed by path, as another clone would: this clone's origin/* refs do not move until it fetches.
    git(repo, "push", origin, "HEAD:refs/heads/side");
    expect(git(repo, "branch", "-r", "--contains", "HEAD")).toBe("");
    const r = deploy(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("GITHUB_SHA=" + git(repo, "rev-parse", "HEAD"));
  });
});
