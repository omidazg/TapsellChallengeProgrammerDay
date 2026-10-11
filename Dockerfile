##############################
# 1) deps: install all deps once (better-sqlite3 ships prebuilt
#    .node binaries for linux-x64 in its npm package, so no
#    python3/make/g++ toolchain is required here).
##############################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 ships prebuilt binaries for linux-x64, but npm's default
# install step still runs `node-gyp rebuild` because the package has a
# binding.gyp and no custom install/postinstall script. Provide a build
# toolchain so that step succeeds (it falls back to the bundled prebuild
# only when it can't compile at all); this keeps the build robust across
# architectures without depending on npm/node-gyp internals staying the
# same.
# apt sources stay on plain http:// on purpose: apt verifies every index and
# package against Debian's signed Release files (gpg), so TLS adds nothing to
# integrity here -- and node:*-slim ships without ca-certificates, which is why
# an https mirror used to need TLS verification switched off. Images are built
# on GitHub's runners (.github/workflows/build-images.yml), which reach
# deb.debian.org fine. Building somewhere deb.debian.org is unreachable (e.g.
# the Iranian VPS)? Pass a plain-http mirror:
#   docker build --build-arg APT_MIRROR=http://mirror.arvancloud.ir ...
ARG APT_MIRROR=""
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|$APT_MIRROR|g; s|http://security.debian.org|$APT_MIRROR/debian-security|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org|$APT_MIRROR|g; s|http://security.debian.org|$APT_MIRROR/debian-security|g" /etc/apt/sources.list; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

##############################
# 2) builder: generate the Prisma client and build the Next.js app.
##############################
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

##############################
# 3) tools: production node_modules + prisma CLI + tsx, used only by the
#    one-shot "migrate" compose service (`prisma migrate deploy` + the seed
#    scripts, see docker/entrypoint.sh) and by the "backup" service
#    (scripts/backup.mjs: better-sqlite3 only). Not used to serve traffic.
##############################
FROM node:22-bookworm-slim AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
# devDependencies (eslint, vitest, playwright, typescript, tailwind, ...) are
# never used here: prune them. `prisma` and `dotenv` are runtime deps and stay.
# The only dev tool migrate needs is tsx (entrypoint.sh: `npx tsx
# prisma/seed.ts`), so put it back from the deps stage together with its
# runtime deps (esbuild + its linux-x64 binary) and its .bin link -- without
# that link `npx tsx` would try to download tsx from the registry at runtime.
# --ignore-scripts: prune only deletes; it must not re-run install scripts
# (better-sqlite3's native build in node_modules is kept as-is).
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=deps /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
# Fail the image build (not the deploy) if tsx can't be resolved offline.
RUN ln -sf ../tsx/dist/cli.mjs ./node_modules/.bin/tsx \
    && npx --no-install tsx --version
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npx prisma generate
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/drop-privs.sh /app/docker/drop-privs.sh
# /app/data is the shared sqlite volume (bind mount on the server); the
# entrypoint chowns it to `node` before dropping privileges. node_modules/.cache
# is where config/TS loaders may cache, so the unprivileged user can write it.
RUN chmod +x /app/docker/entrypoint.sh /app/docker/drop-privs.sh \
    && mkdir -p /app/data /app/node_modules/.cache \
    && chown node:node /app/data /app/node_modules/.cache
ENV NODE_ENV=production
# Game times are shown/parsed in Tehran time (jdate/jtime use local hours;
# Node resolves this zone from its bundled ICU data, no tzdata needed).
ENV TZ=Asia/Tehran
# Runs as root only long enough to fix ownership of /app/data, then drops to
# `node` (docker/drop-privs.sh). The compose `backup` service overrides the
# entrypoint and goes through the same script.
ENTRYPOINT ["/app/docker/drop-privs.sh", "/app/docker/entrypoint.sh"]
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

##############################
# 4) runner: minimal image that only runs the built standalone server.
##############################
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Game times are shown/parsed in Tehran time (jdate/jtime use local hours;
# Node resolves this zone from its bundled ICU data, no tzdata needed).
ENV TZ=Asia/Tehran
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Next.js standalone server + static assets + public files.
# Owned by `node`: the server runs unprivileged and Next writes its runtime
# caches (image optimizer, ISR) under .next/.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema/config kept around for reference (not required at
# runtime by the web process, but harmless and useful for debugging).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# better-sqlite3 + the generated Prisma client are native/runtime deps
# used directly by src/lib/db.ts (via the driver adapter). Next's
# standalone trace usually pulls these in already, but we copy them
# explicitly to be robust against tracing gaps with native addons.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# sharp (used by src/lib/uploads.ts for image processing) ships its native
# bindings as optional per-platform packages under @img/*, resolved at
# `npm ci` time in the `deps` stage — since that stage also runs inside this
# same linux-x64 container, the linux binaries land in node_modules
# regardless of the host OS building the image. Next's standalone trace can
# miss sharp's dynamically-`require`d native addons, so copy them explicitly.
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=builder /app/node_modules/semver ./node_modules/semver

# Non-root runtime: drop-privs.sh starts as root only to chown the shared
# /app/data volume (dev.db, uploads/ -- created as root by older images), then
# re-execs the server as `node` (uid 1000). See docker/drop-privs.sh.
COPY docker/drop-privs.sh /app/docker/drop-privs.sh
RUN chmod +x /app/docker/drop-privs.sh \
    && mkdir -p /app/data /app/.next/cache \
    && chown node:node /app/data /app/.next/cache

EXPOSE 3000
ENTRYPOINT ["/app/docker/drop-privs.sh"]
CMD ["node", "server.js"]

# Last, so a new commit doesn't invalidate any cached layer above.
# /api/health reports it as `version`.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
