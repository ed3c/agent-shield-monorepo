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

for script in "$SCRIPT_DIR"/*.sh; do
  bash -n "$script" || fail "Bash syntax failed: $script"
done

grep -Eq '^feature-strategy = "rebase"$' "$ROOT/.git-town.toml" || fail "feature rebase policy absent"
grep -Eq '^perennial-strategy = "ff-only"$' "$ROOT/.git-town.toml" || fail "perennial ff-only policy absent"
grep -Eq '^push-hook = true$' "$ROOT/.git-town.toml" || fail "push-hook policy absent"
grep -Fq 'git town sync --stack --non-interactive --push --no-auto-resolve' "$SCRIPT_DIR/../../docs/git/STACKED_PRS.md" || fail "canonical sync subject absent"
grep -Fq -- '--no-auto-resolve' "$SCRIPT_DIR/sync-stack.sh" || fail "sync wrapper allows auto resolution"

for forbidden in 'git town continue' 'git town skip' 'git town ship'; do
  if grep -R --include='*.sh' -F "$forbidden" "$SCRIPT_DIR" | grep -v 'selftest.sh' >/dev/null; then
    fail "unattended script contains forbidden recovery/ship command: $forbidden"
  fi
done

mutation="$(mktemp "${TMPDIR:-/tmp}/git-town-sync-mutation.XXXXXX")"
trap 'rm -f "$mutation"' EXIT
sed 's/--no-auto-resolve/--auto-resolve/' "$SCRIPT_DIR/sync-stack.sh" > "$mutation"
if grep -Fq -- '--no-auto-resolve' "$mutation"; then
  fail "mutation control did not remove fail-closed flag"
fi
if ! grep -Fq -- '--auto-resolve' "$mutation"; then
  fail "mutation fixture was not planted"
fi

lease_root="$(mktemp -d "${TMPDIR:-/tmp}/git-town-lease.XXXXXX")"
mkdir "$lease_root/branch.lock" || fail "initial lease failed"
if mkdir "$lease_root/branch.lock" 2>/dev/null; then
  fail "duplicate branch lease was accepted"
fi
rm -rf "$lease_root"

if [[ "$mode" == "static" ]]; then
  printf 'SELFTEST GREEN: static Git Town governance controls\n'
  exit 0
fi

command -v git-town >/dev/null 2>&1 || fail "integration mode requires git-town"
base="$(mktemp -d "${TMPDIR:-/tmp}/git-town-integration.XXXXXX")"
trap 'rm -rf "$base" "$mutation"' EXIT
remote="$base/remote.git"
repo="$base/repo"
git init --bare -q "$remote"
git init -q -b main "$repo"
git -C "$repo" config user.name 'Git Town selftest'
git -C "$repo" config user.email 'git-town-selftest@example.invalid'
printf 'base\n' > "$repo/subject.txt"
cp "$ROOT/.git-town.toml" "$repo/.git-town.toml"
git -C "$repo" add subject.txt .git-town.toml
git -C "$repo" commit -q -m base
git -C "$repo" remote add origin "$remote"
git -C "$repo" push -q -u origin main

(
  cd "$repo"
  git town hack docs/fixture-parent --non-interactive --no-auto-resolve --no-stash
  printf 'parent-v1\n' > subject.txt
  git add subject.txt
  git commit -q -m parent-v1
  git town sync --stack --non-interactive --push --no-auto-resolve
  git town append docs/fixture-child --non-interactive --push --no-auto-resolve --no-stash
  printf 'child\n' > subject.txt
  git add subject.txt
  git commit -q -m child
  git switch -q docs/fixture-parent
  printf 'parent-v2\n' > subject.txt
  git add subject.txt
  git commit -q -m parent-v2
  git push -q origin docs/fixture-parent
  git switch -q docs/fixture-child
  set +e
  git town sync --stack --non-interactive --push --no-auto-resolve >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "planted semantic conflict was accepted"
  [[ -n "$(git diff --name-only --diff-filter=U)" ]] || fail "conflict run left no inspectable unmerged path"
)

printf 'SELFTEST GREEN: Git Town green-path and conflict controls\n'
