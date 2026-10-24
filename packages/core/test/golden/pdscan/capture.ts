import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 2's personal-data scan (v1 9411-9460: PD_HDR, PD_LABEL, PD_DEFAULT, pdTestVal, pdScan; 9464-9486: pdTransform) on the hand-written corpus in corpus.json,
 * `[{ id, text, choices? }]`: each text is a table, which v1's own statsParseText (9358) parses, as statsUpload (9403) does before the scan. The corpus and the value grid below are the
 * inputs a person writes; every output is v1's own.
 * - `cases`: `{ id, text, choices?, data, scan, transform? }`: `data` is v1's statsParseText(text), `scan` its pdScan(data) and, when the entry has choices, `transform` its
 *   pdTransform(data, choices) (choices keyed by column index, as v1's pdRender 9487 builds them).
 * - `values`: `{ kind, v, out }`, v1's pdTestVal(kind, v) over every kind of PD_HDR crossed with that kind's values in VALUES (pdTestVal knows email, phone, govid, dob and name;
 *   for roll and address it returns false).
 * - `tables`: v1's PD_LABEL and PD_DEFAULT, and PD_HDR as `{ kind, source, flags }`, so the test can hold the port's regexes to v1's.
 */
export const VALUES: Record<string, string[]> = {
  email: ["asha@example.com", "ravi.k@uni.ac.in", "a@b.co", "a@b.c", "asha@example", "asha example.com", "asha@@example.com", " asha@example.com", "asha@exa mple.com", "ASHA@EXAMPLE.ORG", "a+b@x.io", "asha@example.c0m"],
  phone: ["+91 98765-43210", "9876543210", "919876543210", "+919876543210", "(987) 654-3210", "5876543210", "98765 4321", "+1 9876543210", "98765432101", "9876.543210", "09876543210", "98765\t43210"],
  govid: ["ABCDE1234F", "abcde1234f", "1234 5678 9012", "1234-5678-9012", "123456789012", "12345678901", "ABCD1234F", "ABCDE 1234 F", "1234567890123", "ABCDE1234FG", "ABCDE-1234-F", "1234_5678_9012"],
  dob: ["12/31/2001", "2001-13-01", "31/12/2001", "1-1-1940", "01.01.2019", "01.01.2020", "1939-05-05", "1940/5/5", "2019.12.31", "12/31/01", "2001-1-1 ", "001/01/2001"],
  name: ["Asha Verma", "asha", "A. B. Sharma", "asha verma", "O'Neil Smith", "D’Souza Rao", "Asha  Verma", "Asha Verma2", "Asha-Verma Rao", "Asha ", "Ravi K.", "Dr. Meena Iyer"],
  roll: ["101", "R-101", "2021CS001", "Asha Verma", "asha@example.com", "9876543210", "ABCDE1234F", "12/31/2001", "", "x", "roll", "0"],
  address: ["12 MG Road", "Rampur", "Sector 5, Noida", "Asha Verma", "asha@example.com", "9876543210", "ABCDE1234F", "12/31/2001", "", "110001", "village", "PIN 560001"],
};

type Entry = { id: string; text: string; choices?: Record<string, string> };

export const pdscan: Engine = {
  name: "pdscan",
  async capture(v1, { check }) {
    const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8")) as Entry[];
    const ids = new Set<string>();
    for (const e of corpus) {
      if (ids.has(e.id)) throw new Error(`pdscan: corpus.json has the id ${e.id} twice`);
      if (typeof e.text !== "string") throw new Error(`pdscan: ${e.id} has no text`);
      ids.add(e.id);
    }
    const cases = corpus.map(({ id, text, choices }) => {
      const data = v1.call<unknown>("statsParseText", text);
      if (data === null) throw new Error(`pdscan: v1 parses ${id} to null; a scan needs a table`);
      const scan = v1.call<unknown>("pdScan", data);
      const transform = choices === undefined ? undefined : v1.call<unknown>("pdTransform", data, choices);
      return { id, text, choices, data, scan, transform };
    });
    const hdr = v1.eval<Array<[string, RegExp]>>("PD_HDR");
    const kinds = hdr.map(([k]) => k);
    if (JSON.stringify([...kinds].sort()) !== JSON.stringify(Object.keys(VALUES).sort())) throw new Error(`pdscan: PD_HDR's kinds are ${kinds.join(", ")}; VALUES must have exactly those`);
    const values = kinds.flatMap((kind) => VALUES[kind]!.map((v) => ({ kind, v, out: v1.call<boolean>("pdTestVal", kind, v) })));
    const tables = {
      PD_HDR: hdr.map(([kind, re]) => ({ kind, source: re.source, flags: re.flags })),
      PD_LABEL: v1.eval<Record<string, string>>("PD_LABEL"),
      PD_DEFAULT: v1.eval<Record<string, string>>("PD_DEFAULT"),
    };
    return [writeFixture("pdscan", "cases", { cases, values, tables }, v1, check)];
  },
};
