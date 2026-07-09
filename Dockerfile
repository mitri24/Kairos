# syntax=docker/dockerfile:1

# Kairos — zero-dependency Node backend + PWA in a single image.
#
# `node:sqlite` is compiled into the Node binary (no native build step, no extra
# system libraries), so a single-stage Alpine image is all we need. There are no
# npm dependencies to install either.
#
# Pinned to the multi-arch manifest-list digest for reproducible builds (the tag
# stays for readability; Docker resolves by digest). node:sqlite is an experimental
# API whose semantics can shift across 22.x patches — bump this deliberately.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

LABEL org.opencontainers.image.title="Kairos" \
      org.opencontainers.image.description="Adaptiver Lernplaner mit Fokus-Timer, PWA und Node/SQLite-Backend"

ENV NODE_ENV=production \
    PORT=4321 \
    LERNUHR_DB=/data/kairos.db

WORKDIR /app

# Copy only what the server reads at runtime: the backend, the shared domain
# logic and the static PWA assets. (See .dockerignore for what is left out.)
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY web ./web

# The SQLite database lives on a mounted volume, never inside the image.
# Pre-create the mount point owned by the unprivileged `node` user: Docker seeds
# a FRESH (empty) named volume from this directory, so the volume inherits `node`
# ownership and stays writable without ever running as root.
#
# NOTE: this seeding only applies to an EMPTY named volume. A bind mount or a
# pre-existing/restored volume stays root-owned and the non-root process fails
# with EACCES. See docs/DEPLOY.md → "Persistenz & Backup" for the chown recovery.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 4321

# Liveness probe: the API's cheapest GET. Dependency-free — uses Node's global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/api/time').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
