# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

# Baked in at build time, not read at runtime: Vite substitutes import.meta.env
# into the bundle, so there is no process.env left to configure once these are
# static files. A different API URL means a different image — which is honest,
# because it is genuinely a different artifact.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace apps/web

FROM nginx:1.27-alpine AS runtime

# Where the API is, for the Content-Security-Policy — *not* for the bundle, which
# already had it baked in above. Two places needing the same value is the price
# of a static frontend that talks to a separate origin; the default is repeated
# rather than shared because an ARG does not cross a stage boundary.
#
# Unlike VITE_API_URL this one is read at container start, so a deployment can
# correct it without a rebuild. Getting it wrong is loud: the browser console
# names the blocked origin.
ARG VITE_API_URL=http://localhost:4000
ENV API_ORIGIN=$VITE_API_URL

# Templates, not a finished conf: nginx's entrypoint runs the `.envsh` first (it
# sources it, deriving the WebSocket origin) and then envsubst over the template.
# `--chmod`, and it is load-bearing rather than tidy: the entrypoint skips a
# script in this directory that is not executable, and it does so with a log line
# nobody reads and no failure — the container then dies on an unsubstituted
# variable, which is how this was found.
COPY --chmod=0755 apps/web/10-derive-ws-origin.envsh /docker-entrypoint.d/10-derive-ws-origin.envsh
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
