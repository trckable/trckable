# Deploy trckable

One container, one volume. Every option below runs the same image, `ghcr.io/trckable/trckable:0.5.8` (x86-64 and arm64), pinned to a release, keeps its data in `/data`, and is healthy when `GET /healthz` answers 200 (`/readyz` also waits for the write-ahead log and the control database; Kubernetes uses both).

| Where | Files | Notes |
|---|---|---|
| Any server with Docker | [`compose.yml`](compose.yml) | `docker compose -f deploy/compose.yml up -d` |
| Railway | [`railway/`](railway) | a template: image, volume, healthcheck, draining |
| Coolify | [`coolify/trckable.yaml`](coolify/trckable.yaml) | a one-click service definition |
| Dokploy | [`dokploy/`](dokploy) | `docker-compose.yml`, `template.toml`, `meta.json` |
| Umbrel | [`umbrel/trckable/`](umbrel/trckable) | an app package for the Umbrel App Store |
| Kubernetes | [`../charts/trckable/`](../charts/trckable) | a Helm chart: one replica, a volume, optional ingress |

## What every option shares

- **The data volume is always persistent.** `/data` holds the database, the write-ahead log and the key that seals stored payment keys. Never run without a volume: each restart would start empty.
- **One writer.** trckable owns its data directory: one instance per volume, never two replicas. A redeploy stops the old container before the new one starts.
- **Draining.** On SIGTERM trckable finishes requests in flight for `TRCKABLE_DRAIN_SECONDS` (25) and writes everything to disk. Every option gives the container a longer grace period (30 s; Railway's draining is set to 30 s).
- **The first account.** Until one exists, trckable keeps a setup token. The templates that generate one (Railway, Coolify, Dokploy, the chart) set it as `TRCKABLE_SETUP_TOKEN`; open `/setup` on your address and paste it. Without that variable the server makes one and prints the full link, `/setup#token=…`, in its log on start. The token is gone for good once the account is made.
- **`TRCKABLE_SECRET`** (at least 16 characters) encrypts payment keys in the volume. The templates generate it; keep it when you move or restore the data, and do not change it.
- **Behind a proxy** (Caddy, nginx, Traefik, an ingress) set `TRCKABLE_TRUST_PROXY=xff`, and `TRCKABLE_BASE_URL` to the public address. The templates that sit behind a proxy already do.
- **Updating.** The tag in each file is the release it was made for. To update, change the tag to the new release and redeploy (`docker compose pull && docker compose up -d`, Redeploy in Coolify or Dokploy, `helm upgrade`). A migration that changes the store takes a copy of it first.
- The container runs as user 65532. A new volume takes `/data`'s owner from the image; Railway mounts its volume as root, so its template sets `RAILWAY_RUN_UID=0`; Kubernetes sets `fsGroup`.

## Docker Compose

```bash
curl -O https://raw.githubusercontent.com/trckable/trckable/main/deploy/compose.yml
docker compose up -d
docker compose logs trckable   # the setup link
```

## Railway

`railway/railway.json` is the service's config as code (healthcheck `/healthz`, draining 30 s, restart on failure). Railway's template editor holds the rest. To publish the template (needs the owner's Railway account):

1. In Railway: **New Project → Empty Project**, then **+ Create → Docker Image** with `ghcr.io/trckable/trckable:0.5.8`.
2. Variables: `PORT=8080`, `RAILWAY_RUN_UID=0`, `TRCKABLE_SECRET=${{secret(48)}}`, `TRCKABLE_SETUP_TOKEN=${{secret(32)}}`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`. The public address (`TRCKABLE_BASE_URL`) is taken from Railway's domain.
3. **Volumes → Add Volume**, mount path `/data`.
4. **Settings → Networking → Generate Domain** (port 8080). **Settings → Deploy → Healthcheck Path** `/healthz`, timeout 60. Number of replicas stays 1.
5. Open the project's **Settings → Generate Template from Project**, check that the four variables are kept (the secrets as generated, never a typed value), the volume is on the service, give it the name "trckable", the description "Tiny self-hosted web analytics that shows which traffic pays", and **Publish**.
6. Add the button to the README and the docs: `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/<template-slug>)`.

After deploying, open the service's **Variables**, copy `TRCKABLE_SETUP_TOKEN`, and open the Railway domain with `/setup`. Railway blocks outgoing SMTP; for email, set `TRCKABLE_RESEND_KEY` and `TRCKABLE_MAIL_FROM`.

## Coolify

Today: **Project → + New → Docker Compose Empty**, paste `coolify/trckable.yaml`, set the domain on the `trckable` service (port 8080), deploy. Coolify generates `TRCKABLE_SECRET` and `TRCKABLE_SETUP_TOKEN` (see them under Environment Variables).

To list it as a one-click service: copy the file to `templates/compose/trckable.yaml` in a fork of [coollabsio/coolify](https://github.com/coollabsio/coolify), the logo (`dashboard/public/favicon.svg`) to `svgs/trckable.svg`, and open a pull request following that repository's contributing guide.

## Dokploy

Today: **Create Service → Compose**, paste `dokploy/docker-compose.yml`, add the three variables of `template.toml`'s `[config.env]` under Environment (a 64-character `TRCKABLE_SECRET`, a 32-character `TRCKABLE_SETUP_TOKEN`, `TRCKABLE_BASE_URL=https://your.domain`), add the domain with port 8080 on the `trckable` service, deploy.

To list it as a template: in a fork of [Dokploy/templates](https://github.com/Dokploy/templates) create `blueprints/trckable/` with `docker-compose.yml`, `template.toml`, `meta.json` and the logo (`trckable.svg`), run `node build-scripts/generate-meta.js --check`, and open a pull request; the preview it deploys is where it is tried.

## Umbrel

`umbrel/trckable/` is an app package: `umbrel-app.yml`, `docker-compose.yml` and the data folder. Umbrel's own login stays in front of the dashboard; only the tracking script, the collection endpoints and payment webhooks (`/js/*`, `/api/e`, `/api/crawl`, `/webhooks/*`) are open, because sites and providers call them. Umbrel shows the setup token as the app's password: paste it on the setup page. Sites reach it from the internet through a tunnel (the Cloudflare Tunnel app) or any way you already expose Umbrel apps.

To test it before the store has it, copy the folder into a community app store or into a development Umbrel's `app-stores`, and install it.

To submit it: fork [getumbrel/umbrel-apps](https://github.com/getumbrel/umbrel-apps), copy the folder to `trckable/` at the top, refresh the image line with the release's tag and multi-arch digest (`docker buildx imagetools inspect ghcr.io/trckable/trckable:<version>`), set `version` to match, open the pull request, and then put its URL in `submission` and your name in `submitter`. Their team adds the gallery and the icon.

## Kubernetes (Helm)

```bash
git clone --depth 1 --branch v0.5.8 https://github.com/trckable/trckable.git
helm install trckable trckable/charts/trckable \
  --set ingress.enabled=true --set ingress.hosts[0].host=stats.example.com \
  --set baseUrl=https://stats.example.com
```

One replica (strategy `Recreate`), a 5 Gi volume claim at `/data` that is kept when the release is uninstalled, a Service, an optional Ingress, probes on `/healthz` and `/readyz`, resource requests, and the Secret: the chart makes one with random values that stay the same across upgrades, or name your own with `--set secret.existingSecret=NAME` (keys `secret` and `setup-token`). Read the setup token with the command the chart prints, then open `/setup`. Every value is in [`values.yaml`](../charts/trckable/values.yaml). To update: `git pull`, check out the new tag, `helm upgrade`.

## Checking the templates

`scripts/deploy-check.sh` resolves every compose file, lints and renders the chart, and parses the template files. CI runs it when `deploy/` or `charts/` change.
