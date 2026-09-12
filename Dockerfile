# syntax=docker/dockerfile:1

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
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
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
# 3) tools: full node_modules + prisma CLI + tsx, used only by the
#    one-shot "migrate" compose service to run `prisma db push` and
#    the seed script against the shared sqlite volume. Not used to
#    serve traffic, so it is fine for it to be a heavier image.
##############################
FROM node:22-bookworm-slim AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npx prisma generate
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh
ENV NODE_ENV=production
ENTRYPOINT ["/app/docker/entrypoint.sh"]

##############################
# 4) runner: minimal image that only runs the built standalone server.
##############################
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Next.js standalone server + static assets + public files.
COPY --from=builder /app/.next/standalone ./
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

EXPOSE 3000
CMD ["node", "server.js"]
