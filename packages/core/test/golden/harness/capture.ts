// pnpm --filter @appuscholar/core golden:capture <engine>... | all [--check] [--emit]
import { ENGINES } from "./engines";
import { loadV1 } from "./v1";

const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith("--"));
const badFlags = args.filter((a) => a.startsWith("--") && a !== "--check" && a !== "--emit");
const badNames = names.filter((n) => n !== "all" && !ENGINES.some((e) => e.name === n));
if (names.length === 0 || badFlags.length > 0 || badNames.length > 0) {
  console.error(`usage: golden:capture <engine>... | all [--check] [--emit]\nengines: ${ENGINES.map((e) => e.name).join(", ")}`);
  if (badFlags.length > 0 || badNames.length > 0) console.error(`not known: ${[...badFlags, ...badNames].join(", ")}`);
  process.exit(2);
}
const opts = { check: args.includes("--check"), emit: args.includes("--emit") };

let differs = false;
for (const engine of ENGINES.filter((e) => names.includes("all") || names.includes(e.name))) {
  const v1 = await loadV1(); // a fresh page per engine: no capture sees another's localStorage or editor
  try {
    differs = (await engine.capture(v1, opts)).includes("differs") || differs;
  } finally {
    v1.window.close();
  }
}
process.exitCode = differs ? 1 : 0;
