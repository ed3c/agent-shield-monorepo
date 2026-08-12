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

git_worktree_dir() {
  local root
  root="$(repo_root)"
  git -C "$root" rev-parse --path-format=absolute --git-dir 2>/dev/null || die 64 "cannot resolve worktree Git directory"
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
    die 64 "ABSENT: sha256sum and shasum commands are unavailable"
  fi
}

sanitize_branch() {
  printf '%s' "$1" | tr '/:@ ' '____' | tr -cd '[:alnum:]_.-'
}

require_clean_worktree() {
  local root status
  root="$(repo_root)"
  status="$(git -C "$root" status --porcelain=v1 --untracked-files=normal)"
  [[ -z "$status" ]] || die 64 "worktree is dirty; unattended workers do not auto-stash"
}

require_linked_worktree() {
  [[ "$(git_worktree_dir)" != "$(git_common_dir)" ]] || die 64 "operation requires an isolated linked worktree"
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

require_safe_remote_url() {
  local url
  url="$(git remote get-url origin 2>/dev/null || true)"
  [[ -n "$url" ]] || die 64 "origin remote is absent"
  case "$url" in
    http://*|https://*)
      [[ ! "$url" =~ ^https?://[^/@]+:[^/@]+@ ]] || die 64 "origin URL embeds credentials"
      [[ "$url" != *"?"* ]] || die 64 "origin URL contains a query string and is not portable receipt-safe"
      ;;
    ssh://*|git@*:*|file://*|/*) ;;
    *) die 64 "unsupported origin URL form: $url" ;;
  esac
}

version_number() {
  local output version
  output="$(git town --version 2>/dev/null || true)"
  if [[ -z "$output" ]] && command -v git-town >/dev/null 2>&1; then
    output="$(git-town --version 2>/dev/null || true)"
  fi
  version="$(printf '%s\n' "$output" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  [[ -n "$version" ]] || die 64 "cannot determine exact Git Town version"
  printf '%s' "$version"
}

require_git_town_version() {
  local required actual
  required="24.0.0"
  if [[ -n "${GIT_TOWN_REQUIRED_VERSION:-}" && "$GIT_TOWN_REQUIRED_VERSION" != "$required" ]]; then
    die 64 "GIT_TOWN_REQUIRED_VERSION cannot override the admitted version $required"
  fi
  actual="$(version_number)"
  [[ "$actual" == "$required" ]] || die 64 "Git Town $actual does not equal required version $required"
  printf '%s' "$actual"
}

require_git_town_license() {
  local root license expected actual
  root="$(repo_root)"
  license="$root/third_party/git-town/LICENSE"
  expected="eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791"
  [[ -f "$license" ]] || die 64 "vendored Git Town license is absent"
  actual="$(sha256_file "$license")"
  [[ "$actual" == "$expected" ]] || die 64 "vendored Git Town license digest mismatch"
}

require_team_config() {
  local root config
  root="$(repo_root)"
  config="$root/.git-town.toml"
  [[ -f "$config" ]] || die 64 "missing team config: .git-town.toml"
  grep -Eq '^interactive = false$' "$config" || die 64 "Git Town interactivity must be disabled"
  grep -Eq '^main = "main"$' "$config" || die 64 "main branch policy must be explicit"
  grep -Eq '^share-new-branches = "no"$' "$config" || die 64 "new branches must require explicit publication"
  grep -Eq '^auto-sync = false$' "$config" || die 64 "Bash wrappers must own synchronization"
  grep -Eq '^auto-resolve = false$' "$config" || die 64 "automatic conflict resolution must be disabled"
  grep -Eq '^feature-strategy = "rebase"$' "$config" || die 64 "feature sync strategy must be rebase"
  grep -Eq '^perennial-strategy = "ff-only"$' "$config" || die 64 "perennial sync strategy must be ff-only"
  grep -Eq '^push-branches = false$' "$config" || die 64 "publication must be explicit"
  grep -Eq '^push-hook = true$' "$config" || die 64 "pre-push hooks must remain enabled"
  grep -Eq '^tags = false$' "$config" || die 64 "unattended tag synchronization must be disabled"
  grep -Eq '^upstream = false$' "$config" || die 64 "unattended upstream synchronization must be disabled"
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
  [[ "$WORKER_ID" =~ ^[A-Za-z0-9._-]+$ ]] || die 64 "WORKER_ID contains unsafe characters"
  [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || die 64 "ISSUE_NUMBER must be numeric"
  [[ "$TASK_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die 64 "TASK_BRANCH contains unsafe characters"
  [[ "$TASK_PARENT" =~ ^[A-Za-z0-9._/-]+$ ]] || die 64 "TASK_PARENT contains unsafe characters"
  [[ "$TASK_BRANCH" != "main" ]] || die 64 "Worker Agents may not own main"
}

load_task_packet() {
  if [[ -z "${TASK_BRANCH:-}" ]]; then
    local branch task_file
    branch="$(current_branch)"
    task_file="$(git_common_dir)/agent-shield/tasks/$(sanitize_branch "$branch").env"
    [[ -f "$task_file" ]] || die 64 "host-owned task packet is absent: $task_file"
    # shellcheck disable=SC1090
    source "$task_file"
  fi
  require_task_packet
}

require_task_identity() {
  local branch parent
  load_task_packet
  branch="$(current_branch)"
  [[ "$branch" == "$TASK_BRANCH" ]] || die 64 "current branch $branch differs from task branch $TASK_BRANCH"
  parent="$(parent_for_branch "$branch")"
  [[ "$parent" == "$TASK_PARENT" ]] || die 64 "Git Town parent $parent differs from task parent $TASK_PARENT"
}

LEASE_DIR=""
release_branch_lease() {
  if [[ -n "${LEASE_DIR:-}" && -d "$LEASE_DIR" ]]; then
    rm -rf "$LEASE_DIR"
  fi
  LEASE_DIR=""
}

acquire_named_lease() {
  local name="$1" common lock_root
  common="$(git_common_dir)"
  lock_root="$common/agent-shield/leases"
  mkdir -p "$lock_root"
  LEASE_DIR="$lock_root/$(sanitize_branch "$name").lock"
  if ! mkdir "$LEASE_DIR" 2>/dev/null; then
    die 64 "lease already exists: $LEASE_DIR"
  fi
  printf '%s\n' "${WORKER_ID:-unassigned}" > "$LEASE_DIR/worker"
  printf '%s\n' "$$" > "$LEASE_DIR/pid"
  trap release_branch_lease EXIT INT TERM
}

acquire_branch_lease() {
  acquire_named_lease "branch-$(current_branch)"
}

acquire_sync_lease() {
  # Stack synchronization can rewrite several refs, so it is serialized repo-wide.
  acquire_named_lease "repository-sync"
}

receipt_directory() {
  local dir
  dir="$(git_common_dir)/agent-shield/receipts"
  mkdir -p "$dir"
  chmod 700 "$dir" 2>/dev/null || true
  printf '%s' "$dir"
}

log_directory() {
  local dir
  dir="$(git_common_dir)/agent-shield/logs"
  mkdir -p "$dir"
  chmod 700 "$dir" 2>/dev/null || true
  printf '%s' "$dir"
}

mark_blocked() {
  local marker
  marker="$(git_path agent-shield-BLOCKED)"
  printf '%s\n' "$1" > "$marker"
}

require_not_blocked() {
  local marker
  marker="$(git_path agent-shield-BLOCKED)"
  [[ ! -e "$marker" ]] || die 64 "worktree is blocked pending explicit recovery: $marker"
}

utc_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}
