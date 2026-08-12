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
require_command ps
require_command pgrep
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

process_identity() {
  local pid="$1" description
  description="$(ps -p "$pid" -o lstart= -o command= 2>/dev/null || true)"
  [[ -n "${description//[[:space:]]/}" ]] || return 1
  sha256_text "$description"
}

read_process_state() {
  local file="$1" extra=""
  STATE_PID=""
  STATE_IDENTITY=""
  IFS=' ' read -r STATE_PID STATE_IDENTITY extra < "$file" || true
  [[ "$STATE_PID" =~ ^[0-9]+$ && "$STATE_IDENTITY" =~ ^[0-9a-f]{64}$ && -z "$extra" ]]
}

process_matches() {
  local pid="$1" expected="$2" actual
  kill -0 "$pid" 2>/dev/null || return 1
  actual="$(process_identity "$pid" 2>/dev/null || true)"
  [[ -n "$actual" && "$actual" == "$expected" ]]
}

validate_process_state() {
  local file="$1" label="$2" actual
  [[ -f "$file" ]] || return 0
  read_process_state "$file" || die 64 "$label process state is invalid; preserve it for diagnosis: $file"
  if kill -0 "$STATE_PID" 2>/dev/null; then
    actual="$(process_identity "$STATE_PID" 2>/dev/null || true)"
    [[ -n "$actual" ]] || die 64 "$label process identity cannot be resolved; refusing to signal PID $STATE_PID"
    [[ "$actual" == "$STATE_IDENTITY" ]] || die 64 "$label PID identity differs; refusing to signal reused PID $STATE_PID"
  fi
}

write_process_state() {
  local file="$1" pid="$2" identity="" previous="" sample_attempt
  for sample_attempt in 1 2 3 4 5 6 7 8 9 10; do
    identity="$(process_identity "$pid" 2>/dev/null || true)"
    if [[ -n "$identity" && "$identity" == "$previous" ]]; then
      printf '%s %s\n' "$pid" "$identity" > "$file"
      chmod 600 "$file" 2>/dev/null || true
      return 0
    fi
    previous="$identity"
    kill -0 "$pid" 2>/dev/null || return 1
    sleep 0.1
  done
  return 1
}

state_process_is_live() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  read_process_state "$file" || return 1
  process_matches "$STATE_PID" "$STATE_IDENTITY"
}

stop_process_tree() {
  local file="$1" label="$2" root_pid root_identity pid identity child
  local term_index kill_index check_index wait_attempt residue
  local -a queue=() tree_pids=() tree_identities=()
  [[ -f "$file" ]] || return 0
  validate_process_state "$file" "$label"
  read_process_state "$file" || die 64 "$label process state became unreadable: $file"
  root_pid="$STATE_PID"
  root_identity="$STATE_IDENTITY"
  if ! process_matches "$root_pid" "$root_identity"; then
    rm -f "$file"
    return 0
  fi

  queue+=("$root_pid")
  while ((${#queue[@]})); do
    pid="${queue[0]}"
    queue=("${queue[@]:1}")
    identity="$(process_identity "$pid" 2>/dev/null || true)"
    [[ -n "$identity" ]] || continue
    tree_pids+=("$pid")
    tree_identities+=("$identity")
    while IFS= read -r child; do
      [[ "$child" =~ ^[0-9]+$ ]] && queue+=("$child")
    done < <(pgrep -P "$pid" 2>/dev/null || true)
  done

  for ((term_index=0; term_index<${#tree_pids[@]}; term_index++)); do
    pid="${tree_pids[$term_index]}"
    identity="${tree_identities[$term_index]}"
    if process_matches "$pid" "$identity" && ! kill -TERM "$pid" 2>/dev/null; then
      process_matches "$pid" "$identity" && die 64 "$label process could not receive TERM: $pid"
    fi
  done
  for wait_attempt in 1 2 3 4 5; do
    process_matches "$root_pid" "$root_identity" || break
    sleep 1
  done
  for ((kill_index=0; kill_index<${#tree_pids[@]}; kill_index++)); do
    pid="${tree_pids[$kill_index]}"
    identity="${tree_identities[$kill_index]}"
    if process_matches "$pid" "$identity" && ! kill -KILL "$pid" 2>/dev/null; then
      process_matches "$pid" "$identity" && die 64 "$label process could not receive KILL: $pid"
    fi
  done
  for wait_attempt in 1 2 3 4 5; do
    residue=false
    for ((check_index=0; check_index<${#tree_pids[@]}; check_index++)); do
      if process_matches "${tree_pids[$check_index]}" "${tree_identities[$check_index]}"; then
        residue=true
        break
      fi
    done
    [[ "$residue" == true ]] || break
    sleep 1
  done
  for ((check_index=0; check_index<${#tree_pids[@]}; check_index++)); do
    process_matches "${tree_pids[$check_index]}" "${tree_identities[$check_index]}" && \
      die 64 "$label process residue remains; preserving state: ${tree_pids[$check_index]}"
  done
  rm -f "$file"
}

pid_is_live() {
  state_process_is_live "$pid_file"
}

stop_child() {
  stop_process_tree "$child_pid_file" child
}

run_child() {
  "$@" &
  local child_pid=$!
  if ! write_process_state "$child_pid_file" "$child_pid"; then
    set +e
    wait "$child_pid"
    local early_rc=$?
    set -e
    return "$early_rc"
  fi
  set +e
  wait "$child_pid"
  local rc=$?
  set -e
  rm -f "$child_pid_file"
  return "$rc"
}

case "$action" in
  start)
    validate_process_state "$pid_file" controller
    validate_process_state "$child_pid_file" child
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

    daemon_command=(bash "$SCRIPT_DIR/background-sync.sh" __run --interval "$interval")
    [[ "$publish" == false ]] || daemon_command+=(--publish)
    nohup "${daemon_command[@]}" >> "$log_file" 2>&1 </dev/null &
    pid=$!
    write_process_state "$pid_file" "$pid" || die 64 "background process exited before its identity could be recorded: $pid"
    chmod 600 "$log_file" 2>/dev/null || true
    printf 'STARTED branch=%s pid=%s interval=%s publish=%s\n' "$branch" "$pid" "$interval" "$publish"
    ;;
  __run)
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
    validate_process_state "$pid_file" controller
    if pid_is_live; then
      read_process_state "$pid_file" || die 64 "controller process state became unreadable"
      printf 'RUNNING branch=%s pid=%s\n' "$branch" "$STATE_PID"
      exit 0
    fi
    printf 'STOPPED branch=%s\n' "$branch"
    exit 2
    ;;
  stop)
    validate_process_state "$pid_file" controller
    validate_process_state "$child_pid_file" child
    if ! pid_is_live; then
      stop_child
      rm -f "$pid_file"
      printf 'STOPPED branch=%s already=true\n' "$branch"
      exit 0
    fi
    read_process_state "$pid_file" || die 64 "controller process state became unreadable"
    pid="$STATE_PID"
    stop_process_tree "$pid_file" controller
    stop_child
    printf 'STOPPED branch=%s pid=%s\n' "$branch" "$pid"
    ;;
  *) usage; die 64 "unknown action: $action" ;;
esac
