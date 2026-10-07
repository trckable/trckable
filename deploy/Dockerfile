# trckable — one small container: ingest, storage, API and dashboard.
#
#   docker build -f deploy/Dockerfile -t ghcr.io/trckable/trckable .
#   docker run -d -p 8080:8080 -v trckable-data:/data ghcr.io/trckable/trckable
#
# One static binary (DuckDB, libstdc++ and glibc linked in; Go's own DNS and
# user lookups) on distroless "static": CA certificates, time zones and
# nothing else, no shell, no package manager. About a third smaller than the
# glibc base it replaced, in the image and in memory. It runs as the
# unprivileged user 65532 (the "nonroot" tag): a new volume takes /data's
# owner from the image; a volume an older image filled as root needs
# `chown -R 65532:65532` once (the server says so when it cannot write), and
# Railway, which mounts its volume as root, needs RAILWAY_RUN_UID=0 on the service.

# The dashboard is built here, not committed: node runs on the build host.
FROM --platform=$BUILDPLATFORM node:22-trixie-slim AS web
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/ ./dashboard/
COPY tracker/ ./tracker/
COPY e2e/package.json ./e2e/package.json
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --filter @trckable/dashboard...
RUN pnpm --filter @trckable/dashboard build

FROM golang:1.27-trixie AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./server/
RUN cd server && go mod download
COPY server/ ./server/
COPY --from=web /src/server/internal/web/dist/ ./server/internal/web/dist/
COPY VERSION ./
ARG VERSION=
RUN V=${VERSION:-$(cat VERSION)} && cd server && CGO_ENABLED=1 go build -trimpath -tags netgo,osusergo \
      -ldflags="-s -w -linkmode external -extldflags=-static -X github.com/trckable/trckable/server/internal/server.Version=$V" \
      -o /out/trckabled ./cmd/trckabled \
 && mkdir -p /out/data

FROM gcr.io/distroless/static-debian13:nonroot
LABEL org.opencontainers.image.title="trckable" \
      org.opencontainers.image.description="Tiny self-hosted web analytics that shows which traffic pays" \
      org.opencontainers.image.source="https://github.com/trckable/trckable" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.vendor="trckable"
COPY --from=build /out/trckabled /usr/local/bin/trckabled
COPY --from=build --chown=65532:65532 /out/data /data
ENV TRCKABLE_DATA_DIR=/data
USER 65532:65532
# No VOLUME instruction: Railway rejects it (it mounts its own volume at /data);
# with plain Docker, mount one explicitly: -v trckable-data:/data
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/trckabled"]
CMD ["serve"]
