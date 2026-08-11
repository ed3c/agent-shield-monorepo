#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
usage:
  background-sync.sh start [--interval SECONDS] [--publish]
  background-sync.sh status
  background-sync.sh stop

Runs repeated one-shot sync-stack.sh calls from the current isolated linked
worktree. Publishing requires ALLOW_GIT_TOWN_PUSH=1. Any conflict, timeout,
dirty state, missing parent, or failed push stops the loop and leaves a receipt.
EOF
}

[[ $# -ge 1 ]] || { usage; exit 64; }
action="$1"
shift
interval=300
publish=false
while (($#)); do
  case "$1" in
    --interval) interval="${2:-}"; shift ;;
    --publish) publish=true ;;
    -h|--help) usage; exit 0 ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done
[[ "$interval" =~ ^[0-9]+$ ]] && ((interval >= 30)) || die 64 "interval must be an integer >= 30"

require_command git
root="$(repo_root)"
cd "$root"
require_task_packet
branch="$(current_branch)"
[[ "$branch" == "$TASK_BRANCH" ]] || die 64 "current branch differs from TASK_BRANCH"

worktree_git_dir="$(git rev-parse --path-format=absolute --git-dir)"
common_git_dir="$(git_common_dir)"
[[ "$worktree_git_dir" != "$common_git_dir" ]] || die 64 "background sync requires an isolated linked worktree"

safe_branch="$(sanitize_branch "$branch")"
state_dir="$common_git_dir/agent-shield/background"
mkdir -p "$state_dir"
chmod 700 "$state_dir" 2>/dev/null || true
pid_file="$state_dir/$safe_branch.pid"
log_file="$state_dir/$safe_branch.log"

pid_is_live() {
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

case "$action" in
  start)
    pid_is_live && die 64 "background sync already running for $branch"
    rm -f "$pid_file"
    if [[ "$publish" == true && "${ALLOW_GIT_TOWN_PUSH:-0}" != "1" ]]; then
      die 64 "--publish requires ALLOW_GIT_TOWN_PUSH=1"
    fi
    require_team_config
    require_git_town_license
    require_git_town_version >/dev/null
    require_clean_worktree
    require_no_git_operation
    require_not_blocked
    require_task_identity

    args=()
    [[ "$publish" == false ]] || args+=(--publish)
    nohup "$0" __run --interval "$interval" ${publish:+--publish} >> "$log_file" 2>&1 </dev/null &
    pid=$!
    printf '%s\n' "$pid" > "$pid_file"
    chmod 600 "$pid_file" "$log_file" 2>/dev/null || true
    printf 'STARTED branch=%s pid=%s interval=%s publish=%s\n' "$branch" "$pid" "$interval" "$publish"
    ;;
  __run)
    trap 'exit 0' TERM INT
    while true; do
      sync_args=()
      [[ "$publish" == false ]] || sync_args+=(--publish)
      "$SCRIPT_DIR/sync-stack.sh" "${sync_args[@]}" || exit $?
      sleep "$interval" &
      wait $!
    done
    ;;
  status)
    if pid_is_live; then
      printf 'RUNNING branch=%s pid=%s\n' "$branch" "$(cat "$pid_file")"
      exit 0
    fi
    printf 'STOPPED branch=%s\n' "$branch"
    exit 2
    ;;
  stop)
    if ! pid_is_live; then
      rm -f "$pid_file"
      printf 'STOPPED branch=%s already=true\n' "$branch"
      exit 0
    fi
    pid="$(cat "$pid_file")"
    kill -TERM "$pid"
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      die 64 "background process did not stop cleanly: $pid"
    fi
    rm -f "$pid_file"
    printf 'STOPPED branch=%s pid=%s\n' "$branch" "$pid"
    ;;
  *) usage; die 64 "unknown action: $action" ;;
esac
