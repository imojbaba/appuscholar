/*
 * The participant list's dates are yyyy-mm-dd, kept as the day the student's own clock says (not the UTC day: at half past midnight in India the UTC day is yesterday), and shown as
 * day/month/year, as the mockup shows them.
 */

/** Today as yyyy-mm-dd on this computer's clock. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A yyyy-mm-dd date as dd/mm/yyyy; anything else as it was stored. */
export function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
