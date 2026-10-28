import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

type TgDemo = { test: string; csv: string; sel?: Record<string, string>; extra?: Record<string, string>; tick?: string[]; rev?: string; rrange?: string };

/** port-audit-evidence/04-run-13-demo-datasets.cjs in TypeScript: each of v1's TG_DEMO datasets through the Stats Lab, as v1's tgDemo() runs it. */
export const statsDemos: Engine = {
  name: "stats-demos",
  async capture(v1, { check }) {
    const w = v1.window, d = v1.document;
    const field = (k: string) => d.getElementById("sf_" + k) as HTMLInputElement | null;
    const element = (id: string) => {
      const el = d.getElementById(id);
      if (!el) throw new Error(`v1 has no #${id} after statsRunNow()`);
      return el;
    };
    const demos = Object.entries(v1.eval<Record<string, TgDemo>>("TG_DEMO")).map(([id, dm]) => {
      v1.setValue("statsPaste", dm.csv); w._rtSkip = true; v1.call("statsParse"); w._rtSkip = false;
      v1.setValue("statsTest", dm.test); v1.call("statsFieldsRender");
      const cols = w._statsData.cols as Array<{ name: string; index: number }>;
      const idx = (n: string) => {
        const col = cols.find((c) => c.name === n);
        if (!col) throw new Error(`demo ${id}: no column ${n}`);
        return String(col.index);
      };
      for (const [k, n] of Object.entries(dm.sel ?? {})) { const el = field(k); if (el) el.value = idx(n); }
      for (const [k, x] of Object.entries(dm.extra ?? {})) { const el = field(k); if (el) el.value = x; }
      const tick = dm.tick;
      if (tick) d.querySelectorAll<HTMLInputElement>(".sfm_items").forEach((c) => { c.checked = tick.some((n) => idx(n) === c.value); });
      if (dm.rev) { v1.setValue("sf_rev", dm.rev); v1.setValue("sf_rrange", String(dm.rrange)); }
      v1.toasts.length = 0;
      v1.call("statsRunNow");
      const results = element("statsResults");
      return {
        id, test: dm.test, csv: dm.csv, sel: dm.sel, extra: dm.extra, tick: dm.tick, rev: dm.rev, rrange: dm.rrange,
        apa: element("statsSentence").textContent,
        resultsText: (results.textContent ?? "").replace(/\s+/g, " "),
        resultsHtml: results.innerHTML,
        toasts: [...v1.toasts],
      };
    });
    return [writeFixture("stats-demos", "demos", { demos }, v1, check)];
  },
};
