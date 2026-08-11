#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

branch=""
parent=""
worktree=""
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
    --worktree) worktree="${2:-}"; shift ;;
    --issue) issue="${2:-}"; shift ;;
    --evals) evals="${2:-}"; shift ;;
    --allowed-paths) allowed_paths="${2:-}"; shift ;;
    --worker) worker="${2:-}"; shift ;;
    --dry-run) dry_run=true ;;
    --publish) publish=true ;;
    -h|--help)
      cat <<'EOF'
usage: worktree.sh --branch NAME --parent NAME --worktree PATH --issue N \
  --evals ID[,ID...] --allowed-paths GLOB[,GLOB...] [--worker ID] \
  [--dry-run | --publish]

Creates a new isolated linked worktree and local feature branch at the exact
parent, sets explicit Git Town parentage, and records the task packet under the
common Git directory. Publishing requires --publish and ALLOW_GIT_TOWN_PUSH=1.
EOF
      exit 0
      ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done

[[ "$branch" =~ ^(docs|feat|fix|chore)/[0-9A-Za-z._/-]+$ ]] || die 64 "invalid task branch: $branch"
[[ -n "$parent" ]] || die 64 "--parent is required"
[[ -n "$worktree" ]] || die 64 "--worktree is required"
[[ "$issue" =~ ^[0-9]+$ ]] || die 64 "--issue must be numeric"
[[ -n "$evals" && -n "$allowed_paths" ]] || die 64 "evals and allowed paths are required"
[[ "$branch" != "main" && "$branch" != "$parent" ]] || die 64 "unsafe branch relationship"
[[ ! ("$dry_run" == true && "$publish" == true) ]] || die 64 "--dry-run and --publish are mutually exclusive"
if [[ "$publish" == true && "${ALLOW_GIT_TOWN_PUSH:-0}" != "1" ]]; then
  die 64 "--publish requires ALLOW_GIT_TOWN_PUSH=1"
fi

require_command git
require_command git-town
root="$(repo_root)"
cd "$root"
require_team_config
require_git_town_license
version="$(require_git_town_version)"
require_clean_worktree
require_no_git_operation
[[ ! -e "$worktree" ]] || die 64 "worktree path already exists: $worktree"
if git show-ref --verify --quiet "refs/heads/$branch" || git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  die 64 "branch already exists: $branch"
fi
parent_commit="$(git rev-parse --verify "$parent^{commit}" 2>/dev/null || true)"
if [[ -z "$parent_commit" ]]; then
  parent_commit="$(git rev-parse --verify "origin/$parent^{commit}" 2>/dev/null || true)"
fi
[[ -n "$parent_commit" ]] || die 64 "parent commit is absent: $parent"

common="$(git_common_dir)"
acquire_named_lease "branch-$branch"

if [[ "$dry_run" == true ]]; then
  printf 'git worktree add -b %q %q %q\n' "$branch" "$worktree" "$parent_commit"
  printf '(cd %q && git town feature %q && git town set-parent %q --non-interactive --no-auto-resolve)\n' "$worktree" "$branch" "$parent"
  if [[ "$publish" == true ]]; then
    printf 'git -C %q push -u origin %q\n' "$worktree" "$branch"
  fi
  state="NOT_EXERCISED"
  rc=0
  head="$parent_commit"
else
  created=false
  cleanup_failed_creation() {
    if [[ "$created" == true && -d "$worktree" ]]; then
      git worktree remove --force "$worktree" >/dev/null 2>&1 || true
      git branch -D "$branch" >/dev/null 2>&1 || true
    fi
  }
  trap 'cleanup_failed_creation; release_branch_lease' ERR
  git worktree add -b "$branch" "$worktree" "$parent_commit"
  created=true
  (
    cd "$worktree"
    export GIT_TOWN_INTERACTIVE=false
    export GIT_TOWN_AUTO_RESOLVE=false
    export GIT_TOWN_PUSH_HOOK=true
    git town feature "$branch"
    git town set-parent "$parent" --non-interactive --no-auto-resolve
    actual_parent="$(git town config get-parent "$branch")"
    [[ "$actual_parent" == "$parent" ]] || die 64 "Git Town parent $actual_parent differs from $parent"
    if [[ "$publish" == true ]]; then
      git push -u origin "$branch"
    fi
  )
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
    printf 'WORKTREE_PATH=%q\n' "$worktree"
  } > "$task_file"
  chmod 600 "$task_file"
  head="$(git -C "$worktree" rev-parse HEAD)"
  state="PASS"
  rc=0
  trap release_branch_lease EXIT INT TERM
fi

receipt_dir="$(receipt_directory)"
receipt_file="$receipt_dir/worktree-$(sanitize_branch "$branch")-$(date -u '+%Y%m%dT%H%M%SZ')-$$.json"
release_branch_lease
{
  printf '{\n'
  printf '  "schema": "agent-shield/git-town-worktree-receipt/v1",\n'
  printf '  "state": "%s",\n' "$state"
  printf '  "worker": "%s",\n' "$(json_escape "$worker")"
  printf '  "issue": %s,\n' "$issue"
  printf '  "branch": "%s",\n' "$(json_escape "$branch")"
  printf '  "parent": "%s",\n' "$(json_escape "$parent")"
  printf '  "parent_commit": "%s",\n' "$parent_commit"
  printf '  "head": "%s",\n' "$head"
  printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
  printf '  "dry_run": %s,\n' "$dry_run"
  printf '  "publish": %s,\n' "$publish"
  printf '  "exit": %s,\n' "$rc"
  printf '  "evals": "%s",\n' "$(json_escape "$evals")"
  printf '  "allowed_paths": "%s",\n' "$(json_escape "$allowed_paths")"
  printf '  "cleanup": "PASS",\n'
  printf '  "finished_at": "%s"\n' "$(utc_now)"
  printf '}\n'
} > "$receipt_file"
chmod 600 "$receipt_file"
log "receipt=$receipt_file state=$state branch=$branch"
