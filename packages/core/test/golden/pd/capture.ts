import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * The seven strings of core/test/pd.test.ts (the three of its first three tests, then the four whose signatures it compares),
 * an empty string, two emails in one text, and a 12-digit number inside a longer digit run beside an exact 12-digit one.
 */
const TEXTS: Array<[id: string, text: string]> = [
  ["email-phone-id", "Write to asha@uni.ac.in or call +91 98765 43210, roll 9876543210. Aadhaar 1234 5678 9012, PAN ABCDE1234F."],
  ["statistics-not-personal", "n = 120, M = 3.45, SD = 0.9, year 2024, 12345"],
  ["mask-sentence", "Mail asha@uni.ac.in, phone 9876543210, PAN ABCDE1234F."],
  ["signature-email-x", "a@b.co x"],
  ["signature-email-y", "a@b.co y"],
  ["signature-email", "a@b.co"],
  ["signature-other-email", "c@d.co"],
  ["empty", ""],
  ["two-emails", "Send it to asha@uni.ac.in and to ravi.k@college.edu by Friday."],
  ["twelve-digits-inside-longer-run", "Reference 1234567890123456 was filed."],
  ["twelve-digits-exact", "Reference 123456789012 was filed."],
];

/** pdScanText and pdMask (v1 9529, 9534) called directly on v1. */
export const pd: Engine = {
  name: "pd",
  async capture(v1, { check }) {
    const cases = TEXTS.map(([id, text]) => ({ id, text, scan: v1.call("pdScanText", text), mask: v1.call("pdMask", text) }));
    return [writeFixture("pd", "cases", { cases }, v1, check)];
  },
};
