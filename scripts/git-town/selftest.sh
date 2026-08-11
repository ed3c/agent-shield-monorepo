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

for script in "$SCRIPT_DIR"/*.sh; do
  bash -n "$script" || fail "Bash syntax failed: $script"
done

grep -Eq '^interactive = false$' "$ROOT/.git-town.toml" || fail "non-interactive policy absent"
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
[[ "$(sha256_file "$license")" == "7bc26795871e4f7f5b89aaa68cd0318283530abaf0e0b4f72a0ce88fa7d0ff7d" ]] || fail "Git Town license digest mismatch"
grep -Fq '24.0.0' "$SCRIPT_DIR/common.sh" || fail "exact Git Town version pin absent"
if grep -Fq '24.0}' "$SCRIPT_DIR/common.sh"; then
  fail "loose Git Town version line remains"
fi

grep -Fq 'git town sync --stack --non-interactive --push --no-auto-resolve' "$ROOT/docs/git/STACKED_PRS.md" || fail "canonical publish subject absent"
grep -Fq -- '--no-auto-resolve' "$SCRIPT_DIR/sync-stack.sh" || fail "sync wrapper allows auto resolution"
grep -Fq -- '--no-push' "$SCRIPT_DIR/sync-stack.sh" || fail "local no-push mode absent"
grep -Fq 'ALLOW_GIT_TOWN_PUSH' "$SCRIPT_DIR/sync-stack.sh" || fail "publish guard absent"
grep -Fq 'sync-stack.sh' "$SCRIPT_DIR/background-sync.sh" || fail "background worker does not delegate to canonical wrapper"
if grep -Fq 'git town sync' "$SCRIPT_DIR/background-sync.sh"; then
  fail "background worker contains a second sync implementation"
fi

for forbidden in 'git town continue' 'git town skip' 'git town undo' 'git town ship'; do
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
grep -Fq -- '--auto-resolve' "$mutation" || fail "mutation fixture was not planted"

lease_root="$(mktemp -d "${TMPDIR:-/tmp}/git-town-lease.XXXXXX")"
mkdir "$lease_root/repository-sync.lock" || fail "initial lease failed"
if mkdir "$lease_root/repository-sync.lock" 2>/dev/null; then
  fail "duplicate repository sync lease was accepted"
fi
rm -rf "$lease_root"

if [[ "$mode" == "static" ]]; then
  printf 'SELFTEST GREEN: static Git Town governance controls\n'
  exit 0
fi

command -v git-town >/dev/null 2>&1 || fail "integration mode requires git-town 24.0.0"
actual="$(git-town --version | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
[[ "$actual" == "24.0.0" ]] || fail "integration mode requires Git Town 24.0.0, observed ${actual:-unknown}"

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
  export GIT_TOWN_INTERACTIVE=false
  export GIT_TOWN_AUTO_RESOLVE=false
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
