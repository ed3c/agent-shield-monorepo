#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

branch=""
parent=""
issue=""
evals=""
allowed_paths=""
worker="${WORKER_ID:-unassigned}"
dry_run=false
publish=false

while (($#)); do
  case "$1" in
    --branch) branch="${2:-}"; shift ;;
    --parent) parent="${2:-}"; shift ;;
    --issue) issue="${2:-}"; shift ;;
    --evals) evals="${2:-}"; shift ;;
    --allowed-paths) allowed_paths="${2:-}"; shift ;;
    --worker) worker="${2:-}"; shift ;;
    --dry-run) dry_run=true ;;
    --publish) publish=true ;;
    -h|--help)
      cat <<'EOF'
usage: new-branch.sh --branch NAME --parent NAME --issue N \
  --evals ID[,ID...] --allowed-paths GLOB[,GLOB...] [--worker ID] \
  [--dry-run | --publish]

Run inside an isolated, clean linked worktree currently checked out on the
intended parent. Branch creation is local by default. Publishing requires
--publish and ALLOW_GIT_TOWN_PUSH=1.
EOF
      exit 0
      ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done

[[ "$branch" =~ ^(docs|feat|fix|chore)/[0-9A-Za-z._/-]+$ ]] || die 64 "invalid task branch: $branch"
[[ -n "$parent" ]] || die 64 "--parent is required"
[[ "$issue" =~ ^[0-9]+$ ]] || die 64 "--issue must be numeric"
[[ -n "$evals" ]] || die 64 "--evals is required"
[[ -n "$allowed_paths" ]] || die 64 "--allowed-paths is required"
[[ "$branch" != "$parent" && "$branch" != "main" ]] || die 64 "unsafe branch relationship"
[[ ! ("$dry_run" == true && "$publish" == true) ]] || die 64 "--dry-run and --publish are mutually exclusive"
if [[ "$publish" == true && "${ALLOW_GIT_TOWN_PUSH:-0}" != "1" ]]; then
  die 64 "--publish requires ALLOW_GIT_TOWN_PUSH=1"
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
current="$(current_branch)"
[[ "$current" == "$parent" ]] || die 64 "current branch $current differs from intended parent $parent"
if git show-ref --verify --quiet "refs/heads/$branch" || git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  die 64 "branch already exists: $branch"
fi

common="$(git_common_dir)"
acquire_named_lease "branch-$branch"

if [[ "$parent" == "main" ]]; then
  command=(git town hack "$branch" --non-interactive --no-auto-resolve --no-stash)
else
  command=(git town append "$branch" --non-interactive --no-auto-resolve --no-stash)
  [[ "$publish" == false ]] && command+=(--no-push) || command+=(--push)
fi
if [[ "$dry_run" == true ]]; then
  command+=(--dry-run)
fi

log "running: ${command[*]}"
set +e
(
  export GIT_TOWN_INTERACTIVE=false
  export GIT_TOWN_AUTO_RESOLVE=false
  export GIT_TOWN_SHARE_NEW_BRANCHES=$([[ "$publish" == true ]] && printf push || printf no)
  export GIT_TOWN_SYNC_FEATURE_STRATEGY=rebase
  export GIT_TOWN_SYNC_PERENNIAL_STRATEGY=ff-only
  export GIT_TOWN_PUSH_BRANCHES="$publish"
  export GIT_TOWN_PUSH_HOOK=true
  "${command[@]}"
)
rc=$?
set -e

state="FAIL"
note="branch creation failed"
head="$(current_commit)"
if ((rc == 0)); then
  if [[ "$dry_run" == true ]]; then
    state="NOT_EXERCISED"
    note="dry-run printed the branch creation plan"
  else
    [[ "$(current_branch)" == "$branch" ]] || die 64 "Git Town did not check out the created branch"
    actual_parent="$(parent_for_branch "$branch")"
    [[ "$actual_parent" == "$parent" ]] || die 64 "created branch parent $actual_parent differs from $parent"
    head="$(current_commit)"
    task_dir="$common/agent-shield/tasks"
    mkdir -p "$task_dir"
    chmod 700 "$task_dir" 2>/dev/null || true
    task_file="$task_dir/$(sanitize_branch "$branch").env"
    {
      printf 'WORKER_ID=%q\n' "$worker"
      printf 'ISSUE_NUMBER=%q\n' "$issue"
      printf 'TASK_BRANCH=%q\n' "$branch"
      printf 'TASK_PARENT=%q\n' "$parent"
      printf 'TASK_EVALS=%q\n' "$evals"
      printf 'TASK_ALLOWED_PATHS=%q\n' "$allowed_paths"
    } > "$task_file"
    chmod 600 "$task_file"
    state="PASS"
    note="branch created with explicit parent and task packet"
  fi
fi

receipt_dir="$(receipt_directory)"
receipt_file="$receipt_dir/create-$(sanitize_branch "$branch")-$(date -u '+%Y%m%dT%H%M%SZ')-$$.json"
release_branch_lease
{
  printf '{\n'
  printf '  "schema": "agent-shield/git-town-create-receipt/v1",\n'
  printf '  "state": "%s",\n' "$state"
  printf '  "worker": "%s",\n' "$(json_escape "$worker")"
  printf '  "issue": %s,\n' "$issue"
  printf '  "branch": "%s",\n' "$(json_escape "$branch")"
  printf '  "parent": "%s",\n' "$(json_escape "$parent")"
  printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
  printf '  "command": "%s",\n' "$(json_escape "${command[*]}")"
  printf '  "head": "%s",\n' "$head"
  printf '  "dry_run": %s,\n' "$dry_run"
  printf '  "publish": %s,\n' "$publish"
  printf '  "exit": %s,\n' "$rc"
  printf '  "evals": "%s",\n' "$(json_escape "$evals")"
  printf '  "allowed_paths": "%s",\n' "$(json_escape "$allowed_paths")"
  printf '  "cleanup": "PASS",\n'
  printf '  "finished_at": "%s",\n' "$(utc_now)"
  printf '  "note": "%s"\n' "$(json_escape "$note")"
  printf '}\n'
} > "$receipt_file"
chmod 600 "$receipt_file"
log "receipt=$receipt_file state=$state exit=$rc"

if ((rc != 0)); then
  exit 2
fi
