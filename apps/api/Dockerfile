# Build from the repository root (the workspace packages are needed):
#   docker build -f apps/api/Dockerfile -t appuscholar-api .
#   docker run -p 8788:8788 -e API_JWT_SECRET=... -e DATABASE_URL=... -e WEB_ORIGIN=https://... appuscholar-api
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @appuscholar/api...
# tsup bundles src/ and the @appuscholar/* workspace sources into apps/api/dist/index.js;
# npm dependencies stay external and resolve from apps/api/node_modules.
RUN pnpm --filter @appuscholar/api build
ENV NODE_ENV=production PORT=8788
EXPOSE 8788
CMD ["node", "apps/api/dist/index.js"]
