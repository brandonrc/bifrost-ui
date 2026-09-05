#!/usr/bin/env bash
# Bring up the local stack and wait until it can actually serve a sign-in.
#
# Waiting on "container started" is not the same as waiting on "realm
# imported": Keycloak accepts connections well before its import finishes, and
# a spec that starts then fails on a 404 discovery document looks like a bug in
# the dashboard. So this polls the things the specs need.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"

if [[ ! -f "$root/dist/index.html" ]]; then
  echo "==> building the SPA (dist/ is missing)"
  (cd "$root" && npm run build)
fi

# The browser reaches Keycloak by a name that must land on this machine.
# `*.localtest.me` does that in public DNS; a runner with its own resolver may
# not, and the failure downstream ("connection refused" mid-sign-in) does not
# say so. Fail here instead, with the fix.
if ! getent hosts keycloak.localtest.me >/dev/null 2>&1 \
   && ! ping -c1 -t1 keycloak.localtest.me >/dev/null 2>&1; then
  echo "keycloak.localtest.me does not resolve on this machine." >&2
  echo "Add it:  echo '127.0.0.1 keycloak.localtest.me' | sudo tee -a /etc/hosts" >&2
  exit 1
fi

# The document root is staged rather than mounted straight from dist: nginx
# serves the build *and* the runtime config a chart would mount beside it.
rm -rf "$here/.www"
mkdir -p "$here/.www"
cp -R "$root/dist/." "$here/.www/"
cp "$here/config.json" "$here/.www/config.json"

echo "==> starting the stack"
docker compose -f "$here/compose.yml" up -d

wait_for() {
  local what="$1" url="$2" deadline=$((SECONDS + 180))
  printf '==> waiting for %s' "$what"
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    if (( SECONDS > deadline )); then
      printf ' timed out\n'
      docker compose -f "$here/compose.yml" logs --tail=50
      exit 1
    fi
    printf '.'
    sleep 2
  done
  printf ' ok\n'
}

wait_for "keycloak realm" \
  "http://keycloak.localtest.me:5181/realms/bifrost-e2e/.well-known/openid-configuration"
wait_for "the dashboard" "http://127.0.0.1:5180/"
# Bifrost is not published; it is reached the way the browser reaches it.
wait_for "bifrost through nginx" "http://127.0.0.1:5180/api/v1/auth/providers"

echo "==> ready: http://127.0.0.1:5180"
