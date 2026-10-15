#!/usr/bin/env bash
# Regression driver for accept.sh's Jellyfin startup-failure diagnostics.
#
# Exercises the line-143 failure path under set -euo pipefail with PATH stubs
# for curl, sleep, and docker — no network, no Docker daemon. Asserts that a
# failed diagnostic curl cannot abort the diagnosis: the harness prints the
# server logs, the exact FAIL message, runs the EXIT cleanup, and exits 1.
#
# Acceptance (#16): exits 0 after observing status 1, the fake logs sentinel,
# the exact FAIL message after it, and the teardown sentinel, then prints one
# final success line.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
accept_src="$here/accept.sh"

[ -f "$accept_src" ] || { echo "FATAL: accept.sh not found next to $0" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Copy the harness into a scratch dir so .state writes never touch the tree.
# The stub docker ignores -f files, but accept.sh references them in COMPOSE.
mkdir -p "$work/harness"
cp "$accept_src" "$work/harness/accept.sh"
cp "$here/compose.yaml" "$work/harness/compose.yaml" 2>/dev/null || printf '# stub-ignored\n' >"$work/harness/compose.yaml"

# ---- stubs ----------------------------------------------------------------
mkdir -p "$work/bin"

# curl: always fails (exit 7 = "couldn't connect"), the failure the bug hid.
# -fsS .../System/Ping   -> silent, non-zero (wait_ping never returns 0).
# -sv  .../System/Info/Public -> verbose refusal line on stderr, non-zero.
cat >"$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
# Reproduce the real failure: connection refused, exit 7.
for a in "$@"; do
  case "$a" in
    */System/Info/Public)
      echo "*   Trying 127.0.0.1..." >&2
      echo "* connect to 127.0.0.1 port 8097 failed: Connection refused" >&2
      echo "* Failed to connect to 127.0.0.1 port 8097 after 0 ms: couldn't connect to host" >&2
      ;;
  esac
done
exit 7
STUB
chmod +x "$work/bin/curl"

# sleep: instant, so the 60-iteration wait_ping loop is free.
cat >"$work/bin/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$work/bin/sleep"

# docker: hermetic dispatch over `compose` and `run`.
cat >"$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

# `docker run` synthesizes media: translate the bind mount so the host file
# exists and is non-empty, which is all gen_file's `[ -s ]` check needs.
# Args: run --rm --network none -v HOST:CONTAINER --entrypoint EP IMG ... OUT
if [ "${1:-}" = run ]; then
  host_dir=""
  container_dir=""
  out=""
  prev=""
  for a in "$@"; do
    if [ "$prev" = -v ]; then
      host_dir=${a%%:*}
      container_dir=${a#*:}
    fi
    prev=$a
  done
  # Last positional argument is the ffmpeg output path (/CONTAINER/rest).
  out=${@: -1}
  case $out in
    "$container_dir"/*)
      rel=${out#"$container_dir"/}
      mkdir -p "$host_dir/$(dirname "$rel")"
      printf 'stub-media\n' >"$host_dir/$rel"
      ;;
  esac
  exit 0
fi

# `docker compose ...` — dispatch on the subcommand keyword. The compose
# array is `docker compose -f <file> <cmd>`, so skip -f and its value to
# find version/up/logs/down rather than reading $2 (which is `-f`).
if [ "${1:-}" = compose ]; then
  sub=
  skip_next=0
  for a in "${@:2}"; do
    if [ "$skip_next" = 1 ]; then skip_next=0; continue; fi
    case $a in
      -f|--file) skip_next=1; continue ;;
      --*) continue ;;
      -* ) continue ;;
      *)  sub=$a; break ;;
    esac
  done
  case $sub in
    version)
      echo "Docker Compose version v2.0.0-stub"
      exit 0
      ;;
    up)
      exit 0
      ;;
    logs)
      # The diagnostic the bug was hiding: recent server logs to stderr.
      echo "[fake-server-log] System.InvalidOperationException: The path \`/config/data\` has insufficient free space." >&2
      echo "[fake-server-log] Available: 170.8MiB, Required: 2GiB." >&2
      exit 0
      ;;
    down)
      exit 0
      ;;
  esac
fi

exit 0
STUB
chmod +x "$work/bin/docker"

# ---- run ------------------------------------------------------------------
# A real environment is unnecessary and harmful here: keep the stubs first.
out=$(PATH="$work/bin:$PATH" bash "$work/harness/accept.sh" 2>&1) || rc=$?
rc=${rc:-0}

# Strip ANSI color so the assertions see exact text.
plain=$(printf '%s' "$out" | sed 's/\x1b\[[0-9;]*m//g')

# ---- assert ----------------------------------------------------------------
fail_test() { echo "FAIL: $1" >&2; echo "--- captured output ---" >&2; printf '%s\n' "$out" >&2; exit 1; }

[ "$rc" -eq 1 ] || fail_test "expected exit status 1, got $rc"

log_sentinel='[fake-server-log] System.InvalidOperationException: The path `/config/data` has insufficient free space.'
fail_msg='[accept:jellyfin] FAIL: server did not come up in 120s'
teardown_sentinel='[accept:jellyfin] tearing down'

# Sentinel present.
printf '%s\n' "$plain" | grep -Fq "$log_sentinel" || fail_test "fake logs sentinel not found"

# FAIL message present.
printf '%s\n' "$plain" | grep -Fq "$fail_msg" || fail_test "exact FAIL message not found"

# FAIL message appears AFTER the log sentinel (the bug dropped both).
log_line=$(printf '%s\n' "$plain" | grep -nF "$log_sentinel" | head -1 | cut -d: -f1)
fail_line=$(printf '%s\n' "$plain" | grep -nF "$fail_msg" | head -1 | cut -d: -f1)
[ -n "$log_line" ] && [ -n "$fail_line" ] && [ "$fail_line" -gt "$log_line" ] \
  || fail_test "FAIL message must come after the log sentinel (log=$log_line fail=$fail_line)"

# Teardown ran (EXIT cleanup trap preserved).
printf '%s\n' "$plain" | grep -Fq "$teardown_sentinel" || fail_test "teardown sentinel not found — EXIT cleanup did not run"
teardown_line=$(printf '%s\n' "$plain" | grep -nF "$teardown_sentinel" | head -1 | cut -d: -f1)
[ "$teardown_line" -gt "$fail_line" ] \
  || fail_test "teardown sentinel must come after the FAIL message (fail=$fail_line teardown=$teardown_line)"

echo "accept-startup-failure: PASS"
