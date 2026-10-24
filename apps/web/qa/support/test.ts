import { test as base } from "@playwright/test";
import { QaCase, type Qa } from "./qa";

export { expect } from "@playwright/test";
export { notChecked } from "./qa";

/**
 * The `test` every QA case imports: Playwright's, with the `qa` fixture on every test (auto: a case does not ask for it, and its watcher and its result file cannot be
 * left out). A test begins its case with `qa.begin(meta)`; when it ends, the fixture attaches `qa-result` and fails the test if a check failed that no known fault explains (qa.ts).
 */
export const test = base.extend<{ qa: Qa }>({
  qa: [
    // The function that hands the fixture over is not called `use`: the React lint rules take that name for a hook.
    async ({ page, context }, provide, testInfo) => {
      const qa = await QaCase.start({ page, context, testInfo });
      await provide(qa);
      await qa.finish();
    },
    { auto: true }
  ]
});
