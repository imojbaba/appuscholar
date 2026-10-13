# @appuscholar/api

Hono JSON API for Appuscholar v2. One app module (`src/app.ts`, configured in `src/index.ts`) runs in three places, and all
three run the **same bundle**: `dist/index.js`.

## What `pnpm --filter @appuscholar/api build` produces

`tsup` (config in `tsup.config.ts`) bundles `src/index.ts` into a single ESM file for Node 22:

- `dist/index.js` (+ `dist/index.js.map`)
- The workspace packages `@appuscholar/core` and `@appuscholar/db` ship TypeScript sources (`main: ./src/index.ts`), so they are
  **bundled in** (`noExternal: [/^@appuscholar\//]`).
- npm dependencies (hono, drizzle-orm, pg, @neondatabase/serverless, isomorphic-dompurify, jose, zod, …) stay **external** and are
  resolved from `apps/api/node_modules`. Every package the bundle imports must therefore be a direct dependency in
  `apps/api/package.json`, even when only a workspace package uses it. If you add a runtime dependency to `packages/core` or
  `packages/db`, add it here too.

`dist/index.js` exports `app` and, unless `VERCEL=1`, starts a Node server on `PORT` (default 8788).

Check it locally:

```sh
pnpm --filter @appuscholar/api build
API_JWT_SECRET=x node apps/api/dist/index.js &
curl -s localhost:8788/health   # {"ok":true}
```

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `API_JWT_SECRET` | always | Same value as in apps/web. |
| `DATABASE_URL` | production | `*.neon.tech` uses Neon's HTTP driver, anything else uses node-postgres. Without it (development only) the api uses an in-memory store. |
| `WEB_ORIGIN` | production | The web app's origin, used for CORS. Defaults to `http://localhost:3000` in development. |
| `PORT` | no | Node server port, default 8788. Ignored on Vercel. |

"Production" means `VERCEL=1` or `NODE_ENV=production`. In production the api throws at start-up if `DATABASE_URL` or
`WEB_ORIGIN` is missing, instead of silently falling back to the in-memory store and losing writes.

## Local development

`pnpm --filter @appuscholar/api dev` runs `tsx watch src/index.ts` (no build needed).

## Vercel

Project settings: **Root Directory** `apps/api`, framework preset **Other**. Vercel installs the pnpm workspace from the repo root.
`vercel.json` then:

1. runs `pnpm run build` (the tsup bundle above) as the build command;
2. serves `public/` (only `robots.txt`) as static output, so no source files are exposed;
3. rewrites every path to the function `api/index.js`, which imports `../dist/index.js` and exports the Hono app through
   `hono/vercel` for each HTTP method. `api/index.js` is plain JS so Vercel's function bundler never has to compile workspace
   TypeScript; it only traces the already-built bundle and its npm dependencies.

Set `API_JWT_SECRET`, `DATABASE_URL` and `WEB_ORIGIN` in the Vercel project. Vercel sets `VERCEL=1`, so the Node listener is not
started there and the production checks apply.

What could not be proven locally (there is no Vercel CLI login on the build machine) and must be checked on the first deploy:

- the build log shows `tsup` writing `dist/index.js` **before** the `api/index.js` function is bundled, and the function
  bundle includes `dist/index.js` and its traced npm dependencies (notably `isomorphic-dompurify` → `jsdom`, `pg`). If `dist/`
  is missing from the function, add `"functions": { "api/index.js": { "includeFiles": "dist/**" } }` to `vercel.json`;
- `GET https://<api-host>/health` returns `{"ok":true}` and an authenticated `GET /projects` returns `[]` for a new user;
- request bodies stay under Vercel's 4.5 MB function limit (the web app chunks v1 imports to ≤ 3 MB of HTML per request).

What was proven locally: `node apps/api/dist/index.js` boots and serves `/health`, and importing `api/index.js` with
`VERCEL=1` plus a database URL and web origin returns `200 {"ok":true}` from the exported `GET` handler.

## Docker

`apps/api/Dockerfile` builds from the **repository root** (it needs the workspace packages):

```sh
docker build -f apps/api/Dockerfile -t appuscholar-api .
docker run -p 8788:8788 -e API_JWT_SECRET=... -e DATABASE_URL=... -e WEB_ORIGIN=https://... appuscholar-api
```

It installs only the api and its workspace dependencies (`pnpm install --filter @appuscholar/api...`), runs the same tsup
build, sets `NODE_ENV=production` and starts `node apps/api/dist/index.js`. The root `.dockerignore` keeps `.env*`, `.git`,
`.superpowers`, `node_modules`, `.next` and `dist` out of the build context.
