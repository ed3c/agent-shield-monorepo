#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

dry_run=false
while (($#)); do
  case "$1" in
    --dry-run) dry_run=true ;;
    -h|--help)
      cat <<'EOF'
usage: sync-stack.sh [--dry-run]

Requires WORKER_ID, ISSUE_NUMBER, TASK_BRANCH, TASK_PARENT, TASK_EVALS,
and TASK_ALLOWED_PATHS. Conflicts stop the worker and preserve the suspended
Git Town state for an explicit recovery assignment.
EOF
      exit 0
      ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done

require_command git
require_command git-town
root="$(repo_root)"
cd "$root"
require_team_config
version="$(require_git_town_version)"
require_clean_worktree
require_no_git_operation
require_task_identity
acquire_branch_lease

branch="$(current_branch)"
parent="$(parent_for_branch "$branch")"
before="$(current_commit)"
started="$(utc_now)"
log_dir="$(log_directory)"
receipt_dir="$(receipt_directory)"
safe_branch="$(sanitize_branch "$branch")"
run_id="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
log_file="$log_dir/sync-$safe_branch-$run_id.log"
receipt_file="$receipt_dir/sync-$safe_branch-$run_id.json"
max_log_bytes="${GIT_TOWN_MAX_LOG_BYTES:-1048576}"

command=(git town sync --stack --non-interactive --push --no-auto-resolve --verbose)
if [[ "$dry_run" == true ]]; then
  command+=(--dry-run)
fi

log "worker=$WORKER_ID issue=$ISSUE_NUMBER branch=$branch parent=$parent"
log "running: ${command[*]}"

set +e
(
  export GIT_TOWN_INTERACTIVE=false
  export GIT_TOWN_SYNC_FEATURE_STRATEGY=rebase
  export GIT_TOWN_SYNC_PERENNIAL_STRATEGY=ff-only
  export GIT_TOWN_SYNC_PROTOTYPE_STRATEGY=rebase
  export GIT_TOWN_PUSH_BRANCHES=true
  export GIT_TOWN_PUSH_HOOK=true
  export GIT_TOWN_SYNC_TAGS=false
  export GIT_TOWN_SYNC_UPSTREAM=false
  "${command[@]}"
) > >(tee "$log_file") 2>&1
rc=$?
set -e

after="$(git rev-parse HEAD 2>/dev/null || printf '%s' "$before")"
unmerged="$(git diff --name-only --diff-filter=U 2>/dev/null | paste -sd ',' - || true)"
truncated=false
if [[ -f "$log_file" ]]; then
  size="$(wc -c < "$log_file" | tr -d ' ')"
  if [[ "$size" =~ ^[0-9]+$ ]] && ((size > max_log_bytes)); then
    tail -c "$max_log_bytes" "$log_file" > "$log_file.tmp"
    mv "$log_file.tmp" "$log_file"
    truncated=true
  fi
fi
log_digest="$(sha256_file "$log_file")"

if ((rc == 0)); then
  if [[ "$dry_run" == true ]]; then
    state="NOT_EXERCISED"
    note="dry-run printed the mutation plan; no stack mutation was admitted"
  else
    state="PASS"
    note="stack synchronized with non-interactive rebase and safe push"
  fi
else
  state="FAIL"
  note="Git Town stopped; preserve this worktree and assign explicit recovery"
fi

release_branch_lease
cleanup_state="PASS"

{
  printf '{\n'
  printf '  "schema": "agent-shield/git-town-sync-receipt/v1",\n'
  printf '  "state": "%s",\n' "$state"
  printf '  "worker": "%s",\n' "$(json_escape "$WORKER_ID")"
  printf '  "issue": %s,\n' "$ISSUE_NUMBER"
  printf '  "branch": "%s",\n' "$(json_escape "$branch")"
  printf '  "parent": "%s",\n' "$(json_escape "$parent")"
  printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
  printf '  "command": "%s",\n' "$(json_escape "${command[*]}")"
  printf '  "before": "%s",\n' "$before"
  printf '  "after": "%s",\n' "$after"
  printf '  "dry_run": %s,\n' "$dry_run"
  printf '  "exit": %s,\n' "$rc"
  printf '  "unmerged_paths": "%s",\n' "$(json_escape "$unmerged")"
  printf '  "evals": "%s",\n' "$(json_escape "$TASK_EVALS")"
  printf '  "allowed_paths": "%s",\n' "$(json_escape "$TASK_ALLOWED_PATHS")"
  printf '  "log_sha256": "%s",\n' "$log_digest"
  printf '  "log_truncated": %s,\n' "$truncated"
  printf '  "cleanup": "%s",\n' "$cleanup_state"
  printf '  "started_at": "%s",\n' "$started"
  printf '  "finished_at": "%s",\n' "$(utc_now)"
  printf '  "note": "%s"\n' "$(json_escape "$note")"
  printf '}\n'
} > "$receipt_file"

log "receipt=$receipt_file state=$state exit=$rc"
if ((rc != 0)); then
  exit 2
fi
