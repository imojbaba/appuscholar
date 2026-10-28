/** What the first-party error route may keep of a browser report. Anything that does not fit its pattern is replaced, never trimmed to fit. */

/** An error class name: a plain identifier of at most 60 characters, else "Error". */
export function errorClass(name: unknown): string {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name) ? name : "Error";
}

/**
 * The page route, path only: no query, no hash, at most 120 characters. A segment of 20 or more characters, with a run of 6 or more digits,
 * or with any character outside letters, digits, "_", "-" (an email, an encoded value) becomes ":id". Anything not starting with "/" becomes "/".
 */
export function routeOf(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/")) return "/";
  const bare = path.split(/[?#]/, 1)[0] ?? "/";
  const masked = bare.split("/").map(seg => seg === "" ? seg : seg.length >= 20 || /\d{6,}/.test(seg) || /[^A-Za-z0-9_-]/.test(seg) ? ":id" : seg).join("/");
  return masked.slice(0, 120) || "/";
}

/** A build version: 7 lower-case hex characters (the git short SHA) or "dev", else "unknown". */
export function buildOf(v: unknown): string {
  return typeof v === "string" && (v === "dev" || /^[0-9a-f]{7}$/.test(v)) ? v : "unknown";
}
