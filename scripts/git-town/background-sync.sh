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
worktree. Task metadata is loaded from the host-owned packet under the common
Git directory. Publishing requires ALLOW_GIT_TOWN_PUSH=1. Any conflict, timeout,
dirty state, missing parent, or failed push stops the loop and leaves a receipt.
EOF
}

[[ $# -ge 1 ]] || { usage; exit 64; }
action="$1"
shift
interval=300
publish=false
run_token=""
while (($#)); do
  case "$1" in
    --interval) interval="${2:-}"; shift ;;
    --publish) publish=true ;;
    --run-token) run_token="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done
[[ "$interval" =~ ^[0-9]+$ ]] && ((interval >= 30)) || die 64 "interval must be an integer >= 30"
[[ "$action" == __run || -z "$run_token" ]] || die 64 "--run-token is reserved for the internal controller"

require_command git
require_command ps
require_command od
root="$(repo_root)"
cd "$root"
require_linked_worktree
require_safe_remote_url
load_task_packet
branch="$(current_branch)"
[[ "$branch" == "$TASK_BRANCH" ]] || die 64 "current branch differs from TASK_BRANCH"

common_git_dir="$(git_common_dir)"
safe_branch="$(sanitize_branch "$branch")"
state_dir="$common_git_dir/agent-shield/background"
mkdir -p "$state_dir"
chmod 700 "$state_dir" 2>/dev/null || true
pid_file="$state_dir/$safe_branch.pid"
child_pid_file="$state_dir/$safe_branch.child.pid"
log_file="$state_dir/$safe_branch.log"

new_run_token() {
  LC_ALL=C od -An -N16 -tx1 /dev/urandom | tr -d ' \n'
}

process_command_contains_token() {
  local pid="$1" token="$2" command
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$command" && "$command" == *"$token"* ]]
}

process_group_for_pid() {
  ps -p "$1" -o pgid= 2>/dev/null | tr -d ' '
}

process_group_is_live() {
  local pgid="$1"
  kill -0 -- "-$pgid" 2>/dev/null
}

read_controller_state() {
  local extra=""
  CONTROLLER_PID=""
  CONTROLLER_TOKEN=""
  IFS=' ' read -r CONTROLLER_PID CONTROLLER_TOKEN extra < "$pid_file" || true
  [[ "$CONTROLLER_PID" =~ ^[0-9]+$ && "$CONTROLLER_TOKEN" =~ ^[0-9a-f]{32}$ && -z "$extra" ]]
}

read_child_state() {
  local extra=""
  CHILD_PID=""
  CHILD_PGID=""
  CHILD_TOKEN=""
  IFS=' ' read -r CHILD_PID CHILD_PGID CHILD_TOKEN extra < "$child_pid_file" || true
  [[ "$CHILD_PID" =~ ^[0-9]+$ && "$CHILD_PGID" =~ ^[0-9]+$ && "$CHILD_TOKEN" =~ ^[0-9a-f]{32}$ && -z "$extra" ]]
}

validate_controller_state() {
  [[ -f "$pid_file" ]] || return 0
  read_controller_state || die 64 "controller process state is invalid; preserve it for diagnosis: $pid_file"
  if kill -0 "$CONTROLLER_PID" 2>/dev/null; then
    process_command_contains_token "$CONTROLLER_PID" "$CONTROLLER_TOKEN" || \
      die 64 "controller PID ownership differs; refusing to signal reused PID $CONTROLLER_PID"
  fi
}

validate_child_state() {
  local actual_pgid
  [[ -f "$child_pid_file" ]] || return 0
  read_child_state || die 64 "child process state is invalid; preserve it for diagnosis: $child_pid_file"
  if kill -0 "$CHILD_PID" 2>/dev/null; then
    process_command_contains_token "$CHILD_PID" "$CHILD_TOKEN" || \
      die 64 "child PID ownership differs; refusing to signal reused PID $CHILD_PID"
    actual_pgid="$(process_group_for_pid "$CHILD_PID")"
    [[ "$actual_pgid" == "$CHILD_PGID" ]] || \
      die 64 "child process-group ownership differs; refusing to signal PGID $CHILD_PGID"
  elif process_group_is_live "$CHILD_PGID"; then
    die 64 "child group leader is absent while PGID $CHILD_PGID remains live; preserving state for recovery"
  fi
}

wait_for_process_group_exit() {
  local pgid="$1" wait_attempt
  for wait_attempt in 1 2 3 4 5; do
    process_group_is_live "$pgid" || return 0
    sleep 1
  done
  return 1
}

stop_child() {
  [[ -f "$child_pid_file" ]] || return 0
  validate_child_state
  read_child_state || die 64 "child process state became unreadable: $child_pid_file"
  if ! process_group_is_live "$CHILD_PGID"; then
    rm -f "$child_pid_file"
    return 0
  fi
  if ! kill -TERM -- "-$CHILD_PGID" 2>/dev/null; then
    process_group_is_live "$CHILD_PGID" && \
      die 64 "child process group could not receive TERM: $CHILD_PGID"
  fi
  if ! wait_for_process_group_exit "$CHILD_PGID"; then
    # TERM may have removed the original leader while leaving descendants, or
    # the numeric PID/PGID may now name unrelated processes. Re-establish the
    # token and group binding immediately before any stronger signal.
    validate_child_state
    read_child_state || die 64 "child process state became unreadable before KILL: $child_pid_file"
    if ! process_group_is_live "$CHILD_PGID"; then
      rm -f "$child_pid_file"
      return 0
    fi
    if ! kill -KILL -- "-$CHILD_PGID" 2>/dev/null; then
      process_group_is_live "$CHILD_PGID" && \
        die 64 "child process group could not receive KILL: $CHILD_PGID"
    fi
    wait_for_process_group_exit "$CHILD_PGID" || \
      die 64 "child process-group residue remains; preserving state: $CHILD_PGID"
  fi
  rm -f "$child_pid_file"
}

run_child() {
  local token child_pid child_pgid actual_pgid ownership_attempt completed_rc rc
  token="$(new_run_token)"
  set -m
  bash -c 'set +m; token="$1"; shift; set +e; "$@"; rc=$?; exit "$rc"' \
    "agent-shield-child-$token" "$token" "$@" &
  child_pid=$!
  set +m
  child_pgid="$child_pid"
  printf '%s %s %s\n' "$child_pid" "$child_pgid" "$token" > "$child_pid_file"
  chmod 600 "$child_pid_file" 2>/dev/null || true

  for ownership_attempt in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$child_pid" 2>/dev/null; then
      set +e
      wait "$child_pid"
      completed_rc=$?
      set -e
      process_group_is_live "$child_pgid" && \
        die 64 "child leader exited before ownership was established while PGID remains live; preserving state: $child_pgid"
      rm -f "$child_pid_file"
      return "$completed_rc"
    fi
    actual_pgid="$(process_group_for_pid "$child_pid")"
    if [[ "$actual_pgid" == "$child_pgid" ]] && process_command_contains_token "$child_pid" "$token"; then
      break
    fi
    sleep 0.1
  done
  actual_pgid="$(process_group_for_pid "$child_pid")"
  if [[ "$actual_pgid" != "$child_pgid" ]] || ! process_command_contains_token "$child_pid" "$token"; then
    if ! kill -0 "$child_pid" 2>/dev/null; then
      set +e
      wait "$child_pid"
      completed_rc=$?
      set -e
      process_group_is_live "$child_pgid" && \
        die 64 "child leader exited during ownership verification while PGID remains live; preserving state: $child_pgid"
      rm -f "$child_pid_file"
      return "$completed_rc"
    fi
    die 64 "child process-group ownership could not be established; preserving provisional state: pid=$child_pid pgid=$child_pgid"
  fi

  set +e
  wait "$child_pid"
  rc=$?
  set -e
  process_group_is_live "$child_pgid" && \
    die 64 "child leader exited while process-group residue remains; preserving state: $child_pgid"
  rm -f "$child_pid_file"
  return "$rc"
}

pid_is_live() {
  [[ -f "$pid_file" ]] || return 1
  read_controller_state || return 1
  kill -0 "$CONTROLLER_PID" 2>/dev/null && \
    process_command_contains_token "$CONTROLLER_PID" "$CONTROLLER_TOKEN"
}

write_controller_state() {
  local pid="$1" token="$2" observe_attempt
  printf '%s %s\n' "$pid" "$token" > "$pid_file"
  chmod 600 "$pid_file" 2>/dev/null || true
  for observe_attempt in 1 2 3 4 5 6 7 8 9 10; do
    if process_command_contains_token "$pid" "$token"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      return 1
    fi
    sleep 0.1
  done
  return 1
}

stop_controller() {
  local pid token wait_attempt
  validate_controller_state
  read_controller_state || die 64 "controller process state became unreadable: $pid_file"
  pid="$CONTROLLER_PID"
  token="$CONTROLLER_TOKEN"
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    return 0
  fi
  process_command_contains_token "$pid" "$token" || \
    die 64 "controller PID ownership differs; refusing to signal reused PID $pid"
  if ! kill -TERM "$pid" 2>/dev/null; then
    process_command_contains_token "$pid" "$token" && \
      die 64 "controller process could not receive TERM: $pid"
  fi
  for wait_attempt in 1 2 3 4 5; do
    process_command_contains_token "$pid" "$token" || break
    sleep 1
  done
  if process_command_contains_token "$pid" "$token"; then
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
    process_command_contains_token "$pid" "$token" && \
      die 64 "controller process residue remains; preserving state: $pid"
  fi
  rm -f "$pid_file"
}

case "$action" in
  start)
    validate_controller_state
    validate_child_state
    pid_is_live && die 64 "background sync already running for $branch"
    stop_child
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
    sync_lease="$common_git_dir/agent-shield/leases/repository-sync.lock"
    [[ ! -e "$sync_lease" ]] || die 64 "lease already exists: $sync_lease"

    controller_token="$(new_run_token)"
    daemon_command=(bash "$SCRIPT_DIR/background-sync.sh" __run --interval "$interval" --run-token "$controller_token")
    [[ "$publish" == false ]] || daemon_command+=(--publish)
    nohup "${daemon_command[@]}" >> "$log_file" 2>&1 </dev/null &
    pid=$!
    write_controller_state "$pid" "$controller_token" || die 64 "background process ownership could not be recorded: $pid"
    chmod 600 "$log_file" 2>/dev/null || true
    printf 'STARTED branch=%s pid=%s interval=%s publish=%s\n' "$branch" "$pid" "$interval" "$publish"
    ;;
  __run)
    [[ "$run_token" =~ ^[0-9a-f]{32}$ ]] || die 64 "__run requires a valid host-generated run token"
    trap 'stop_child; exit 0' TERM INT
    trap 'stop_child; rm -f "$pid_file"' EXIT
    while true; do
      sync_args=()
      [[ "$publish" == false ]] || sync_args+=(--publish)
      run_child bash "$SCRIPT_DIR/sync-stack.sh" "${sync_args[@]}" || exit $?
      run_child sleep "$interval" || exit $?
    done
    ;;
  status)
    validate_controller_state
    if pid_is_live; then
      read_controller_state || die 64 "controller process state became unreadable"
      printf 'RUNNING branch=%s pid=%s\n' "$branch" "$CONTROLLER_PID"
      exit 0
    fi
    printf 'STOPPED branch=%s\n' "$branch"
    exit 2
    ;;
  stop)
    validate_controller_state
    validate_child_state
    if ! pid_is_live; then
      stop_child
      rm -f "$pid_file"
      printf 'STOPPED branch=%s already=true\n' "$branch"
      exit 0
    fi
    read_controller_state || die 64 "controller process state became unreadable"
    pid="$CONTROLLER_PID"
    stop_controller
    stop_child
    printf 'STOPPED branch=%s pid=%s\n' "$branch" "$pid"
    ;;
  *) usage; die 64 "unknown action: $action" ;;
esac
