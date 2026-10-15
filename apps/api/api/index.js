// Vercel function entry. `pnpm run build` (vercel.json buildCommand) produces ../dist/vercel.js, a fully bundled file with
// no external package imports except jsdom, before Vercel builds the function. The bundle is loaded lazily so that a
// boot failure surfaces as a readable 500 instead of FUNCTION_INVOCATION_FAILED.
let loaded;
const load = () => (loaded ??= import("../dist/vercel.js"));
const wrap = (method) => async (req, ctx) => {
  try {
    const m = await load();
    return m[method](req, ctx);
  } catch (e) {
    loaded = undefined;
    const msg = "api boot error: " + (e && e.stack ? e.stack : String(e));
    console.error(msg);
    return new Response(msg, { status: 500, headers: { "content-type": "text/plain" } });
  }
};
export const GET = wrap("GET");
export const POST = wrap("POST");
export const PUT = wrap("PUT");
export const PATCH = wrap("PATCH");
export const DELETE = wrap("DELETE");
export const OPTIONS = wrap("OPTIONS");
