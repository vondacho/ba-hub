# syntax=docker/dockerfile:1
#
# Multi-stage build for the ba-ddd Astro frontend.
#
# `astro build` with the @astrojs/node adapter in standalone mode emits a Node
# HTTP server at dist/server/entry.mjs plus the client assets under dist/client.
# Astro externalises its runtime dependencies rather than bundling them, so the
# production node_modules tree has to ship with the image.
#
# Both stages use /app as WORKDIR on purpose: the adapter enables filesystem
# sessions and bakes their absolute location — /app/node_modules/.astro/sessions
# — into the server bundle at build time, so the build and runtime working
# directories must line up. The chart mounts that path writable.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install against the lockfile alone first, so this layer stays cached until a
# dependency actually changes.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
# Starlight is configured with prerender: true, so this step also runs Pagefind
# over the emitted HTML and writes its search index into dist/client/pagefind.
RUN npm run build

# Re-resolve without devDependencies so only the runtime tree moves forward.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged; the chart's securityContext expects uid/gid 10001.
# 1000 is deliberately avoided — the stock node image already has "node" there.
RUN addgroup -g 10001 app \
 && adduser -u 10001 -G app -D -H -s /sbin/nologin app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app

# The standalone adapter reads HOST/PORT. 0.0.0.0 so the kubelet can reach the
# probes; both are overridable from the chart.
ENV HOST=0.0.0.0 PORT=4321
EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
