#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

dry_run=false
publish=false
while (($#)); do
  case "$1" in
    --dry-run) dry_run=true ;;
    --publish) publish=true ;;
    -h|--help)
      cat <<'EOF'
usage: sync-stack.sh [--dry-run] [--publish]

Default execution rebases the stack locally with --no-push. Publishing requires
both --publish and ALLOW_GIT_TOWN_PUSH=1. Task metadata is loaded from the
host-owned packet under the Git common directory when not already exported.

Conflicts stop the worker, preserve the suspended Git Town state, mark the
worktree BLOCKED, and emit a failure receipt. The script never runs continue,
skip, undo, ship, or semantic conflict edits.
EOF
      exit 0
      ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done

if [[ "$publish" == true && "${ALLOW_GIT_TOWN_PUSH:-0}" != "1" ]]; then
  die 64 "--publish requires ALLOW_GIT_TOWN_PUSH=1 from the trusted Worker host"
fi
if [[ "$dry_run" == true && "$publish" == true ]]; then
  die 64 "--dry-run and --publish are mutually exclusive"
fi

require_command git
require_command git-town
root="$(repo_root)"
cd "$root"
require_linked_worktree
require_safe_remote_url
require_team_config
require_git_town_license
version="$(require_git_town_version)"
require_clean_worktree
require_no_git_operation
require_not_blocked
require_task_identity
acquire_sync_lease

branch="$(current_branch)"
parent="$(parent_for_branch "$branch")"
before="$(current_commit)"
started="$(utc_now)"
log_dir="$(log_directory)"
receipt_dir="$(receipt_directory)"
safe_branch="$(sanitize_branch "$branch")"
run_id="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
raw_log="$log_dir/.sync-$safe_branch-$run_id.raw"
log_file="$log_dir/sync-$safe_branch-$run_id.log"
receipt_file="$receipt_dir/sync-$safe_branch-$run_id.json"
max_log_bytes="${GIT_TOWN_MAX_LOG_BYTES:-1048576}"
timeout_seconds="${GIT_TOWN_SYNC_TIMEOUT_SECONDS:-900}"
[[ "$max_log_bytes" =~ ^[0-9]+$ && "$timeout_seconds" =~ ^[0-9]+$ ]] || die 64 "log and timeout limits must be numeric"

command=(git town sync --stack --non-interactive --no-auto-resolve --verbose)
if [[ "$dry_run" == true ]]; then
  command+=(--dry-run --no-push)
elif [[ "$publish" == true ]]; then
  command+=(--push)
else
  command+=(--no-push)
fi

log "worker=$WORKER_ID issue=$ISSUE_NUMBER branch=$branch parent=$parent publish=$publish dry_run=$dry_run"
log "starting bounded Git Town sync; output is retained under the Git common directory"

set +e
(
  export GIT_TOWN_INTERACTIVE=false
  export GIT_TOWN_AUTO_RESOLVE=false
  export GIT_TOWN_SYNC_FEATURE_STRATEGY=rebase
  export GIT_TOWN_SYNC_PERENNIAL_STRATEGY=ff-only
  export GIT_TOWN_SYNC_PROTOTYPE_STRATEGY=rebase
  export GIT_TOWN_PUSH_BRANCHES="$publish"
  export GIT_TOWN_PUSH_HOOK=true
  export GIT_TOWN_SYNC_TAGS=false
  export GIT_TOWN_SYNC_UPSTREAM=false
  "${command[@]}"
) > "$raw_log" 2>&1 &
command_pid=$!
start_seconds=$SECONDS
timed_out=false
while kill -0 "$command_pid" 2>/dev/null; do
  if (( SECONDS - start_seconds >= timeout_seconds )); then
    timed_out=true
    kill -TERM "$command_pid" 2>/dev/null || true
    sleep 2
    kill -KILL "$command_pid" 2>/dev/null || true
    break
  fi
  sleep 1
done
wait "$command_pid"
rc=$?
if [[ "$timed_out" == true ]]; then
  rc=124
fi
set -e

tail -c "$max_log_bytes" "$raw_log" > "$log_file"
rm -f "$raw_log"
chmod 600 "$log_file"
after="$(git rev-parse HEAD 2>/dev/null || printf '%s' "$before")"
unmerged="$(git diff --name-only --diff-filter=U 2>/dev/null | paste -sd ',' - || true)"
log_digest="$(sha256_file "$log_file")"

if ((rc == 0)); then
  if [[ "$dry_run" == true ]]; then
    state="NOT_EXERCISED"
    push_state="NOT_EXERCISED"
    note="dry-run printed the mutation plan; no stack mutation was admitted"
  elif [[ "$publish" == true ]]; then
    state="PASS"
    push_state="PASS"
    note="stack synchronized with non-interactive rebase and safe push"
  else
    state="PASS"
    push_state="NOT_EXERCISED"
    note="stack synchronized locally; remote publication was intentionally not exercised"
  fi
else
  state="FAIL"
  push_state="FAIL"
  note="Git Town stopped; preserve this worktree and assign explicit recovery"
  mark_blocked "run=$run_id exit=$rc branch=$branch parent=$parent"
fi

release_branch_lease
cleanup_state="PASS"

{
  printf '{\n'
  printf '  "schema": "agent-shield/git-town-sync-receipt/v1",\n'
  printf '  "state": "%s",\n' "$state"
  printf '  "push_state": "%s",\n' "$push_state"
  printf '  "worker": "%s",\n' "$(json_escape "$WORKER_ID")"
  printf '  "issue": %s,\n' "$ISSUE_NUMBER"
  printf '  "branch": "%s",\n' "$(json_escape "$branch")"
  printf '  "parent": "%s",\n' "$(json_escape "$parent")"
  printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
  printf '  "command": "%s",\n' "$(json_escape "${command[*]}")"
  printf '  "before": "%s",\n' "$before"
  printf '  "after": "%s",\n' "$after"
  printf '  "dry_run": %s,\n' "$dry_run"
  printf '  "publish": %s,\n' "$publish"
  printf '  "timed_out": %s,\n' "$timed_out"
  printf '  "exit": %s,\n' "$rc"
  printf '  "unmerged_paths": "%s",\n' "$(json_escape "$unmerged")"
  printf '  "evals": "%s",\n' "$(json_escape "$TASK_EVALS")"
  printf '  "allowed_paths": "%s",\n' "$(json_escape "$TASK_ALLOWED_PATHS")"
  printf '  "log_sha256": "%s",\n' "$log_digest"
  printf '  "log_limit_bytes": %s,\n' "$max_log_bytes"
  printf '  "cleanup": "%s",\n' "$cleanup_state"
  printf '  "started_at": "%s",\n' "$started"
  printf '  "finished_at": "%s",\n' "$(utc_now)"
  printf '  "note": "%s"\n' "$(json_escape "$note")"
  printf '}\n'
} > "$receipt_file"
chmod 600 "$receipt_file"

log "receipt=$receipt_file state=$state exit=$rc"
if ((rc != 0)); then
  exit 2
fi
