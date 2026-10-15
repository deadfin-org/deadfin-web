#!/usr/bin/env bash
# deadfin-web acceptance: hermetic, local, observable. Two targets, seeded
# the same way, through the public API (setup wizard, library, config):
#
#   ACCEPT_TARGET=jellyfin (default) — stock jellyfin 12.0.0 by digest, the
#     contract source of truth. Cross-origin (static app front → API).
#   ACCEPT_TARGET=deadfin — the Deadfin image in DEADFIN_IMAGE. The suite runs
#     twice: same-origin, with the app served by Deadfin itself from its /web
#     directory (the alpha topology), then cross-origin from a static front.
#     Pass-on-stock/fail-on-deadfin = server finding. Seeding gaps are
#     warnings unless ACCEPT_STRICT=1 (release runs), then failures.
#
# Requirements: docker (with compose), node. No network beyond localhost +
# pulling pinned images.
set -euo pipefail

cd "$(dirname "$0")"
HARNESS_DIR=$(pwd)
REPO_DIR=$(cd ../.. && pwd)
TARGET="${ACCEPT_TARGET:-jellyfin}"
STRICT="${ACCEPT_STRICT:-0}"
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
  "${COMPOSE[@]}" --profile test down -v --timeout 5 >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v docker >/dev/null || fail 'docker is required'
docker compose version >/dev/null 2>&1 || fail 'docker compose plugin is required'

# ---- 1. synthetic library ---------------------------------------------------
# VP9/Opus webm, not h264 mp4: Playwright's Chromium ships without proprietary
# codecs. 10s duration so playback tests can pause before 'ended'.
rm -rf .state
mkdir -p .state/media/movies .state/media/archive .state/media/tv .state/media/music .state/media/photos

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

# A 40-title library for paging past the home shelf and the first page of
# the library grid: one 1 s stub generated once, copied on the host.
ARCHIVE_COUNT=40
gen_file "archive-stub.webm" \
  -f lavfi -i "testsrc2=duration=1:size=320x180:rate=12" \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 100k -pix_fmt yuv420p
for n in $(seq -w 1 "$ARCHIVE_COUNT"); do
  mkdir -p ".state/media/archive/Archive Reel ${n} (19${n})"
  cp .state/media/archive-stub.webm ".state/media/archive/Archive Reel ${n} (19${n})/Archive Reel ${n} (19${n}).webm"
done
rm .state/media/archive-stub.webm

# A series: two regular episodes and a special. One 10 s episode generated
# once, copied on the host. The folder names are the standard layout both
# servers parse (Series (Year)/Season NN/… SxxEyy - Title).
SHOW='Trench Tales (2020)'
mkdir -p ".state/media/tv/${SHOW}/Season 01" ".state/media/tv/${SHOW}/Season 00"
gen_file "tv/episode.webm" \
  -f lavfi -i "testsrc2=duration=10:size=640x360:rate=24" \
  -f lavfi -i "sine=frequency=330:duration=10" \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 300k -pix_fmt yuv420p \
  -c:a libopus -b:a 48k -shortest
gen_file "tv/${SHOW}/poster.jpg" -f lavfi -i 'cellauto=size=400x600' -frames:v 1
cp .state/media/tv/episode.webm ".state/media/tv/${SHOW}/Season 01/Trench Tales S01E01 - First Dive.webm"
cp .state/media/tv/episode.webm ".state/media/tv/${SHOW}/Season 01/Trench Tales S01E02 - The Thermocline.webm"
cp .state/media/tv/episode.webm ".state/media/tv/${SHOW}/Season 00/Trench Tales S00E01 - Behind the Hull.webm"
rm .state/media/tv/episode.webm

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

# ---- 2. build the app -------------------------------------------------------
# Before bring-up: the deadfin target serves dist/ from its own /web directory
# and registers /web only if the directory exists at startup. Building first
# also keeps docker from creating a root-owned ./dist for a bind mount.
cd "$REPO_DIR"
log 'building app'
npm run build >/dev/null
cd "$HARNESS_DIR"

# ---- 3. target bring-up and API seeding -------------------------------------
case "$TARGET" in
  jellyfin) PORT="${HARNESS_PORT:-8097}"; SEED=hard ;;
  deadfin) PORT="${HARNESS_PORT:-8098}"; SEED=$([ "$STRICT" = 1 ] && echo hard || echo soft) ;;
esac
BASE="http://localhost:${PORT}"

log "starting the ${TARGET} server on :${PORT}"
"${COMPOSE[@]}" up -d --quiet-pull server >/dev/null
wait_ping "$BASE" || { curl -sv "$BASE/System/Info/Public" 2>&1 | tail -5 >&2 || true; "${COMPOSE[@]}" logs --tail 25 server >&2 || true; fail 'server did not come up in 120s'; }

# Deadfin's first-run gate (D-53) admits direct local-network clients only.
# The harness is one, but if a docker setup presents it otherwise, use the
# setup link from the server log, as an operator behind a proxy would.
SETUP_HDR=()
setup_link_cookie() {
  local token
  token=$("${COMPOSE[@]}" logs server 2>/dev/null | grep -o 'setup?token=[0-9a-f]*' | tail -1 | cut -d= -f2)
  [ -n "$token" ] || fail 'setup gate refused the wizard and no setup link is in the server log'
  log 'setup gate refused a direct request; using the setup link from the server log'
  SETUP_HDR=(-H "Cookie: deadfin-setup=${token}")
}
wizard() { curl -fsS -H "$AUTH_HDR" ${SETUP_HDR[@]+"${SETUP_HDR[@]}"} "$@"; }

log 'running setup wizard over the API'
# /System/Ping answers well before startup tasks finish (503 window can
# stretch past a minute on a loaded machine) — be patient here.
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH_HDR" ${SETUP_HDR[@]+"${SETUP_HDR[@]}"} \
    -H 'Content-Type: application/json' -X POST "$BASE/Startup/Configuration" \
    -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}' || true)
  case "$code" in
    2??) break ;;
    403) if [ "$TARGET" = deadfin ] && [ ${#SETUP_HDR[@]} -eq 0 ]; then setup_link_cookie; fi ;;
  esac
  [ "$i" = 90 ] && fail "wizard configuration kept failing for 180s (last HTTP ${code})"
  sleep 2
done
wizard "$BASE/Startup/User" >/dev/null
wizard -H 'Content-Type: application/json' -X POST "$BASE/Startup/User" \
  -d "{\"Name\":\"${USER_NAME}\",\"Password\":\"${USER_PASS}\"}" >/dev/null
wizard -X POST "$BASE/Startup/Complete" >/dev/null
api_login

log 'adding Movies library (internet providers disabled — hermetic)'
curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
  -X POST "$BASE/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=true" \
  -d '{"LibraryOptions":{"EnableInternetProviders":false,"SaveLocalMetadata":false,"PathInfos":[{"Path":"/media/movies"}]}}' >/dev/null
curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
  -X POST "$BASE/Library/VirtualFolders?name=Archive&collectionType=movies&refreshLibrary=true" \
  -d '{"LibraryOptions":{"EnableInternetProviders":false,"SaveLocalMetadata":false,"PathInfos":[{"Path":"/media/archive"}]}}' >/dev/null
curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
  -X POST "$BASE/Library/VirtualFolders?name=Shows&collectionType=tvshows&refreshLibrary=true" \
  -d '{"LibraryOptions":{"EnableInternetProviders":false,"SaveLocalMetadata":false,"PathInfos":[{"Path":"/media/tv"}]}}' >/dev/null

# Loosen resume thresholds for 10s media.
if ! curl -fsS -H "$AUTHED" "$BASE/System/Configuration" |
  python3 -c 'import json,sys; c=json.load(sys.stdin); c["MinResumeDurationSeconds"]=1; c["MinResumePct"]=1; c["MaxResumePct"]=99; print(json.dumps(c))' |
  curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' -X POST "$BASE/System/Configuration" -d @- >/dev/null; then
  [ "$SEED" = soft ] && warn 'resume thresholds not settable through /System/Configuration — parity finding' || fail 'configuring resume thresholds failed'
fi

WANT=$((3 + ARCHIVE_COUNT))
log "waiting for the scan to surface ${WANT} movies"
for i in $(seq 1 60); do
  COUNT=$(curl -fsS -H "$AUTHED" \
    "$BASE/Items?userId=${USER_ID}&recursive=true&includeItemTypes=Movie" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount",0))' || echo 0)
  [ "${COUNT:-0}" -ge "$WANT" ] && break
  [ "$i" = 60 ] && fail "scan stalled at ${COUNT:-0}/${WANT} movies"
  sleep 2
done
log "scan complete (${COUNT} movies)"
log 'waiting for the scan to surface 3 episodes'
for i in $(seq 1 60); do
  EPS=$(curl -fsS -H "$AUTHED" \
    "$BASE/Items?userId=${USER_ID}&recursive=true&includeItemTypes=Episode" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount",0))' || echo 0)
  [ "${EPS:-0}" -ge 3 ] && break
  if [ "$i" = 60 ]; then
    [ "$SEED" = soft ] && { warn "episode scan stalled at ${EPS:-0}/3 — parity finding"; break; } || fail "episode scan stalled at ${EPS:-0}/3"
  fi
  sleep 2
done
seed_user_data "$SEED"

# ---- 4. browser acceptance --------------------------------------------------
# Playwright runs inside the pinned browser image as a service on the harness's
# own compose network — not on the host. `npx playwright install` fetches
# generic-glibc browser bundles that cannot exec on NixOS (no
# /lib64/ld-linux-x86-64.so.2), and the CI gate is a NixOS guest. Putting the
# browser on the compose network rather than reaching back at the host also
# makes the addressing identical everywhere: service names resolve the same on
# native Linux docker, colima, and Docker Desktop, none of which agree on what
# "the host" means from inside a container. The image tag must track
# @playwright/test in package.json — bump both together.
mkdir -p "$REPO_DIR/e2e/evidence/$TARGET"

# The browser writes screenshots and traces into the bind-mounted repo, so it
# runs as the invoking user: root-owned evidence files would be unremovable by
# the next run under the CI runner's account.
HOST_UID=$(id -u) HOST_GID=$(id -g)
export HOST_UID HOST_GID

log 'starting the static app front'
"${COMPOSE[@]}" up -d --quiet-pull web >/dev/null

if [ "$TARGET" = jellyfin ]; then
  log 'running Playwright (pinned browser image, cross-origin)'
  "${COMPOSE[@]}" --profile test run --rm -T playwright
else
  log 'running Playwright: app served by Deadfin at /web/ (same origin)'
  "${COMPOSE[@]}" --profile test run --rm -T playwright
  # The first pass leaves Pressure Hull part-watched; put the seeded user
  # data back for the second pass.
  PH_ID=$(movie_id 'Pressure Hull')
  { [ -n "$PH_ID" ] && curl -fsS -H "$AUTHED" -H 'Content-Type: application/json' \
    -X POST "$BASE/UserItems/${PH_ID}/UserData?userId=${USER_ID}" \
    -d '{"PlaybackPositionTicks":0,"Played":false}' >/dev/null; } || warn 'could not reset Pressure Hull between passes'
  seed_user_data "$SEED"
  mkdir -p "$REPO_DIR/e2e/evidence/deadfin-cross"
  log 'running Playwright: static app front, API on another origin'
  "${COMPOSE[@]}" --profile test run --rm -T playwright-cross
fi

log "PASS — evidence in e2e/evidence/$TARGET/"
