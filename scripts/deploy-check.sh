#!/usr/bin/env bash
# The one-click deploy templates still parse: every compose file resolves, the
# Helm chart lints and renders (also with the ingress on and an existing
# Secret), and the template metadata is valid. CI runs this when deploy/ or
# charts/ change; it needs Docker, and Helm or, failing that, an image with it.
#
#   scripts/deploy-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
ok() { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fail=1; }

# Variables the platforms fill in when they deploy a template.
export APP_DATA_DIR=/tmp/trckable-app APP_SEED=seed APP_PASSWORD=password
export SERVICE_URL_TRCKABLE=https://stats.example.com SERVICE_PASSWORD_64_SECRET=x SERVICE_PASSWORD_SETUP=y
export TRCKABLE_BASE_URL=https://stats.example.com TRCKABLE_SECRET=0123456789abcdef TRCKABLE_SETUP_TOKEN=token

echo "compose files"
for f in deploy/compose.yml deploy/coolify/trckable.yaml deploy/dokploy/docker-compose.yml; do
  if docker compose -f "$f" config -q 2>/dev/null; then ok "$f"; else bad "$f"; docker compose -f "$f" config -q || true; fi
done
# Umbrel adds the app_proxy container itself: give it an image so the file resolves.
proxy=$(mktemp)
trap 'rm -f "$proxy"' EXIT
printf 'services:\n  app_proxy:\n    image: scratch\n' >"$proxy"
f=deploy/umbrel/trckable/docker-compose.yml
if docker compose -f "$f" -f "$proxy" config -q 2>/dev/null; then ok "$f"; else bad "$f"; docker compose -f "$f" -f "$proxy" config -q || true; fi

echo "images are pinned"
if grep -rnE 'trckable/trckable:(latest)?($|[[:space:]"])' deploy charts --include='*.yml' --include='*.yaml' --include='*.md'; then bad "an image without a version tag"; else ok "every image carries a version tag"; fi

echo "template files"
python3 - <<'PY' && ok "dokploy template.toml, meta.json and umbrel manifest" || bad "template metadata"
import json, re, sys, tomllib
t = tomllib.load(open('deploy/dokploy/template.toml', 'rb'))
assert t['config']['domains'][0]['serviceName'] == 'trckable' and t['config']['domains'][0]['port'] == 8080
m = json.load(open('deploy/dokploy/meta.json'))
assert m['id'] == 'trckable'
manifest = open('deploy/umbrel/trckable/umbrel-app.yml').read()
assert re.search(r'^id: trckable$', manifest, re.M)
assert re.search(r'^port: \d+$', manifest, re.M)
PY
if python3 -c 'import json,sys; d=json.load(open("deploy/railway/railway.json")); assert d["deploy"]["healthcheckPath"]=="/healthz"'; then ok "deploy/railway/railway.json"; else bad "deploy/railway/railway.json"; fi

echo "helm chart"
if command -v helm >/dev/null; then
  helm() { command helm "$@"; }
else
  # No Helm here: the same chart through its official image (read-only).
  helm() { docker run --rm -v "$PWD/charts:/charts:ro" alpine/helm:3.17.0 "$@"; }
  CHART=/charts/trckable
fi
CHART=${CHART:-charts/trckable}
if helm lint "$CHART" >/dev/null; then ok "helm lint"; else bad "helm lint"; helm lint "$CHART" || true; fi
render() { helm template trckable "$CHART" "$@" >/dev/null; }
if render; then ok "helm template (defaults)"; else bad "helm template (defaults)"; fi
if render --set ingress.enabled=true --set baseUrl=https://stats.example.com; then ok "helm template (ingress on)"; else bad "helm template (ingress on)"; fi
if render --set secret.existingSecret=mine --set persistence.existingClaim=data; then ok "helm template (existing Secret and claim)"; else bad "helm template (existing Secret and claim)"; fi

# One replica and the data volume, whatever the values say.
out=$(helm template trckable "$CHART")
grep -q 'replicas: 1$' <<<"$out" && grep -q 'mountPath: /data' <<<"$out" && grep -q 'path: /healthz' <<<"$out" && ok "single replica, /data, /healthz probe" || bad "single replica, /data, /healthz probe"

exit $fail
