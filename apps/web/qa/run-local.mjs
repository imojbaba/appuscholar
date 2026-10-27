// The QA layer on a Mac, in one command: `pnpm --filter @appuscholar/web qa:local [playwright args]`.
//   0. runs one case at a time unless QA_WORKERS is set (the pglite note below);
//   1. refuses to start when a QA port is taken (a server left over from another run would answer, and the run would test old code);
//   2. starts pglite on the QA database port (e2e/support/pglite-postgres.mjs, migrations applied);
//   3. `qa:build` (the api bundle and `next build`), then `qa` with the arguments passed through (`-g harness`, `--project=phone`, ...);
//   4. stops pglite, whatever happened.
// The ports repeat the defaults of qa/support/origins.ts (this file is plain Node and cannot import it). Other checkouts' servers (8788, 3000, 5433) are never touched.
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const API_PORT = Number(process.env.QA_API_PORT || 8798);
const WEB_PORT = Number(process.env.QA_WEB_PORT || 3010);
const PG_PORT = Number(process.env.QA_PG_PORT || 5443);

/** Something answers on the port, or the port cannot be bound (on either address family). */
async function portInUse(port) {
  const answers = (host) => new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(1000, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
  const bindable = (host) => new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", (e) => resolve(e.code !== "EADDRINUSE"));
    s.listen({ port, host }, () => s.close(() => resolve(true)));
  });
  if ((await answers("127.0.0.1")) || (await answers("::1"))) return true;
  return !(await bindable("0.0.0.0")) || !(await bindable("::"));
}

if (process.env.QA_NO_SERVERS) {
  console.error("qa:local starts the servers itself; QA_NO_SERVERS is set. Unset it, or run `pnpm --filter @appuscholar/web qa` against servers you started.");
  process.exit(1);
}
const taken = [];
for (const [port, what] of [[API_PORT, "the QA api"], [WEB_PORT, "the QA web server"], [PG_PORT, "the QA database"]]) {
  if (await portInUse(port)) taken.push(`port ${port} is in use (${what} needs it)`);
}
if (taken.length) {
  console.error(`QA run refused: ${taken.join("; ")}.\nA server left over from another run would answer in its place and the run would test old code. Stop what holds the port (lsof -nP -iTCP:<port> -sTCP:LISTEN), or choose other ports with QA_API_PORT, QA_WEB_PORT and QA_PG_PORT.`);
  process.exit(1);
}

// One database for the api, the web server and signInAs. Always this run's pglite, whatever DATABASE_URL the shell has.
const env = { ...process.env, DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres` };
// One case at a time unless QA_WORKERS says otherwise: pglite-socket keeps one connection's messages together only inside a transaction, so with two workers
// the api's, the web server's and the test's connections can interleave a Parse and a Bind ("bind message supplies 4 parameters, but prepared statement requires 2"),
// and the api answers an ordinary request with a 500 or a 401. CI's Postgres service has no such limit and keeps the config's default of 2.
if (!env.QA_WORKERS) env.QA_WORKERS = "1";
// The build carries the commit so the harness can read it back in Help (the same path as the production pill). CI passes GITHUB_SHA itself.
if (!env.GITHUB_SHA) {
  try {
    env.GITHUB_SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: WEB_DIR, encoding: "utf8" }).trim();
  } catch {
    console.warn("git rev-parse HEAD failed: the build has no commit, so the version check will say NOT CHECKED.");
  }
}

let current;
let stopping = false;
const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd: WEB_DIR, env, stdio: "inherit", ...opts });
  current = child;
  child.once("error", (e) => { console.error(`${cmd}: ${e.message}`); resolve(1); });
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

// pglite: started first so a database that will not start fails before a build of several minutes.
// TZ=UTC: through its socket, pglite's session time zone follows the machine's (Etc/GMT-5 on a machine in IST, UTC+5:30), and `defaultNow()` columns (timestamps without a time zone)
// then lay down a clock hours ahead of the browser's: a project made a minute ago read "Edited 25 Oct" at 20:30 in Mumbai. The real database (Neon) and CI run on UTC.
const pglite = spawn(process.execPath, ["e2e/support/pglite-postgres.mjs"], { cwd: WEB_DIR, env: { ...env, PGLITE_PORT: String(PG_PORT), TZ: "UTC" }, stdio: ["ignore", "pipe", "inherit"] });
const pgExit = new Promise((resolve) => pglite.once("exit", (code) => resolve(code ?? 1)));
const pgReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("pglite did not become ready within 60 s")), 60_000);
  let seen = "";
  pglite.stdout.on("data", (d) => { seen += d; process.stdout.write(d); if (seen.includes("pglite postgres ready")) { clearTimeout(timer); resolve(); } });
  void pgExit.then((code) => { clearTimeout(timer); reject(new Error(`pglite exited with ${code} before it was ready`)); });
});

async function stopPglite() {
  if (pglite.exitCode !== null || pglite.signalCode !== null) return;
  pglite.kill("SIGTERM");
  const killer = setTimeout(() => pglite.kill("SIGKILL"), 5000);
  await pgExit;
  clearTimeout(killer);
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    current?.kill(sig);
  });
}

let code = 1;
try {
  await pgReady;
  code = await run("pnpm", ["run", "qa:build"]);
  if (code === 0 && !stopping) {
    const args = process.argv.slice(2);
    if (args[0] === "--") args.shift();
    code = await run("pnpm", ["run", "qa", ...args]);
  }
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
} finally {
  await stopPglite();
}
process.exit(code);
