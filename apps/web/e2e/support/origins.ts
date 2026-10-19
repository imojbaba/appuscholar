/**
 * The two origins the e2e runs against. CI keeps the defaults (api on 8788, web on 3000); a checkout whose usual ports are taken by another
 * checkout's dev servers sets E2E_API_PORT and E2E_WEB_PORT (playwright.config.ts starts its own servers there, and `reuseExistingServer`
 * then adopts nothing that belongs to the other checkout). The recipe in pglite-postgres.mjs's header shows a full local run.
 */
export const API_PORT = Number(process.env.E2E_API_PORT || 8788);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3000);
/** The api, as the web server is told it (NEXT_PUBLIC_API_URL). */
export const API_ORIGIN = `http://localhost:${API_PORT}`;
/** The web app, Playwright's baseURL. */
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
/** The workspace's address (the web origin's root), as a test of a page's URL. */
export const WORKSPACE_URL = new RegExp(`localhost:${WEB_PORT}/$`);
