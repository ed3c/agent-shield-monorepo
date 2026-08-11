#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_command git
require_command git-town
root="$(repo_root)"
cd "$root"
require_team_config
require_git_town_license
version="$(require_git_town_version)"
require_clean_worktree
require_no_git_operation
require_not_blocked
require_task_identity
acquire_branch_lease

branch="$(current_branch)"
parent="$(parent_for_branch "$branch")"
[[ "$branch" != "main" ]] || die 64 "main is human-owned"

diff_paths="$(git diff --name-only "$parent...HEAD")"
IFS=',' read -r -a allowed_patterns <<< "$TASK_ALLOWED_PATHS"
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  allowed=false
  for pattern in "${allowed_patterns[@]}"; do
    pattern="${pattern#${pattern%%[![:space:]]*}}"
    pattern="${pattern%${pattern##*[![:space:]]}}"
    if [[ "$path" == $pattern ]]; then
      allowed=true
      break
    fi
  done
  [[ "$allowed" == true ]] || die 64 "path outside task lease: $path"
done <<< "$diff_paths"

printf '{\n'
printf '  "schema": "agent-shield/git-town-doctor/v1",\n'
printf '  "state": "PASS",\n'
printf '  "worker": "%s",\n' "$(json_escape "$WORKER_ID")"
printf '  "issue": %s,\n' "$ISSUE_NUMBER"
printf '  "branch": "%s",\n' "$(json_escape "$branch")"
printf '  "parent": "%s",\n' "$(json_escape "$parent")"
printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
printf '  "license_sha256": "%s",\n' "$(sha256_file "$root/third_party/git-town/LICENSE")"
printf '  "head": "%s",\n' "$(current_commit)"
printf '  "evals": "%s",\n' "$(json_escape "$TASK_EVALS")"
printf '  "allowed_paths": "%s",\n' "$(json_escape "$TASK_ALLOWED_PATHS")"
printf '  "checked_at": "%s"\n' "$(utc_now)"
printf '}\n'
