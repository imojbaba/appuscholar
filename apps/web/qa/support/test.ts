import { test as base } from "@playwright/test";
import type { ShimLogEntry } from "../provider-shim/core.mjs";
import { QaCase, type Qa } from "./qa";
import { readProviderLog } from "./providerLog";

export { expect } from "@playwright/test";
export { notChecked } from "./qa";

/**
 * The `test` every QA case imports: Playwright's, with the `qa` fixture on every test (auto: a case does not ask for it, and its watcher and its result file cannot be
 * left out). A test begins its case with `qa.begin(meta)`; when it ends, the fixture attaches `qa-result` and fails the test if a check failed that no known fault explains (qa.ts).
 *
 * `providerLog`: where the case reads the fake AI provider's log from (the run's QA_PROVIDER_LOG). The fixture's own selftests give it a log of their own with
 * `test.use({ providerLog: { read: () => entries } })`, so they never write into the run's real one. It is an object, not a function: Playwright takes a function given
 * as a fixture value for the fixture itself.
 */
export const test = base.extend<{ qa: Qa; providerLog: { read: () => ShimLogEntry[] } }>({
  providerLog: [{ read: () => readProviderLog() }, { option: true }],
  qa: [
    // The function that hands the fixture over is not called `use`: the React lint rules take that name for a hook.
    async ({ page, context, providerLog }, provide, testInfo) => {
      const qa = await QaCase.start({ page, context, testInfo, readLog: providerLog.read });
      await provide(qa);
      await qa.finish();
    },
    { auto: true }
  ]
});
