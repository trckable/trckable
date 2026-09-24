# trckable — one small container: ingest, storage, API and dashboard.
#
#   docker build -f deploy/Dockerfile -t ghcr.io/trckable/trckable .
#   docker run -d -p 8080:8080 -v trckable-data:/data ghcr.io/trckable/trckable
#
# One static binary (DuckDB, libstdc++ and glibc linked in; Go's own DNS and
# user lookups) on distroless "static": CA certificates, time zones and
# nothing else, no shell, no package manager. About a third smaller than the
# glibc base it replaced, in the image and in memory.

FROM golang:1.27-trixie AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./server/
RUN cd server && go mod download
COPY server/ ./server/
COPY VERSION ./
ARG VERSION=
RUN V=${VERSION:-$(cat VERSION)} && cd server && CGO_ENABLED=1 go build -trimpath -tags netgo,osusergo \
      -ldflags="-s -w -linkmode external -extldflags=-static -X github.com/trckable/trckable/server/internal/server.Version=$V" \
      -o /out/trckabled ./cmd/trckabled \
 && mkdir -p /out/data

FROM gcr.io/distroless/static-debian13
LABEL org.opencontainers.image.title="trckable" \
      org.opencontainers.image.description="Tiny self-hosted web analytics that shows which traffic pays" \
      org.opencontainers.image.source="https://github.com/trckable/trckable" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.vendor="trckable"
COPY --from=build /out/trckabled /usr/local/bin/trckabled
COPY --from=build /out/data /data
ENV TRCKABLE_DATA_DIR=/data
# No VOLUME instruction: Railway rejects it (it mounts its own volume at /data);
# with plain Docker, mount one explicitly: -v trckable-data:/data
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/trckabled"]
CMD ["serve"]
