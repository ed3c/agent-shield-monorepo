#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)"
mode="static"
[[ "${1:-}" != "--integration" ]] || mode="integration"

fail() {
  printf 'SELFTEST RED: %s\n' "$*" >&2
  exit 2
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

cleanup_paths=()
cleanup() {
  local path
  for path in "${cleanup_paths[@]:-}"; do
    [[ -z "$path" ]] || rm -rf "$path"
  done
}
trap cleanup EXIT

for script in "$SCRIPT_DIR"/*.sh; do
  bash -n "$script" || fail "Bash syntax failed: $script"
done

grep -Eq '^interactive = false$' "$ROOT/.git-town.toml" || fail "non-interactive policy absent"
grep -Eq '^main = "main"$' "$ROOT/.git-town.toml" || fail "explicit main branch policy absent"
grep -Eq '^share-new-branches = "no"$' "$ROOT/.git-town.toml" || fail "implicit branch sharing is enabled"
grep -Eq '^auto-sync = false$' "$ROOT/.git-town.toml" || fail "Bash wrapper ownership absent"
grep -Eq '^auto-resolve = false$' "$ROOT/.git-town.toml" || fail "auto-resolve policy is enabled"
grep -Eq '^feature-strategy = "rebase"$' "$ROOT/.git-town.toml" || fail "feature rebase policy absent"
grep -Eq '^perennial-strategy = "ff-only"$' "$ROOT/.git-town.toml" || fail "perennial ff-only policy absent"
grep -Eq '^push-branches = false$' "$ROOT/.git-town.toml" || fail "implicit push policy is enabled"
grep -Eq '^push-hook = true$' "$ROOT/.git-town.toml" || fail "push-hook policy absent"
grep -Eq '^tags = false$' "$ROOT/.git-town.toml" || fail "tag sync is enabled"
grep -Eq '^upstream = false$' "$ROOT/.git-town.toml" || fail "upstream sync is enabled"

license="$ROOT/third_party/git-town/LICENSE"
[[ -f "$license" ]] || fail "Git Town license notice absent"
[[ "$(sha256_file "$license")" == "eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791" ]] || fail "Git Town license digest mismatch"
grep -Eq '^  required="24\.0\.0"$' "$SCRIPT_DIR/common.sh" || fail "exact Git Town version gate absent"
grep -Fq 'cannot override the admitted version' "$SCRIPT_DIR/common.sh" || fail "version override refusal absent"

grep -Fq 'git town sync --stack --non-interactive --push --no-auto-resolve' "$ROOT/docs/git/STACKED_PRS.md" || fail "canonical publish subject absent"
grep -Fq -- '--no-auto-resolve' "$SCRIPT_DIR/sync-stack.sh" || fail "sync wrapper allows auto resolution"
grep -Fq -- '--no-push' "$SCRIPT_DIR/sync-stack.sh" || fail "local no-push mode absent"
grep -Fq 'ALLOW_GIT_TOWN_PUSH' "$SCRIPT_DIR/sync-stack.sh" || fail "publish guard absent"
grep -Fq 'sync-stack.sh' "$SCRIPT_DIR/background-sync.sh" || fail "background worker does not delegate to canonical wrapper"
if grep -Fq 'git town sync' "$SCRIPT_DIR/background-sync.sh"; then
  fail "background worker contains a second sync implementation"
fi

for script in doctor.sh sync-stack.sh background-sync.sh propose.sh new-branch.sh; do
  grep -Fq 'require_linked_worktree' "$SCRIPT_DIR/$script" || fail "$script does not require an isolated linked worktree"
  grep -Fq 'require_safe_remote_url' "$SCRIPT_DIR/$script" || fail "$script does not reject unsafe origin URLs"
done
grep -Fq 'load_task_packet' "$SCRIPT_DIR/common.sh" || fail "host-owned task-packet loader absent"
grep -Fq 'load_task_packet' "$SCRIPT_DIR/background-sync.sh" || fail "background worker does not restore its task packet"
grep -Fq 'git town set-parent' "$SCRIPT_DIR/worktree.sh" || fail "worktree creation does not bind the explicit parent"
while IFS= read -r script; do
  [[ "$script" == "$SCRIPT_DIR/selftest.sh" ]] && continue
  if grep -Fq 'git town feature' "$script"; then
    fail "invalid hidden git town feature command remains in $script"
  fi
done < <(find "$SCRIPT_DIR" -maxdepth 1 -type f -name '*.sh' -print)

for forbidden in 'git town continue' 'git town skip' 'git town undo' 'git town ship'; do
  while IFS= read -r script; do
    [[ "$script" == "$SCRIPT_DIR/selftest.sh" ]] && continue
    if grep -Fq "$forbidden" "$script"; then
      fail "unattended script contains forbidden recovery/ship command: $forbidden"
    fi
  done < <(find "$SCRIPT_DIR" -maxdepth 1 -type f -name '*.sh' -print)
done

mutation="$(mktemp "${TMPDIR:-/tmp}/git-town-sync-mutation.XXXXXX")"
cleanup_paths+=("$mutation")
sed 's/--no-auto-resolve/--auto-resolve/' "$SCRIPT_DIR/sync-stack.sh" > "$mutation"
if grep -Fq -- '--no-auto-resolve' "$mutation"; then
  fail "mutation control did not remove fail-closed flag"
fi
grep -Fq -- '--auto-resolve' "$mutation" || fail "mutation fixture was not planted"

license_mutation="$(mktemp "${TMPDIR:-/tmp}/git-town-license-mutation.XXXXXX")"
cleanup_paths+=("$license_mutation")
cp "$license" "$license_mutation"
printf '\nmutation\n' >> "$license_mutation"
[[ "$(sha256_file "$license_mutation")" != "eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791" ]] || fail "license mutation was not detectable"

lease_root="$(mktemp -d "${TMPDIR:-/tmp}/git-town-lease.XXXXXX")"
cleanup_paths+=("$lease_root")
mkdir "$lease_root/repository-sync.lock" || fail "initial lease failed"
if mkdir "$lease_root/repository-sync.lock" 2>/dev/null; then
  fail "duplicate repository sync lease was accepted"
fi

fixture="$(mktemp -d "${TMPDIR:-/tmp}/git-town-static.XXXXXX")"
cleanup_paths+=("$fixture")
fixture_repo="$fixture/repo"
fixture_remote="$fixture/remote.git"
fixture_worktree="$fixture/worktree"
git init --bare -q "$fixture_remote"
git init -q -b main "$fixture_repo"
git -C "$fixture_repo" config user.name 'Git Town static selftest'
git -C "$fixture_repo" config user.email 'git-town-static@example.invalid'
printf 'base\n' > "$fixture_repo/subject.txt"
git -C "$fixture_repo" add subject.txt
git -C "$fixture_repo" commit -q -m base
git -C "$fixture_repo" remote add origin "$fixture_remote"

if (
  cd "$fixture_repo"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/common.sh"
  require_linked_worktree
) >/dev/null 2>&1; then
  fail "primary checkout was accepted as an isolated linked worktree"
fi

git -C "$fixture_repo" worktree add -q -b docs/static-worker "$fixture_worktree"
(
  cd "$fixture_worktree"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/common.sh"
  require_linked_worktree
  require_safe_remote_url
  task_dir="$(git_common_dir)/agent-shield/tasks"
  mkdir -p "$task_dir"
  cat > "$task_dir/docs_static-worker.env" <<'EOF'
WORKER_ID=worker-static
ISSUE_NUMBER=15
TASK_BRANCH=docs/static-worker
TASK_PARENT=main
TASK_EVALS=E10.4
TASK_ALLOWED_PATHS=docs/**
EOF
  chmod 600 "$task_dir/docs_static-worker.env"
  unset WORKER_ID ISSUE_NUMBER TASK_BRANCH TASK_PARENT TASK_EVALS TASK_ALLOWED_PATHS || true
  load_task_packet
  [[ "$WORKER_ID" == worker-static && "$ISSUE_NUMBER" == 15 && "$TASK_BRANCH" == docs/static-worker ]]
) || fail "linked worktree or persisted task-packet control failed"

git -C "$fixture_repo" remote set-url origin 'https://user:secret@example.invalid/repo.git'
if (
  cd "$fixture_repo"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/common.sh"
  require_safe_remote_url
) >/dev/null 2>&1; then
  fail "credential-bearing origin URL was accepted"
fi

if [[ "$mode" == "static" ]]; then
  printf 'SELFTEST GREEN: static Git Town governance controls\n'
  exit 0
fi

command -v git-town >/dev/null 2>&1 || fail "integration mode requires git-town 24.0.0"
actual="$(git-town --version | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
[[ "$actual" == "24.0.0" ]] || fail "integration mode requires Git Town 24.0.0, observed ${actual:-unknown}"

base="$(mktemp -d "${TMPDIR:-/tmp}/git-town-integration.XXXXXX")"
cleanup_paths+=("$base")
remote="$base/remote.git"
repo="$base/repo"
git init --bare -q "$remote"
git init -q -b main "$repo"
git -C "$repo" config user.name 'Git Town integration selftest'
git -C "$repo" config user.email 'git-town-integration@example.invalid'
printf 'base\n' > "$repo/subject.txt"
cp "$ROOT/.git-town.toml" "$repo/.git-town.toml"
git -C "$repo" add subject.txt .git-town.toml
git -C "$repo" commit -q -m base
git -C "$repo" remote add origin "$remote"
git -C "$repo" push -q -u origin main

(
  cd "$repo"
  export GIT_TOWN_INTERACTIVE=false
  export GIT_TOWN_AUTO_RESOLVE=false
  git town hack docs/fixture-parent --non-interactive --no-auto-resolve --no-stash
  printf 'parent-v1\n' > parent.txt
  git add parent.txt
  git commit -q -m parent-v1
  git town sync --stack --non-interactive --push --no-auto-resolve
  git town append docs/fixture-child --non-interactive --push --no-auto-resolve --no-stash
  printf 'child-v1\n' > child.txt
  git add child.txt
  git commit -q -m child-v1
  git town sync --stack --non-interactive --push --no-auto-resolve
  git switch -q docs/fixture-parent
  printf 'parent-v2\n' > conflict.txt
  git add conflict.txt
  git commit -q -m parent-v2
  git push -q origin docs/fixture-parent
  git switch -q docs/fixture-child
  printf 'child-v2\n' > conflict.txt
  git add conflict.txt
  git commit -q -m child-v2
  set +e
  git town sync --stack --non-interactive --push --no-auto-resolve >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "planted semantic conflict was accepted"
  [[ -n "$(git diff --name-only --diff-filter=U)" ]] || fail "conflict run left no inspectable unmerged path"
)

printf 'SELFTEST GREEN: Git Town green-path and conflict controls\n'
