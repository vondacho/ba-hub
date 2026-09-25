# syntax=docker/dockerfile:1
#
# Multi-stage build for the ba-cm Astro frontend.
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
# 4322, after ba-portal's 4321. The chart injects the same number as PORT and
# as the container port, so the two cannot drift apart.
ENV HOST=0.0.0.0 PORT=4322
EXPOSE 4322

CMD ["node", "./dist/server/entry.mjs"]

# ---------- render ----------
# The same app plus a browser, for rendering a .ddd or .ddm from the command
# line — see src/cli/render.ts. Published separately, as ba-cm-render, so the
# server that runs the site does not carry a few hundred megabytes of Chromium it
# never uses.
#
#   docker run --rm -i ghcr.io/vondacho/ba-hub/ba-cm-render \
#     render --kind ddd --format png < insurance.ddd > insurance.png
#
# A browser, because the picture of a map is the canvas itself, copied with the
# styles the browser computed for it (src/lib/graph/svg-file.ts). There is no
# second renderer to call instead, on purpose. The text formats — PlantUML,
# Mermaid, the outline — need none of this, but they come with the same command.
#
# `render` is on PATH, so the node image's entrypoint runs it in place of the
# CMD. Chromium needs a font package or every label comes out empty, and a
# writable HOME for its profile. The app user has no home directory at all.
FROM runtime AS render
USER root
RUN apk add --no-cache chromium font-dejavu \
 && printf '#!/bin/sh\nexec node /app/dist/cli/render.mjs "$@"\n' > /usr/local/bin/render \
 && chmod 755 /usr/local/bin/render
USER app
ENV BA_CM_RENDER=1 CHROMIUM_PATH=/usr/bin/chromium HOME=/tmp

# ---------- default ----------
# The server, again, so that a plain `docker build` still produces it: the last
# stage is the default target, and `render` has to come after the stage it
# extends. CI names its target explicitly either way.
FROM runtime
