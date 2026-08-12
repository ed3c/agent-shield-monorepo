#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)"

fail() {
  printf 'INTEGRATION RED: %s\n' "$*" >&2
  exit 2
}

command -v git-town >/dev/null 2>&1 || fail "git-town is absent"
actual="$(git-town --version | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
[[ "$actual" == "24.0.0" ]] || fail "expected Git Town 24.0.0, observed ${actual:-unknown}"

base="$(mktemp -d "${TMPDIR:-/tmp}/git-town-wrapper-integration.XXXXXX")"
cleanup() {
  if [[ "${KEEP_INTEGRATION_TMP:-0}" == "1" ]]; then
    printf 'INTEGRATION FIXTURE RETAINED: %s\n' "$base" >&2
    return
  fi
  rm -rf "$base"
}
trap cleanup EXIT

fixture_setup() {
  local name="$1"
  FIXTURE="$base/$name"
  REPO="$FIXTURE/repo"
  REMOTE="$FIXTURE/remote.git"
  mkdir -p "$FIXTURE"
  git init --bare -q "$REMOTE"
  git init -q -b main "$REPO"
  git -C "$REPO" config user.name 'Git Town wrapper integration'
  git -C "$REPO" config user.email 'git-town-wrapper-integration@example.invalid'
  mkdir -p "$REPO/scripts/git-town" "$REPO/third_party/git-town" "$REPO/docs/git" "$REPO/fixture"
  cp "$ROOT/.git-town.toml" "$REPO/.git-town.toml"
  cp "$ROOT/third_party/git-town/LICENSE" "$REPO/third_party/git-town/LICENSE"
  cp "$ROOT/scripts/git-town/"*.sh "$REPO/scripts/git-town/"
  cp "$ROOT/docs/git/STACKED_PRS.md" "$REPO/docs/git/STACKED_PRS.md"
  printf 'base\n' > "$REPO/fixture/base.txt"
  git -C "$REPO" add .
  git -C "$REPO" commit -q -m 'fixture base'
  git -C "$REPO" remote add origin "$REMOTE"
  git -C "$REPO" push -q -u origin main
}

create_worker() {
  local branch="$1" parent="$2" path="$3" worker="$4" evals="$5"
  (
    cd "$REPO"
    PATH="$PATH" bash scripts/git-town/worktree.sh \
      --branch "$branch" \
      --parent "$parent" \
      --worktree "$path" \
      --issue 31 \
      --evals "$evals" \
      --allowed-paths 'fixture/**' \
      --worker "$worker" >/dev/null
  )
  git -C "$path" config user.name 'Git Town wrapper integration'
  git -C "$path" config user.email 'git-town-wrapper-integration@example.invalid'
}

commit_fixture() {
  local worktree="$1" path="$2" content="$3" message="$4"
  mkdir -p "$worktree/$(dirname -- "$path")"
  printf '%s\n' "$content" > "$worktree/$path"
  git -C "$worktree" add "$path"
  git -C "$worktree" commit -q -m "$message"
}

SYNC_OUTPUT=""
SYNC_RC=0
SYNC_RECEIPT=""
run_sync() {
  local worktree="$1" mode="$2"
  local args=()
  case "$mode" in
    dry-run) args+=(--dry-run) ;;
    local) ;;
    publish) args+=(--publish) ;;
    *) fail "unknown sync mode: $mode" ;;
  esac
  set +e
  SYNC_OUTPUT="$(cd "$worktree" && ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh "${args[@]}" 2>&1)"
  SYNC_RC=$?
  set -e
  SYNC_RECEIPT="$(printf '%s\n' "$SYNC_OUTPUT" | sed -nE 's/.*receipt=([^ ]+).*/\1/p' | tail -n 1)"
}

assert_receipt() {
  local path="$1" state="$2" push_state="$3"
  [[ -f "$path" ]] || fail "receipt is absent: $path"
  grep -Fq "\"state\": \"$state\"" "$path" || fail "receipt state is not $state: $path"
  grep -Fq "\"push_state\": \"$push_state\"" "$path" || fail "receipt push state is not $push_state: $path"
  grep -Fq '"cleanup": "PASS"' "$path" || fail "receipt cleanup is not PASS: $path"
}

test_green_and_stale_remote() {
  fixture_setup green
  local parent="$FIXTURE/parent" child="$FIXTURE/child" attacker="$FIXTURE/attacker"
  local parent_branch='fix/31-green-parent' child_branch='fix/31-green-child'

  create_worker "$parent_branch" main "$parent" worker-green-parent GT-LIVE-002
  commit_fixture "$parent" fixture/parent.txt parent-v1 parent-v1
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "parent publication failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS PASS

  create_worker "$child_branch" "$parent_branch" "$child" worker-green-child GT-LIVE-002
  commit_fixture "$child" fixture/child.txt child-v1 child-v1
  run_sync "$child" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "child publication failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS PASS

  commit_fixture "$parent" fixture/parent-v2.txt parent-v2 parent-v2
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "parent update publication failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS PASS

  local before after
  before="$(git -C "$child" rev-parse HEAD)"
  run_sync "$child" local
  [[ "$SYNC_RC" -eq 0 ]] || fail "child local rebase failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS NOT_EXERCISED
  after="$(git -C "$child" rev-parse HEAD)"
  [[ "$before" != "$after" ]] || fail "child SHA did not change after parent-first rebase"
  git -C "$child" merge-base --is-ancestor "$parent_branch" HEAD || fail "rebased child does not contain parent"
  run_sync "$child" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "rebased child publication failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS PASS
  [[ "$(git --git-dir="$REMOTE" rev-parse "refs/heads/$child_branch")" == "$(git -C "$child" rev-parse HEAD)" ]] || fail "remote child differs after safe publication"

  git clone -q "$REMOTE" "$attacker"
  git -C "$attacker" config user.name 'Competing writer fixture'
  git -C "$attacker" config user.email 'competing-writer@example.invalid'
  git -C "$attacker" checkout -q -b "$child_branch" "origin/$child_branch"
  commit_fixture "$child" fixture/local-race.txt local-race local-race

  local hook="$REPO/.git/hooks/pre-push" sentinel="$FIXTURE/race-injected" competitor_sha="$FIXTURE/competitor.sha"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\n'
    printf 'sentinel=%q\n' "$sentinel"
    printf 'attacker=%q\n' "$attacker"
    printf 'branch=%q\n' "$child_branch"
    printf 'competitor_sha=%q\n' "$competitor_sha"
    printf 'if [[ ! -e "$sentinel" ]]; then\n'
    printf '  : > "$sentinel"\n'
    printf '  git -C "$attacker" fetch -q origin "$branch"\n'
    printf '  git -C "$attacker" reset -q --hard "origin/$branch"\n'
    printf '  printf "remote-race\\n" > "$attacker/fixture/remote-race.txt"\n'
    printf '  git -C "$attacker" add fixture/remote-race.txt\n'
    printf '  git -C "$attacker" commit -q -m remote-race\n'
    printf '  git -C "$attacker" push -q origin "HEAD:refs/heads/$branch"\n'
    printf '  git -C "$attacker" rev-parse HEAD > "$competitor_sha"\n'
    printf 'fi\n'
  } > "$hook"
  chmod +x "$hook"

  run_sync "$child" publish
  [[ "$SYNC_RC" -eq 2 ]] || fail "stale-remote publication did not fail closed: rc=$SYNC_RC output=$SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" FAIL FAIL
  [[ -f "$(git -C "$child" rev-parse --path-format=absolute --git-path agent-shield-BLOCKED)" ]] || fail "stale-remote failure did not block worktree"
  [[ -s "$competitor_sha" ]] || fail "competing writer did not emit its immutable SHA sentinel"
  local remote_head competitor_head child_head
  remote_head="$(git --git-dir="$REMOTE" rev-parse "refs/heads/$child_branch")"
  competitor_head="$(cat "$competitor_sha")"
  child_head="$(git -C "$child" rev-parse HEAD)"
  [[ "$remote_head" == "$competitor_head" ]] || fail "competing remote commit was not preserved: remote=$remote_head competitor=$competitor_head child=$child_head output=$SYNC_OUTPUT"
  [[ "$remote_head" != "$child_head" ]] || fail "stale writer overwrote competing remote commit: remote=$remote_head competitor=$competitor_head child=$child_head output=$SYNC_OUTPUT"
  printf 'GT-LIVE-002 PASS green parent-first rebase, publication receipts, and stale-remote refusal\n'
}

test_independent_workers_and_lease() {
  fixture_setup lease
  local left="$FIXTURE/left" right="$FIXTURE/right"
  create_worker fix/31-left main "$left" worker-left GT-LIVE-003
  create_worker fix/31-right main "$right" worker-right GT-LIVE-003

  (commit_fixture "$left" fixture/left.txt left left) &
  local left_pid=$!
  (commit_fixture "$right" fixture/right.txt right right) &
  local right_pid=$!
  wait "$left_pid"
  wait "$right_pid"

  local lease="$REPO/.git/agent-shield/leases/repository-sync.lock"
  mkdir -p "$lease"
  printf 'held-by-negative-control\n' > "$lease/worker"
  set +e
  local lease_output
  lease_output="$(cd "$left" && bash scripts/git-town/sync-stack.sh --dry-run 2>&1)"
  local lease_rc=$?
  set -e
  [[ "$lease_rc" -eq 64 ]] || fail "duplicate lease did not exit 64: $lease_output"
  printf '%s\n' "$lease_output" | grep -Fq 'repository-sync.lock' || fail "duplicate lease refusal was not named"
  rm -rf "$lease"

  run_sync "$left" local
  [[ "$SYNC_RC" -eq 0 ]] || fail "left worker sync failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS NOT_EXERCISED
  run_sync "$right" local
  [[ "$SYNC_RC" -eq 0 ]] || fail "right worker sync failed: $SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" PASS NOT_EXERCISED
  [[ -f "$left/fixture/left.txt" && -f "$right/fixture/right.txt" ]] || fail "independent worker content was corrupted"
  [[ ! -d "$REPO/.git/agent-shield/leases/repository-sync.lock" ]] || fail "repository lease residue remains"
  printf 'GT-LIVE-003 PASS independent worktrees and named repository lease serialization\n'
}

test_conflict_fail_closed() {
  fixture_setup conflict
  local parent="$FIXTURE/parent" child="$FIXTURE/child"
  local parent_branch='fix/31-conflict-parent' child_branch='fix/31-conflict-child'
  create_worker "$parent_branch" main "$parent" worker-conflict-parent GT-LIVE-004
  commit_fixture "$parent" fixture/seed.txt seed seed
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "conflict parent initial publication failed: $SYNC_OUTPUT"
  create_worker "$child_branch" "$parent_branch" "$child" worker-conflict-child GT-LIVE-004
  commit_fixture "$child" fixture/conflict.txt child child-conflict
  commit_fixture "$parent" fixture/conflict.txt parent parent-conflict
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "conflict parent update failed: $SYNC_OUTPUT"

  run_sync "$child" local
  [[ "$SYNC_RC" -eq 2 ]] || fail "semantic conflict did not fail closed: rc=$SYNC_RC output=$SYNC_OUTPUT"
  assert_receipt "$SYNC_RECEIPT" FAIL FAIL
  grep -Fq '"unmerged_paths": "fixture/conflict.txt"' "$SYNC_RECEIPT" || fail "conflict receipt lacks exact unmerged path"
  [[ -n "$(git -C "$child" diff --name-only --diff-filter=U)" ]] || fail "conflict left no inspectable unmerged path"
  [[ -f "$(git -C "$child" rev-parse --path-format=absolute --git-path agent-shield-BLOCKED)" ]] || fail "conflict did not mark worktree blocked"
  [[ -d "$(git -C "$child" rev-parse --path-format=absolute --git-path rebase-merge)" || -d "$(git -C "$child" rev-parse --path-format=absolute --git-path rebase-apply)" ]] || fail "suspended rebase state was not preserved"
  printf 'GT-LIVE-004 PASS semantic conflict preserved suspended state, receipt, and blocker\n'
}

wait_for_receipt() {
  local receipt_dir="$1" pattern="$2"
  local _
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    BACKGROUND_RECEIPT="$(find "$receipt_dir" -maxdepth 1 -type f -name "$pattern" -print | head -n 1 || true)"
    [[ -z "$BACKGROUND_RECEIPT" ]] || return 0
    sleep 1
  done
  return 1
}

test_background_lifecycle() {
  fixture_setup background
  local worker="$FIXTURE/worker" branch='fix/31-background'
  create_worker "$branch" main "$worker" worker-background GT-LIVE-005
  commit_fixture "$worker" fixture/background.txt background background

  local start_output status_output stop_output start_output_file="$FIXTURE/background-start.out"
  (cd "$worker" && bash scripts/git-town/background-sync.sh start --interval 30 > "$start_output_file")
  start_output="$(cat "$start_output_file")"
  printf '%s\n' "$start_output" | grep -Fq 'STARTED' || fail "background worker did not start"
  wait_for_receipt "$REPO/.git/agent-shield/receipts" 'sync-fix_31-background-*.json' || fail "background worker emitted no sync receipt"
  assert_receipt "$BACKGROUND_RECEIPT" PASS NOT_EXERCISED
  status_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh status)"
  printf '%s\n' "$status_output" | grep -Fq 'RUNNING' || fail "background status is not RUNNING"
  stop_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh stop)"
  printf '%s\n' "$stop_output" | grep -Fq 'STOPPED' || fail "background worker did not stop"
  set +e
  status_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh status 2>&1)"
  local stopped_rc=$?
  set -e
  [[ "$stopped_rc" -eq 2 ]] || fail "stopped background status did not exit 2"
  printf '%s\n' "$status_output" | grep -Fq 'STOPPED' || fail "stopped background status is ambiguous"

  printf 'dirty\n' > "$worker/fixture/dirty.txt"
  set +e
  local dirty_output
  dirty_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh start --interval 30 2>&1)"
  local dirty_rc=$?
  set -e
  [[ "$dirty_rc" -eq 64 ]] || fail "dirty background start did not exit 64"
  printf '%s\n' "$dirty_output" | grep -Fq 'worktree is dirty' || fail "dirty refusal was not diagnostic"
  rm -f "$worker/fixture/dirty.txt"

  local task_file="$REPO/.git/agent-shield/tasks/fix_31-background.env"
  mv "$task_file" "$task_file.missing"
  set +e
  local absent_output
  absent_output="$(cd "$worker" && unset WORKER_ID ISSUE_NUMBER TASK_BRANCH TASK_PARENT TASK_EVALS TASK_ALLOWED_PATHS; bash scripts/git-town/background-sync.sh status 2>&1)"
  local absent_rc=$?
  set -e
  mv "$task_file.missing" "$task_file"
  [[ "$absent_rc" -eq 64 ]] || fail "missing task packet did not exit 64"
  printf '%s\n' "$absent_output" | grep -Fq 'task packet is absent' || fail "missing packet refusal was not diagnostic"

  fixture_setup timeout
  worker="$FIXTURE/worker"
  branch='fix/31-timeout'
  create_worker "$branch" main "$worker" worker-timeout GT-LIVE-005
  local fake_bin="$FIXTURE/fake-bin"
  mkdir -p "$fake_bin"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'if [[ "${1:-}" == "--version" ]]; then printf "Git Town 24.0.0\\n"; exit 0; fi\n'
    printf 'if [[ "${1:-}" == "config" && "${2:-}" == "get-parent" ]]; then printf "main\\n"; exit 0; fi\n'
    printf 'if [[ "${1:-}" == "sync" ]]; then sleep 5; exit 0; fi\n'
    printf 'exit 64\n'
  } > "$fake_bin/git-town"
  chmod +x "$fake_bin/git-town"
  start_output_file="$FIXTURE/background-start.out"
  (cd "$worker" && PATH="$fake_bin:$PATH" GIT_TOWN_SYNC_TIMEOUT_SECONDS=0 bash scripts/git-town/background-sync.sh start --interval 30 > "$start_output_file")
  start_output="$(cat "$start_output_file")"
  printf '%s\n' "$start_output" | grep -Fq 'STARTED' || fail "timeout background worker did not start"
  wait_for_receipt "$REPO/.git/agent-shield/receipts" 'sync-fix_31-timeout-*.json' || fail "timeout worker emitted no failure receipt"
  grep -Fq '"state": "FAIL"' "$BACKGROUND_RECEIPT" || fail "timeout receipt is not FAIL"
  grep -Fq '"timed_out": true' "$BACKGROUND_RECEIPT" || fail "timeout receipt lacks timed_out=true"
  grep -Fq '"exit": 124' "$BACKGROUND_RECEIPT" || fail "timeout receipt exit is not 124"
  local pid_file="$REPO/.git/agent-shield/background/fix_31-timeout.pid"
  local _
  for _ in 1 2 3 4 5; do
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null || { sleep 1; continue; }
    break
  done
  (cd "$worker" && PATH="$fake_bin:$PATH" bash scripts/git-town/background-sync.sh stop) >/dev/null
  [[ ! -f "$pid_file" ]] || fail "background PID residue remains after stop"
  [[ ! -d "$REPO/.git/agent-shield/leases/repository-sync.lock" ]] || fail "background timeout left lease residue"
  printf 'GT-LIVE-005 PASS repeat/stop, dirty/missing-packet, timeout, and cleanup controls\n'
}

test_portability_boundary() {
  bash -n "$SCRIPT_DIR/"*.sh || fail "Bash syntax portability check failed"
  command -v git >/dev/null 2>&1 || fail "git is absent on admitted macOS host"
  command -v shasum >/dev/null 2>&1 || fail "shasum is absent on admitted macOS host"
  [[ "$(uname -s)" == Darwin ]] || fail "this admitted artifact canary expected macOS"
  printf 'GT-LIVE-006 ABSENT Linux artifact/environment was not admitted; macOS public receipt behavior exercised\n'
}

test_green_and_stale_remote
test_independent_workers_and_lease
test_conflict_fail_closed
test_background_lifecycle
test_portability_boundary
printf 'INTEGRATION GREEN: public Git Town wrappers exercised on admitted macOS artifact\n'
