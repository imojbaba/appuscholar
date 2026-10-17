import type { FixtureStatus } from "./fixture";
import type { V1 } from "./v1";
import { smoke } from "../smoke/capture";
import { statsDemos } from "../stats-demos/capture";
import { doctext } from "../doctext/capture";
import { accuracy } from "../accuracy/capture";
import { pd } from "../pd/capture";
import { aiuse } from "../aiuse/capture";
import { origin } from "../origin/capture";
import { providers } from "../providers/capture";

export type Engine = { name: string; capture(v1: V1, opts: { check: boolean; emit: boolean }): Promise<FixtureStatus[]> };

/** In task order; each later task appends its engines. */
export const ENGINES: Engine[] = [smoke, statsDemos, doctext, accuracy, pd, aiuse, origin, providers];
