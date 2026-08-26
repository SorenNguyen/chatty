# syntax=docker/dockerfile:1

# Debian slim rather than Alpine, deliberately: `sharp` ships prebuilt binaries
# for glibc and needs libvips compiled from source on musl, which turns a
# thirty-second image build into a ten-minute one for no benefit here.
FROM node:22-slim AS base
WORKDIR /app
# Prisma's query engine needs OpenSSL and is not statically linked against it;
# without this the client fails at runtime, not at build, with an error about a
# missing shared library.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# ---- deps: the whole workspace, because the server imports @chatty/shared-types ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
# `npm ci` over `npm install`: it installs exactly the lockfile and fails if the
# two disagree, so an image can never be built from dependencies nobody chose.
RUN npm ci

# ---- build ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/server apps/server
RUN npx prisma generate --schema apps/server/prisma/schema.prisma
# tsconfig.build.json, not tsconfig.json — the latter includes tests, which
# would land in dist/ alongside the code they test.
RUN npm run build --workspace apps/server

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Production dependencies only. The build stage's node_modules holds TypeScript,
# vitest and every type package; none of it is reachable at runtime and all of it
# is attack surface.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client node_modules/@prisma/client
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/packages/shared-types packages/shared-types
COPY apps/server/prisma apps/server/prisma

# Uploads are written here. Declared as a volume so the compose file can keep
# them out of the container's writable layer, where a redeploy would drop them.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data

# Never root. A bug that gets code execution inside the container should not
# also get the right to rewrite the container.
USER node
EXPOSE 4000

# Migrations run at startup rather than in the image, because they need the
# database — which exists at deploy time, not at build time. `migrate deploy`
# only applies committed migrations and never generates or prompts.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/server/prisma/schema.prisma && node apps/server/dist/server.js"]
