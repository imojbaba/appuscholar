import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/** v1's two constants (2556–2564) as they stand: `const` bindings, so they are read through eval, not off the window. */
export const providers: Engine = {
  name: "providers",
  async capture(v1, { check }) {
    return [writeFixture("providers", "cases", { PROVIDERS: v1.eval("PROVIDERS"), PROV_ORDER: v1.eval("PROV_ORDER") }, v1, check)];
  },
};
