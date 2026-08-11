#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[git-town-worker] %s\n' "$*" >&2
}

die() {
  local code="$1"
  shift
  log "FAIL: $*"
  exit "$code"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die 64 "required command is absent: $1"
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || die 64 "not inside a Git worktree"
}

git_common_dir() {
  local root
  root="$(repo_root)"
  git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || die 64 "cannot resolve common Git directory"
}

git_path() {
  local root
  root="$(repo_root)"
  git -C "$root" rev-parse --path-format=absolute --git-path "$1"
}

current_branch() {
  git symbolic-ref --quiet --short HEAD 2>/dev/null || die 64 "detached HEAD is not an admitted Worker-Agent state"
}

current_commit() {
  git rev-parse HEAD 2>/dev/null || die 64 "cannot resolve HEAD"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    die 64 "sha256sum or shasum is required"
  fi
}

require_clean_worktree() {
  local root status
  root="$(repo_root)"
  status="$(git -C "$root" status --porcelain=v1 --untracked-files=normal)"
  [[ -z "$status" ]] || die 64 "worktree is dirty; unattended workers do not auto-stash"
}

require_no_git_operation() {
  local marker
  for marker in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
    [[ ! -e "$(git_path "$marker")" ]] || die 64 "Git operation is already in progress: $marker"
  done
  [[ ! -d "$(git_path rebase-merge)" ]] || die 64 "interactive/merge rebase is already in progress"
  [[ ! -d "$(git_path rebase-apply)" ]] || die 64 "apply rebase is already in progress"
  [[ -z "$(git diff --name-only --diff-filter=U)" ]] || die 64 "unmerged paths exist"
}

version_number() {
  local output version
  output="$(git town --version 2>/dev/null || true)"
  if [[ -z "$output" ]] && command -v git-town >/dev/null 2>&1; then
    output="$(git-town --version 2>/dev/null || true)"
  fi
  version="$(printf '%s\n' "$output" | grep -Eo '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n 1 || true)"
  [[ -n "$version" ]] || die 64 "cannot determine Git Town version"
  printf '%s' "$version"
}

require_git_town_version() {
  local required actual
  required="${GIT_TOWN_REQUIRED_VERSION:-24.0}"
  actual="$(version_number)"
  if [[ "$required" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    [[ "$actual" == "$required" ]] || die 64 "Git Town $actual does not equal required exact version $required"
  else
    [[ "$actual" == "$required" || "$actual" == "$required".* ]] || die 64 "Git Town $actual is outside admitted line $required"
  fi
  printf '%s' "$actual"
}

require_team_config() {
  local root config
  root="$(repo_root)"
  config="$root/.git-town.toml"
  [[ -f "$config" ]] || die 64 "missing team config: .git-town.toml"
  grep -Eq '^interactive = false$' "$config" || die 64 "Git Town interactivity must be disabled"
  grep -Eq '^feature-strategy = "rebase"$' "$config" || die 64 "feature sync strategy must be rebase"
  grep -Eq '^perennial-strategy = "ff-only"$' "$config" || die 64 "perennial sync strategy must be ff-only"
  grep -Eq '^push-branches = true$' "$config" || die 64 "branch pushing must be enabled"
  grep -Eq '^push-hook = true$' "$config" || die 64 "pre-push hooks must remain enabled"
  if grep -Eqi '(token|password|secret|private[_-]?key)[[:space:]]*=' "$config"; then
    die 64 "team config contains credential-like material"
  fi
}

parent_for_branch() {
  local branch parent
  branch="${1:-$(current_branch)}"
  parent="$(git town config get-parent "$branch" 2>/dev/null || true)"
  [[ -n "$parent" ]] || die 64 "Git Town parent is unknown for $branch"
  printf '%s' "$parent"
}

require_task_packet() {
  local name
  for name in WORKER_ID ISSUE_NUMBER TASK_BRANCH TASK_PARENT TASK_EVALS TASK_ALLOWED_PATHS; do
    [[ -n "${!name:-}" ]] || die 64 "task metadata is absent: $name"
  done
  [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || die 64 "ISSUE_NUMBER must be numeric"
  [[ "$TASK_BRANCH" != "main" ]] || die 64 "Worker Agents may not own main"
}

require_task_identity() {
  local branch parent
  require_task_packet
  branch="$(current_branch)"
  [[ "$branch" == "$TASK_BRANCH" ]] || die 64 "current branch $branch differs from task branch $TASK_BRANCH"
  parent="$(parent_for_branch "$branch")"
  [[ "$parent" == "$TASK_PARENT" ]] || die 64 "Git Town parent $parent differs from task parent $TASK_PARENT"
}

sanitize_branch() {
  printf '%s' "$1" | tr '/:@ ' '____' | tr -cd '[:alnum:]_.-'
}

LEASE_DIR=""
release_branch_lease() {
  if [[ -n "${LEASE_DIR:-}" && -d "$LEASE_DIR" ]]; then
    rm -rf "$LEASE_DIR"
  fi
}

acquire_branch_lease() {
  local common branch lock_root
  common="$(git_common_dir)"
  branch="$(sanitize_branch "$(current_branch)")"
  lock_root="$common/agent-shield/leases"
  mkdir -p "$lock_root"
  LEASE_DIR="$lock_root/$branch.lock"
  if ! mkdir "$LEASE_DIR" 2>/dev/null; then
    die 64 "branch lease already exists: $LEASE_DIR"
  fi
  printf '%s\n' "${WORKER_ID:-unassigned}" > "$LEASE_DIR/worker"
  printf '%s\n' "$$" > "$LEASE_DIR/pid"
  trap release_branch_lease EXIT INT TERM
}

receipt_directory() {
  local dir
  dir="$(git_common_dir)/agent-shield/receipts"
  mkdir -p "$dir"
  printf '%s' "$dir"
}

log_directory() {
  local dir
  dir="$(git_common_dir)/agent-shield/logs"
  mkdir -p "$dir"
  printf '%s' "$dir"
}

utc_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}
