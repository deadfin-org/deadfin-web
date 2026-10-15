#!/usr/bin/env bash
# deadfin-web acceptance: hermetic, local, observable. Two targets:
#
#   ACCEPT_TARGET=jellyfin (default) — stock jellyfin 12.0.0 by digest, the
#     contract source of truth. Cross-origin (vite preview app → API). This is
#     the merge gate.
#   ACCEPT_TARGET=deadfin — pinned deadfin image, seeded with deadfin's own
#     gate tooling, same-origin behind nginx (production topology; also
#     required until the Deadfin CORS parity gap is fixed). This is the
#     parity probe: pass-on-stock/fail-on-deadfin = server finding.
#
# Requirements: docker (with compose), node. No network beyond localhost +
# pulling pinned images.
set -euo pipefail

cd "$(dirname "$0")"
HARNESS_DIR=$(pwd)
REPO_DIR=$(cd ../.. && pwd)
TARGET="${ACCEPT_TARGET:-jellyfin}"
USER_NAME=abyss
USER_PASS=trench-test-1
AUTH_HDR='Authorization: MediaBrowser Client="Deadfin Harness", Device="ci", DeviceId="harness", Version="0.1.0"'
JF_IMAGE='jellyfin/jellyfin@sha256:2d1a69be5aa2695d0c2df90ebeb76bbcc6efc0a798cb09bfa65906680e1d785a'
FFMPEG=/usr/lib/jellyfin-ffmpeg/ffmpeg

log() { printf '\033[36m[accept:%s]\033[0m %s\n' "$TARGET" "$*"; }
warn() { printf '\033[33m[accept:%s] WARNING:\033[0m %s\n' "$TARGET" "$*" >&2; }
fail() { printf '\033[31m[accept:%s] FAIL:\033[0m %s\n' "$TARGET" "$*" >&2; exit 1; }

# Absolute -f paths: the cleanup trap can fire after cd "$REPO_DIR".
case "$TARGET" in
  jellyfin) COMPOSE=(docker compose -f "$HARNESS_DIR/compose.yaml") ;;
  deadfin) COMPOSE=(docker compose -f "$HARNESS_DIR/compose-deadfin.yaml") ;;
  *) fail "unknown ACCEPT_TARGET '$TARGET'" ;;
esac

cleanup() {
  log 'tearing down'
  "${COMPOSE[@]}" --profile seed --profile test down -v --timeout 5 >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v docker >/dev/null || fail 'docker is required'
docker compose version >/dev/null 2>&1 || fail 'docker compose plugin is required'

# ---- 1. synthetic library ---------------------------------------------------
# VP9/Opus webm, not h264 mp4: Playwright's Chromium ships without proprietary
# codecs. 10s duration so playback tests can pause before 'ended'.
rm -rf .state
mkdir -p .state/media/movies .state/media/tv .state/media/music .state/media/photos .state/seed

# Docker Desktop's VirtioFS can silently swallow container writes to fresh
# bind-mounted dirs (exit 0, no file — observed 2026-07-29). Every generated
# file is therefore verified on the host and retried once.
gen_file() {
  local out="$1"; shift
  for attempt in 1 2; do
    docker run --rm --network none -v "$HARNESS_DIR/.state/media:/out" --entrypoint "$FFMPEG" "$JF_IMAGE" \
      -hide_banner -loglevel error "$@" "/out/${out}"
    [ -s ".state/media/${out}" ] && return 0
    warn "generated file missing on host (attempt ${attempt}): ${out}"
    sleep 1
  done
  fail "media generation kept producing no file: ${out}"
}

gen_movie() {
  local title="$1" pattern="$2"
  mkdir -p ".state/media/movies/${title}"
  gen_file "movies/${title}/${title}.webm" \
    -f lavfi -i "testsrc2=duration=10:size=640x360:rate=24" \
    -f lavfi -i "sine=frequency=440:duration=10" \
    -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 400k -pix_fmt yuv420p \
    -c:a libopus -b:a 64k -shortest
  gen_file "movies/${title}/poster.jpg" \
    -f lavfi -i "${pattern}" -frames:v 1
}

log 'generating synthetic media (ffmpeg from the pinned jellyfin image)'
gen_movie 'Voyage to the Trench (2021)'    'testsrc2=size=400x600'
gen_movie 'The Bioluminescent Zone (2019)' 'smptehdbars=size=400x600'
gen_movie 'Pressure Hull (2024)'           'mandelbrot=size=400x600'

# ---- helpers ----------------------------------------------------------------
wait_ping() { # $1 = base url
  for i in $(seq 1 60); do
    curl -fsS "$1/System/Ping" >/dev/null 2>&1 && return 0
    [ "$i" = 60 ] && return 1
    sleep 2
  done
}

api_login() { # sets TOKEN, AUTHED, USER_ID against $BASE
  TOKEN=$(curl -fsS -H "$AUTH_HDR" -H 'Content-Type: application/json' \
    -X POST "$BASE/Users/AuthenticateByName" \
    -d "{\"Username\":\"${USER_NAME}\",\"Pw\":\"${USER_PASS}\"}" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessToken"])')
  [ -n "$TOKEN" ] || fail 'API login failed'
  AUTHED="Authorization: MediaBrowser Client=\"Deadfin Harness\", Device=\"ci\", DeviceId=\"harness\", Version=\"0.1.0\", Token=\"${TOKEN}\""
  USER_ID=$(curl -fsS -H "$AUTHED" "$BASE/Users/Me" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["Id"])')
}

movie_id() { # $1 = name fragment; requires AUTHED/USER_ID
  curl -fsS -H "$AUTHED" "$BASE/Items?userId=${USER_ID}&recursive=true&includeItemTypes=Movie" |
    python3 -c "
import json,sys
items=json.load(sys.stdin).get('Items') or []
m=[i for i in items if '$1' in (i.get('Name') or '')]
print(m[0]['Id'] if m else '')"
}

seed_user_data() {
  # One in-progress (~40% of 10s), one played. Soft-fail on the deadfin
  # target: a missing endpoint is a parity finding, not a harness abort.
  local soft="$1"
  VOYAGE_ID=$(movie_id 'Voyage')
  ZONE_ID=$(movie_id 'Bioluminescent')
  [ -n "$VOYAGE_ID" ] && [ -n "$ZONE_ID" ] || { [ "$soft" = soft ] && { warn 'movies not found for user-data seeding'; return 0; } || fail 'movies not found'; }
  if ! curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
    -X POST "$BASE/UserItems/${VOYAGE_ID}/UserData?userId=${USER_ID}" \
    -d '{"PlaybackPositionTicks":40000000}' >/dev/null; then
    [ "$soft" = soft ] && warn 'POST /UserItems/{id}/UserData failed — parity finding' || fail 'resume seeding failed'
  fi
  if ! curl -fsS -H "$AUTHED" -X POST "$BASE/UserPlayedItems/${ZONE_ID}?userId=${USER_ID}" >/dev/null; then
    [ "$soft" = soft ] && warn 'POST /UserPlayedItems/{id} failed — parity finding' || fail 'played seeding failed'
  fi
  RESUME_COUNT=$(curl -fsS -H "$AUTHED" "$BASE/UserItems/Resume?userId=${USER_ID}" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount",0))' 2>/dev/null || echo 0)
  log "user data seeded (resume count: ${RESUME_COUNT:-0})"
  if [ "${RESUME_COUNT:-0}" -lt 1 ]; then
    [ "$soft" = soft ] && warn 'resume list is empty — parity finding' || fail 'resume seeding did not take'
  fi
}

# ---- 2. target bring-up -----------------------------------------------------
if [ "$TARGET" = jellyfin ]; then
  PORT="${HARNESS_PORT:-8097}"
  BASE="http://localhost:${PORT}"

  log "starting jellyfin 12.0.0 on :${PORT}"
  "${COMPOSE[@]}" up -d --quiet-pull server >/dev/null
  wait_ping "$BASE" || { curl -sv "$BASE/System/Info/Public" 2>&1 | tail -5 >&2 || true; "${COMPOSE[@]}" logs --tail 20 server >&2 || true; fail 'server did not come up in 120s'; }

  log 'running setup wizard over the API'
  # /System/Ping answers well before startup tasks finish (503 window can
  # stretch past a minute on a loaded machine) — be patient here.
  for i in $(seq 1 90); do
    curl -fsS -H "$AUTH_HDR" -H 'Content-Type: application/json' \
      -X POST "$BASE/Startup/Configuration" \
      -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}' >/dev/null 2>&1 && break
    [ "$i" = 90 ] && fail 'wizard configuration kept failing for 180s'
    sleep 2
  done
  curl -fsS -H "$AUTH_HDR" "$BASE/Startup/User" >/dev/null
  curl -fsS -H "$AUTH_HDR" -H 'Content-Type: application/json' \
    -X POST "$BASE/Startup/User" -d "{\"Name\":\"${USER_NAME}\",\"Password\":\"${USER_PASS}\"}" >/dev/null
  curl -fsS -H "$AUTH_HDR" -X POST "$BASE/Startup/Complete" >/dev/null
  api_login

  log 'adding Movies library (internet providers disabled — hermetic)'
  curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
    -X POST "$BASE/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=true" \
    -d '{"LibraryOptions":{"EnableInternetProviders":false,"SaveLocalMetadata":false,"PathInfos":[{"Path":"/media/movies"}]}}' >/dev/null

  # Loosen resume thresholds for 10s media.
  curl -fsS -H "$AUTHED" "$BASE/System/Configuration" |
    python3 -c 'import json,sys; c=json.load(sys.stdin); c["MinResumeDurationSeconds"]=1; c["MinResumePct"]=1; c["MaxResumePct"]=99; print(json.dumps(c))' |
    curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' -X POST "$BASE/System/Configuration" -d @- >/dev/null

  log 'waiting for the scan to surface 3 movies'
  for i in $(seq 1 60); do
    COUNT=$(curl -fsS -H "$AUTHED" \
      "$BASE/Items?userId=${USER_ID}&recursive=true&includeItemTypes=Movie" |
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount",0))' || echo 0)
    [ "${COUNT:-0}" -ge 3 ] && break
    [ "$i" = 60 ] && fail "scan stalled at ${COUNT:-0}/3 movies"
    sleep 2
  done
  log "scan complete (${COUNT} movies)"
  seed_user_data hard

else # ---- deadfin ------------------------------------------------------------
  PORT="${HARNESS_PORT:-8098}"
  WEB_PORT="${HARNESS_WEB_PORT:-8099}"
  BASE="http://localhost:${PORT}"

  # Deadfin master has no external library-creation path and no
  # POST /System/Configuration, so state is pre-seeded with the gate's own
  # tooling before the server boots.
  cat > .state/seed/creds.json <<CREDS
{"admin_name":"${USER_NAME}","admin_password":"${USER_PASS}","disabled_name":"ghost","disabled_password":"benthic-ghost-1"}
CREDS

  log 'seeding deadfin state (config + finalreplaybootstrap + goldenrec-seed-user)'
  # Resume thresholds for 10s media go in FIRST as a partial system.xml: the
  # bootstrap's config manager loads it (partial-honoring), then rewrites the
  # canonical file preserving these values alongside IsStartupWizardCompleted.
  "${COMPOSE[@]}" --profile seed run --rm -T --entrypoint /bin/sh tools -c \
    'mkdir -p /state/config && printf "%s" "<ServerConfiguration><MinResumePct>1</MinResumePct><MaxResumePct>99</MaxResumePct><MinResumeDurationSeconds>1</MinResumeDurationSeconds></ServerConfiguration>" > /state/config/system.xml' >/dev/null
  "${COMPOSE[@]}" --profile seed run --rm --entrypoint /usr/local/bin/finalreplaybootstrap tools -state /state >/dev/null
  "${COMPOSE[@]}" --profile seed run --rm --entrypoint /usr/local/bin/goldenrec-seed-user tools -program-data /state -credentials-file /seed/creds.json >/dev/null

  # The web service (nginx, bind-mounting ../../dist) starts only after the
  # Vite build below, so docker cannot create a root-owned ./dist before we
  # own it. Mirrors the jellyfin target's bring-up ordering.
  log "starting deadfin server on :${PORT}"
  "${COMPOSE[@]}" up -d --quiet-pull server >/dev/null
  wait_ping "$BASE" || { "${COMPOSE[@]}" logs --tail 25 server >&2 || true; fail 'deadfin did not come up in 120s'; }
  api_login

  COUNT=$(curl -fsS -H "$AUTHED" "$BASE/Items?userId=${USER_ID}&recursive=true&includeItemTypes=Movie" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount",0))' || echo 0)
  log "bootstrap scan surfaced ${COUNT:-0} movies"
  [ "${COUNT:-0}" -ge 3 ] || warn "expected 3 movies, got ${COUNT:-0} — parity finding"
  seed_user_data soft
fi

# ---- 3. browser acceptance --------------------------------------------------
# Playwright runs inside the pinned browser image as a service on the harness's
# own compose network — not on the host. `npx playwright install` fetches
# generic-glibc browser bundles that cannot exec on NixOS (no
# /lib64/ld-linux-x86-64.so.2), and the CI gate is a NixOS guest. Putting the
# browser on the compose network rather than reaching back at the host also
# makes the addressing identical everywhere: service names resolve the same on
# native Linux docker, colima, and Docker Desktop, none of which agree on what
# "the host" means from inside a container. The image tag must track
# @playwright/test in package.json — bump both together.
cd "$REPO_DIR"
log 'building app'
npm run build >/dev/null
mkdir -p "$REPO_DIR/e2e/evidence/$TARGET"

# The browser writes screenshots and traces into the bind-mounted repo, so it
# runs as the invoking user: root-owned evidence files would be unremovable by
# the next run under the CI runner's account.
HOST_UID=$(id -u) HOST_GID=$(id -g)
export HOST_UID HOST_GID

# dist only exists after the build above; an nginx started before it
# would have had docker create ./dist root-owned underneath us. Both
# targets defer the static app front to here so Playwright sees a
# user-owned bundle.
log 'starting the static app front'
"${COMPOSE[@]}" up -d --quiet-pull web >/dev/null

log 'running Playwright (pinned browser image, on the harness network)'
"${COMPOSE[@]}" --profile test run --rm -T playwright

log "PASS — evidence in e2e/evidence/$TARGET/"
