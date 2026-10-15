/** v1 PD_SEND (index.html:9524). Order matters: counts are reported in this order. */
const PD_SEND: Array<[string, RegExp, string, number | null]> = [
  ["email address", /([^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,})/g, "[email]", null],
  ["phone number", /(^|\D)((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})(?!\d)/g, "[phone]", 1],
  ["ID number", /(^|\D)(\d{4}\s\d{4}\s\d{4}|\d{12}|[A-Z]{5}\d{4}[A-Z])(?![A-Za-z0-9])/g, "[id number]", 1]
];
export const PD_KINDS = PD_SEND.map(k => k[0]);

export function scanText(text: string): { counts: Record<string, number>; total: number; sig: string } {
  const counts: Record<string, number> = {}; let total = 0; const seen: string[] = [];
  for (const [kind, re] of PD_SEND) {
    const m = String(text).match(re);
    if (m && m.length) { counts[kind] = m.length; total += m.length; seen.push(kind + m.join("|")); }
  }
  return { counts, total, sig: seen.join("||") };
}

export function maskText(text: string): string {
  let o = String(text);
  for (const [, re, mask, keepGroup] of PD_SEND) o = o.replace(re, (_m, a: string) => (keepGroup ? a + mask : mask));
  return o;
}
