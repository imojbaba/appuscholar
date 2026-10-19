import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 8's HTML escapes, called directly on v1 and recorded as `{ fn, args, out }`, the shape smoke/capture.ts uses: escHTML (v1 2606, a `const` arrow function, so it is read with eval)
 * and escAttr (8033). The inputs are the brief's: markup holding both quotes, null, undefined (an empty argument list, which JSON keeps as `[]`), 0, and a Devanagari string, which is v1's own
 * Hindi editor placeholder (`I18N.hi.editor_placeholder`, 2217; it holds double quotes, so both functions change it). false and "" are added to tell v1's `s==null` from a falsy test.
 */
export const html: Engine = {
  name: "html",
  async capture(v1, { check }) {
    const fns: Record<string, (...args: unknown[]) => unknown> = { escHTML: v1.eval("escHTML"), escAttr: v1.eval("escAttr") };
    const hindi = v1.eval<string>("I18N.hi.editor_placeholder");
    if (!/[ऀ-ॿ]/.test(hindi) || !hindi.includes('"')) throw new Error(`html: I18N.hi.editor_placeholder is not a Devanagari string with a double quote: ${hindi}`);
    const ARGS: unknown[][] = [[`<a href="x">&'"`], [null], [], [0], [hindi], [false], [""]];
    const cases = Object.entries(fns).flatMap(([fn, f]) =>
      ARGS.map((args) => {
        const out = Reflect.apply(f, undefined, args);
        if (typeof out !== "string") throw new Error(`html: v1 ${fn}(${JSON.stringify(args).slice(1, -1)}) returned ${typeof out}, not a string`);
        return { fn, args, out };
      }),
    );
    return [writeFixture("html", "cases", { cases }, v1, check)];
  },
};
