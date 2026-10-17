import type { FixtureStatus } from "./fixture";
import type { V1 } from "./v1";
import { smoke } from "../smoke/capture";
import { statsDemos } from "../stats-demos/capture";

export type Engine = { name: string; capture(v1: V1, opts: { check: boolean; emit: boolean }): Promise<FixtureStatus[]> };

/** In task order; each later task appends its engines. */
export const ENGINES: Engine[] = [smoke, statsDemos];
