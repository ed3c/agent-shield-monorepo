#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

title=""
body_file=""
draft=false

while (($#)); do
  case "$1" in
    --title) title="${2:-}"; shift ;;
    --body-file) body_file="${2:-}"; shift ;;
    --draft) draft=true ;;
    -h|--help)
      cat <<'EOF'
usage: propose.sh --title TEXT --body-file PATH [--draft]

Derives the direct PR base from Git Town, validates the eval-first body,
creates or updates the GitHub PR, and writes a receipt under the common Git
directory. The branch must already be safely published.
EOF
      exit 0
      ;;
    *) die 64 "unknown argument: $1" ;;
  esac
  shift
done

[[ -n "$title" ]] || die 64 "--title is required"
[[ -f "$body_file" ]] || die 64 "--body-file must name an existing file"
for marker in '## Issue and stack' '## Evals' '## Evidence boundary' '## Stacked-PR checks' '## Merge/handoff'; do
  grep -Fq "$marker" "$body_file" || die 64 "PR body is missing required section: $marker"
done
grep -Eqi 'negative control|negative/mutation' "$body_file" || die 64 "PR body is missing negative-control text"
grep -Eqi 'allowed paths|path lease' "$body_file" || die 64 "PR body is missing path-lease text"
grep -Eqi 'rollback|revert|handoff' "$body_file" || die 64 "PR body is missing rollback/handoff text"

require_command git
require_command git-town
require_command gh
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

gh auth status >/dev/null 2>&1 || die 64 "GitHub CLI authentication is absent"
branch="$(current_branch)"
parent="$(parent_for_branch "$branch")"
head="$(current_commit)"

remote_head="$(git ls-remote --heads origin "refs/heads/$branch" | awk '{print $1}')"
[[ "$remote_head" == "$head" ]] || die 64 "origin/$branch does not equal local HEAD; publish the stack safely first"

existing_url="$(gh pr view "$branch" --json url --jq .url 2>/dev/null || true)"
if [[ -n "$existing_url" ]]; then
  gh pr edit "$branch" --base "$parent" --title "$title" --body-file "$body_file" >/dev/null
  action="updated"
else
  create_args=(pr create --base "$parent" --head "$branch" --title "$title" --body-file "$body_file")
  if [[ "$draft" == true ]]; then
    create_args+=(--draft)
  fi
  existing_url="$(gh "${create_args[@]}")"
  action="created"
fi

pr_json="$(gh pr view "$branch" --json number,url,baseRefName,headRefName,isDraft --jq '[.number,.url,.baseRefName,.headRefName,.isDraft] | @tsv')"
IFS=$'\t' read -r pr_number pr_url pr_base pr_head pr_draft <<< "$pr_json"
[[ "$pr_base" == "$parent" ]] || die 64 "PR base $pr_base differs from Git Town parent $parent"
[[ "$pr_head" == "$branch" ]] || die 64 "PR head $pr_head differs from task branch $branch"

body_digest="$(sha256_file "$body_file")"
receipt_dir="$(receipt_directory)"
receipt_file="$receipt_dir/propose-$(sanitize_branch "$branch")-$(date -u '+%Y%m%dT%H%M%SZ')-$$.json"
release_branch_lease
{
  printf '{\n'
  printf '  "schema": "agent-shield/git-town-proposal-receipt/v1",\n'
  printf '  "state": "PASS",\n'
  printf '  "action": "%s",\n' "$action"
  printf '  "worker": "%s",\n' "$(json_escape "$WORKER_ID")"
  printf '  "issue": %s,\n' "$ISSUE_NUMBER"
  printf '  "branch": "%s",\n' "$(json_escape "$branch")"
  printf '  "parent": "%s",\n' "$(json_escape "$parent")"
  printf '  "head": "%s",\n' "$head"
  printf '  "git_town_version": "%s",\n' "$(json_escape "$version")"
  printf '  "pr_number": %s,\n' "$pr_number"
  printf '  "pr_url": "%s",\n' "$(json_escape "$pr_url")"
  printf '  "draft": %s,\n' "$pr_draft"
  printf '  "body_sha256": "%s",\n' "$body_digest"
  printf '  "evals": "%s",\n' "$(json_escape "$TASK_EVALS")"
  printf '  "cleanup": "PASS",\n'
  printf '  "finished_at": "%s"\n' "$(utc_now)"
  printf '}\n'
} > "$receipt_file"
chmod 600 "$receipt_file"
log "receipt=$receipt_file pr=$pr_url"
