# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV CI=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY packages/scoring/package.json packages/scoring/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/discord/package.json apps/discord/

FROM base AS build
RUN npm ci --ignore-scripts
COPY tsconfig.base.json tsconfig.json ./
COPY packages/scoring/tsconfig.json packages/scoring/
COPY packages/scoring/src packages/scoring/src
COPY packages/contracts/tsconfig.json packages/contracts/
COPY packages/contracts/src packages/contracts/src
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/discord/tsconfig.json apps/discord/
COPY apps/discord/src apps/discord/src
RUN npx tsc -b

FROM base AS api-dependencies
RUN npm ci --omit=dev --ignore-scripts --workspace @platform/api

FROM base AS discord-dependencies
RUN npm ci --omit=dev --ignore-scripts --workspace @platform/discord

FROM ${NODE_IMAGE} AS runtime
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --disable-proto=delete"
WORKDIR /app
COPY --from=build /app/packages/scoring/package.json packages/scoring/
COPY --from=build /app/packages/scoring/dist packages/scoring/dist
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist

FROM runtime AS discord
COPY --from=discord-dependencies /app/package.json ./
COPY --from=discord-dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/discord/package.json apps/discord/
COPY --from=build /app/apps/discord/dist apps/discord/dist
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
ENV DATA_DIRECTORY=/app/data
USER node
VOLUME ["/app/data"]
CMD ["node", "apps/discord/dist/Main.js"]

FROM runtime AS api
ENV HOST=0.0.0.0 \
    PORT=3333
COPY --from=api-dependencies /app/package.json ./
COPY --from=api-dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health/ready`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/Main.js"]
