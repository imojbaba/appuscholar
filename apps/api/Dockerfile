FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @appuscholar/api...
RUN pnpm --filter @appuscholar/api build
ENV NODE_ENV=production PORT=8788
EXPOSE 8788
CMD ["node", "apps/api/dist/index.js"]
