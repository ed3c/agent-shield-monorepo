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
SYNC_MODE=""
SYNC_BRANCH=""
SYNC_PARENT=""
SYNC_WORKER=""
SYNC_EVALS=""
SYNC_BEFORE=""
SYNC_AFTER=""
run_sync() {
  local worktree="$1" mode="$2"
  local args=()
  case "$mode" in
    dry-run) args+=(--dry-run) ;;
    local) ;;
    publish) args+=(--publish) ;;
    *) fail "unknown sync mode: $mode" ;;
  esac
  SYNC_MODE="$mode"
  SYNC_BRANCH="$(git -C "$worktree" symbolic-ref --quiet --short HEAD)"
  SYNC_BEFORE="$(git -C "$worktree" rev-parse HEAD)"
  local safe_branch task_file packet_parent
  safe_branch="$(printf '%s' "$SYNC_BRANCH" | tr '/:@ ' '____' | tr -cd '[:alnum:]_.-')"
  task_file="$(git -C "$worktree" rev-parse --path-format=absolute --git-common-dir)/agent-shield/tasks/$safe_branch.env"
  SYNC_WORKER="$(bash -c 'source "$1"; printf "%s" "$WORKER_ID"' _ "$task_file")"
  SYNC_EVALS="$(bash -c 'source "$1"; printf "%s" "$TASK_EVALS"' _ "$task_file")"
  packet_parent="$(bash -c 'source "$1"; printf "%s" "$TASK_PARENT"' _ "$task_file")"
  SYNC_PARENT="$(cd "$worktree" && git town config get-parent "$SYNC_BRANCH")"
  [[ "$SYNC_PARENT" == "$packet_parent" ]] || fail "Git Town parent $SYNC_PARENT differs from task parent $packet_parent"
  set +e
  SYNC_OUTPUT="$(cd "$worktree" && ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh "${args[@]}" 2>&1)"
  SYNC_RC=$?
  set -e
  SYNC_AFTER="$(git -C "$worktree" rev-parse HEAD)"
  SYNC_RECEIPT="$(printf '%s\n' "$SYNC_OUTPUT" | sed -nE 's/.*receipt=([^ ]+).*/\1/p' | tail -n 1)"
}

assert_receipt() {
  local path="$1" state="$2" push_state="$3" mode="$4" worker="$5" branch="$6" parent="$7"
  local evals="$8" before="$9" after="${10}" expected_exit="${11}" timed_out="${12}"
  [[ -f "$path" ]] || fail "receipt is absent: $path"
  grep -Fq '"schema": "agent-shield/git-town-sync-receipt/v1"' "$path" || fail "receipt schema is invalid: $path"
  grep -Fq "\"state\": \"$state\"" "$path" || fail "receipt state is not $state: $path"
  grep -Fq "\"push_state\": \"$push_state\"" "$path" || fail "receipt push state is not $push_state: $path"
  grep -Fq "\"worker\": \"$worker\"" "$path" || fail "receipt worker is not $worker: $path"
  grep -Fq '"issue": 31' "$path" || fail "receipt issue is not 31: $path"
  grep -Fq "\"branch\": \"$branch\"" "$path" || fail "receipt branch is not $branch: $path"
  grep -Fq "\"parent\": \"$parent\"" "$path" || fail "receipt parent is not $parent: $path"
  grep -Fq '"git_town_version": "24.0.0"' "$path" || fail "receipt Git Town version is not 24.0.0: $path"
  local command_suffix publish
  case "$mode" in
    local) command_suffix='--no-push'; publish=false ;;
    publish) command_suffix='--push'; publish=true ;;
    *) fail "unsupported receipt mode: $mode" ;;
  esac
  grep -Fq "\"command\": \"git town sync --stack --non-interactive --no-auto-resolve --verbose $command_suffix\"" "$path" || fail "receipt command differs from $mode contract: $path"
  grep -Fq "\"before\": \"$before\"" "$path" || fail "receipt before SHA differs: $path"
  grep -Fq "\"after\": \"$after\"" "$path" || fail "receipt after SHA differs: $path"
  grep -Fq '"dry_run": false' "$path" || fail "receipt unexpectedly claims dry-run: $path"
  grep -Fq "\"publish\": $publish" "$path" || fail "receipt publish mode differs: $path"
  grep -Fq "\"timed_out\": $timed_out" "$path" || fail "receipt timeout state differs: $path"
  grep -Fq "\"exit\": $expected_exit" "$path" || fail "receipt exit differs from $expected_exit: $path"
  grep -Fq '"unmerged_paths": ' "$path" || fail "receipt lacks unmerged-path state: $path"
  grep -Fq "\"evals\": \"$evals\"" "$path" || fail "receipt evals differ: $path"
  grep -Fq '"allowed_paths": "fixture/**"' "$path" || fail "receipt path lease differs: $path"
  grep -Eq '"log_sha256": "[0-9a-f]{64}"' "$path" || fail "receipt log digest is invalid: $path"
  grep -Fq '"log_limit_bytes": 1048576' "$path" || fail "receipt log limit differs: $path"
  grep -Fq '"cleanup": "PASS"' "$path" || fail "receipt cleanup is not PASS: $path"
  grep -Eq '"started_at": "[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$path" || fail "receipt start time is invalid: $path"
  grep -Eq '"finished_at": "[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$path" || fail "receipt finish time is invalid: $path"
  grep -Fq '"note": ' "$path" || fail "receipt note is absent: $path"

  local receipt_name log_path expected_log_digest actual_log_digest
  receipt_name="$(basename -- "$path" .json)"
  log_path="$(dirname -- "$path")/../logs/$receipt_name.log"
  [[ -f "$log_path" ]] || fail "receipt log is absent: $log_path"
  expected_log_digest="$(sed -nE 's/.*"log_sha256": "([0-9a-f]{64})".*/\1/p' "$path")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_log_digest="$(sha256sum "$log_path" | awk '{print $1}')"
  else
    actual_log_digest="$(shasum -a 256 "$log_path" | awk '{print $1}')"
  fi
  [[ "$actual_log_digest" == "$expected_log_digest" ]] || fail "receipt log digest does not bind log bytes: $path"
}

assert_last_sync_receipt() {
  local state="$1" push_state="$2" expected_exit="$3" timed_out="$4"
  assert_receipt "$SYNC_RECEIPT" "$state" "$push_state" "$SYNC_MODE" "$SYNC_WORKER" "$SYNC_BRANCH" \
    "$SYNC_PARENT" "$SYNC_EVALS" "$SYNC_BEFORE" "$SYNC_AFTER" "$expected_exit" "$timed_out"
}

test_green_and_stale_remote() {
  fixture_setup green
  local parent="$FIXTURE/parent" child="$FIXTURE/child" attacker="$FIXTURE/attacker"
  local parent_branch='fix/31-green-parent' child_branch='fix/31-green-child'

  create_worker "$parent_branch" main "$parent" worker-green-parent GT-LIVE-002
  commit_fixture "$parent" fixture/parent.txt parent-v1 parent-v1
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "parent publication failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false
  local receipt_original="$FIXTURE/receipt-before-original.json"
  cp "$SYNC_RECEIPT" "$receipt_original"
  sed -E 's/"before": "[0-9a-f]{40}"/"before": "0000000000000000000000000000000000000000"/' "$receipt_original" > "$SYNC_RECEIPT"
  if (assert_last_sync_receipt PASS PASS 0 false) >/dev/null 2>&1; then
    fail "receipt assertion accepted a mutated before SHA"
  fi
  cp "$receipt_original" "$SYNC_RECEIPT"

  create_worker "$child_branch" "$parent_branch" "$child" worker-green-child GT-LIVE-002
  commit_fixture "$child" fixture/child.txt child-v1 child-v1
  run_sync "$child" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "child publication failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false

  commit_fixture "$parent" fixture/parent-v2.txt parent-v2 parent-v2
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "parent update publication failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false

  local before after
  before="$(git -C "$child" rev-parse HEAD)"
  run_sync "$child" local
  [[ "$SYNC_RC" -eq 0 ]] || fail "child local rebase failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS NOT_EXERCISED 0 false
  after="$(git -C "$child" rev-parse HEAD)"
  [[ "$before" != "$after" ]] || fail "child SHA did not change after parent-first rebase"
  git -C "$child" merge-base --is-ancestor "$parent_branch" HEAD || fail "rebased child does not contain parent"
  run_sync "$child" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "rebased child publication failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false
  [[ "$(git --git-dir="$REMOTE" rev-parse "refs/heads/$child_branch")" == "$(git -C "$child" rev-parse HEAD)" ]] || fail "remote child differs after safe publication"

  local fake_gh_bin="$FIXTURE/fake-gh-bin" gh_capture="$FIXTURE/gh-create.args"
  local proposal_body="$FIXTURE/proposal.md" proposal_output proposal_receipt proposal_head proposal_body_digest
  mkdir -p "$fake_gh_bin"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'if [[ "${1:-}" == auth && "${2:-}" == status ]]; then exit 0; fi\n'
    printf 'if [[ "${1:-}" == pr && "${2:-}" == view ]]; then\n'
    printf '  if [[ "$*" == *"number,url,baseRefName,headRefName,isDraft"* ]]; then\n'
    printf '    printf "101\\thttps://example.invalid/pr/101\\t%%s\\t%%s\\tfalse\\n" "$GH_EXPECT_PARENT" "$GH_EXPECT_BRANCH"\n'
    printf '    exit 0\n'
    printf '  fi\n'
    printf '  exit 1\n'
    printf 'fi\n'
    printf 'if [[ "${1:-}" == pr && "${2:-}" == create ]]; then\n'
    printf '  printf "%%s\\n" "$@" > "$GH_CAPTURE"\n'
    printf '  printf "https://example.invalid/pr/101\\n"\n'
    printf '  exit 0\n'
    printf 'fi\n'
    printf 'exit 64\n'
  } > "$fake_gh_bin/gh"
  chmod +x "$fake_gh_bin/gh"
  {
    printf '## Issue and stack\nIssue #31; parent %s.\n' "$parent_branch"
    printf '## Evals\nGT-LIVE-002 and negative control.\n'
    printf '## Evidence boundary\nArtifact-backed local evidence.\n'
    printf '## Stacked-PR checks\nAllowed paths: fixture/**.\n'
    printf '## Merge/handoff\nHuman rollback and handoff required.\n'
  } > "$proposal_body"
  proposal_output="$(
    cd "$child"
    PATH="$fake_gh_bin:$PATH" GH_CAPTURE="$gh_capture" GH_EXPECT_PARENT="$parent_branch" \
      GH_EXPECT_BRANCH="$child_branch" bash scripts/git-town/propose.sh \
      --title 'GT-LIVE-002 proposal fixture' --body-file "$proposal_body" 2>&1
  )" || fail "proposal wrapper failed: $proposal_output"
  proposal_receipt="$(printf '%s\n' "$proposal_output" | sed -nE 's/.*receipt=([^ ]+).*/\1/p' | tail -n 1)"
  proposal_head="$(git -C "$child" rev-parse HEAD)"
  proposal_body_digest="$(shasum -a 256 "$proposal_body" | awk '{print $1}')"
  [[ -f "$proposal_receipt" ]] || fail "proposal receipt is absent: $proposal_output"
  [[ "$(awk '$0 == "--base" { getline; print; exit }' "$gh_capture")" == "$parent_branch" ]] || fail "proposal did not bind --base to the Git Town parent"
  [[ "$(awk '$0 == "--head" { getline; print; exit }' "$gh_capture")" == "$child_branch" ]] || fail "proposal did not bind --head to the task branch"
  grep -Fq '"schema": "agent-shield/git-town-proposal-receipt/v1"' "$proposal_receipt" || fail "proposal receipt schema is invalid"
  grep -Fq '"state": "PASS"' "$proposal_receipt" || fail "proposal receipt is not PASS"
  grep -Fq '"action": "created"' "$proposal_receipt" || fail "proposal receipt action differs"
  grep -Fq '"worker": "worker-green-child"' "$proposal_receipt" || fail "proposal receipt worker differs"
  grep -Fq '"issue": 31' "$proposal_receipt" || fail "proposal receipt issue differs"
  grep -Fq "\"branch\": \"$child_branch\"" "$proposal_receipt" || fail "proposal receipt branch differs"
  grep -Fq "\"parent\": \"$parent_branch\"" "$proposal_receipt" || fail "proposal receipt parent differs"
  grep -Fq "\"head\": \"$proposal_head\"" "$proposal_receipt" || fail "proposal receipt head differs"
  grep -Fq '"git_town_version": "24.0.0"' "$proposal_receipt" || fail "proposal receipt version differs"
  grep -Fq '"pr_number": 101' "$proposal_receipt" || fail "proposal receipt PR number differs"
  grep -Fq '"pr_url": "https://example.invalid/pr/101"' "$proposal_receipt" || fail "proposal receipt PR URL differs"
  grep -Fq '"draft": false' "$proposal_receipt" || fail "proposal receipt draft state differs"
  grep -Fq "\"body_sha256\": \"$proposal_body_digest\"" "$proposal_receipt" || fail "proposal receipt body digest differs"
  grep -Fq '"evals": "GT-LIVE-002"' "$proposal_receipt" || fail "proposal receipt eval differs"
  grep -Fq '"cleanup": "PASS"' "$proposal_receipt" || fail "proposal receipt cleanup differs"

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
  assert_last_sync_receipt FAIL FAIL 1 false
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

  local upload_pack="$FIXTURE/slow-upload-pack" sync_started="$FIXTURE/sync-started"
  local first_output_file="$FIXTURE/first-sync.out" first_rc_file="$FIXTURE/first-sync.rc"
  local real_git first_pid lease_output lease_rc first_output first_receipt left_head
  real_git="$(command -v git)"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'real_git=%q\n' "$real_git"
    printf 'sync_started=%q\n' "$sync_started"
    printf ': > "$sync_started"\n'
    printf '/bin/sleep 2\n'
    printf 'exec "$real_git" upload-pack "$@"\n'
  } > "$upload_pack"
  chmod +x "$upload_pack"
  git -C "$left" config remote.origin.uploadpack "$upload_pack"
  left_head="$(git -C "$left" rev-parse HEAD)"
  (
    set +e
    local_output="$(cd "$left" && bash scripts/git-town/sync-stack.sh 2>&1)"
    local_rc=$?
    printf '%s\n' "$local_output" > "$first_output_file"
    printf '%s\n' "$local_rc" > "$first_rc_file"
  ) &
  first_pid=$!
  local _
  for _ in 1 2 3 4 5; do
    [[ -f "$sync_started" ]] && break
    sleep 1
  done
  [[ -f "$sync_started" ]] || fail "first public sync never reached the admitted artifact's git fetch"
  set +e
  lease_output="$(cd "$right" && bash scripts/git-town/sync-stack.sh 2>&1)"
  lease_rc=$?
  set -e
  [[ "$lease_rc" -eq 64 ]] || fail "competing public sync did not exit 64: $lease_output"
  printf '%s\n' "$lease_output" | grep -Fq 'repository-sync.lock' || fail "competing public sync refusal was not named"
  wait "$first_pid"
  [[ "$(cat "$first_rc_file")" -eq 0 ]] || fail "first concurrent sync failed: $(cat "$first_output_file")"
  first_output="$(cat "$first_output_file")"
  first_receipt="$(printf '%s\n' "$first_output" | sed -nE 's/.*receipt=([^ ]+).*/\1/p' | tail -n 1)"
  assert_receipt "$first_receipt" PASS NOT_EXERCISED local worker-left fix/31-left main \
    GT-LIVE-003 "$left_head" "$left_head" 0 false
  run_sync "$right" local
  [[ "$SYNC_RC" -eq 0 ]] || fail "right worker sync failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS NOT_EXERCISED 0 false
  [[ -f "$left/fixture/left.txt" && -f "$right/fixture/right.txt" ]] || fail "independent worker content was corrupted"
  [[ ! -d "$REPO/.git/agent-shield/leases/repository-sync.lock" ]] || fail "repository lease residue remains"
  printf 'GT-LIVE-003 PASS independent worktrees and competing public sync serialization\n'
}

test_conflict_fail_closed() {
  fixture_setup conflict
  local parent="$FIXTURE/parent" child="$FIXTURE/child"
  local parent_branch='fix/31-conflict-parent' child_branch='fix/31-conflict-child'
  create_worker "$parent_branch" main "$parent" worker-conflict-parent GT-LIVE-004
  commit_fixture "$parent" fixture/seed.txt seed seed
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "conflict parent initial publication failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false
  create_worker "$child_branch" "$parent_branch" "$child" worker-conflict-child GT-LIVE-004
  commit_fixture "$child" fixture/conflict.txt child child-conflict
  commit_fixture "$parent" fixture/conflict.txt parent parent-conflict
  run_sync "$parent" publish
  [[ "$SYNC_RC" -eq 0 ]] || fail "conflict parent update failed: $SYNC_OUTPUT"
  assert_last_sync_receipt PASS PASS 0 false

  run_sync "$child" local
  [[ "$SYNC_RC" -eq 2 ]] || fail "semantic conflict did not fail closed: rc=$SYNC_RC output=$SYNC_OUTPUT"
  assert_last_sync_receipt FAIL FAIL 1 false
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

wait_for_receipt_count() {
  local receipt_dir="$1" pattern="$2" expected="$3"
  local _ count
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    count="$(find "$receipt_dir" -maxdepth 1 -type f -name "$pattern" | wc -l | tr -d ' ')"
    [[ "$count" -ge "$expected" ]] && return 0
    sleep 1
  done
  return 1
}

wait_for_live_pid_file() {
  local path="$1"
  local _ pid
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pid="$(awk '{print $1}' "$path" 2>/dev/null || true)"
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

test_background_lifecycle() {
  fixture_setup background
  local worker="$FIXTURE/worker" branch='fix/31-background'
  create_worker "$branch" main "$worker" worker-background GT-LIVE-005
  commit_fixture "$worker" fixture/background.txt background background

  local fast_sleep_bin="$FIXTURE/fast-sleep-bin" sleep_count="$FIXTURE/sleep-count"
  mkdir -p "$fast_sleep_bin"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'count_file=%q\n' "$sleep_count"
    printf 'if [[ "${1:-}" == "30" ]]; then\n'
    printf '  count="$(cat "$count_file" 2>/dev/null || printf 0)"\n'
    printf '  count=$((count + 1))\n'
    printf '  printf "%%s\\n" "$count" > "$count_file"\n'
    printf '  [[ "$count" -ne 1 ]] || exit 0\n'
    printf 'fi\n'
    printf 'exec /bin/sleep "$@"\n'
  } > "$fast_sleep_bin/sleep"
  chmod +x "$fast_sleep_bin/sleep"

  local start_output status_output stop_output start_output_file="$FIXTURE/background-start.out"
  local child_pid_file="$REPO/.git/agent-shield/background/fix_31-background.child.pid" child_pid
  local sensitive_canary='agent-shield-sensitive-residue-negative-control'
  (cd "$worker" && PATH="$fast_sleep_bin:$PATH" SENSITIVE_CANARY="$sensitive_canary" bash scripts/git-town/background-sync.sh start --interval 30 > "$start_output_file")
  start_output="$(cat "$start_output_file")"
  printf '%s\n' "$start_output" | grep -Fq 'STARTED' || fail "background worker did not start"
  wait_for_receipt_count "$REPO/.git/agent-shield/receipts" 'sync-fix_31-background-*.json' 2 || fail "background worker did not repeat bounded sync"
  local background_head
  background_head="$(git -C "$worker" rev-parse HEAD)"
  while IFS= read -r BACKGROUND_RECEIPT; do
    assert_receipt "$BACKGROUND_RECEIPT" PASS NOT_EXERCISED local worker-background "$branch" main \
      GT-LIVE-005 "$background_head" "$background_head" 0 false
  done < <(find "$REPO/.git/agent-shield/receipts" -maxdepth 1 -type f -name 'sync-fix_31-background-*.json' -print)
  wait_for_live_pid_file "$child_pid_file" || fail "background worker exposed no live child process state"
  child_pid="$(awk '{print $1}' "$child_pid_file")"
  status_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh status)"
  printf '%s\n' "$status_output" | grep -Fq 'RUNNING' || fail "background status is not RUNNING"
  stop_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh stop)"
  printf '%s\n' "$stop_output" | grep -Fq 'STOPPED' || fail "background worker did not stop"
  ! kill -0 "$child_pid" 2>/dev/null || fail "background stop left descendant process alive: $child_pid"
  [[ ! -f "$child_pid_file" ]] || fail "background stop left child PID state"
  set +e
  status_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh status 2>&1)"
  local stopped_rc=$?
  set -e
  [[ "$stopped_rc" -eq 2 ]] || fail "stopped background status did not exit 2"
  printf '%s\n' "$status_output" | grep -Fq 'STOPPED' || fail "stopped background status is ambiguous"
  if grep -R -Fq "$sensitive_canary" "$REPO/.git/agent-shield"; then
    fail "background state retained the synthetic sensitive canary"
  fi

  local unrelated_pid stale_identity_output stale_identity_rc
  /bin/sleep 30 &
  unrelated_pid=$!
  printf '%s %064d\n' "$unrelated_pid" 0 > "$child_pid_file"
  set +e
  stale_identity_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh stop 2>&1)"
  stale_identity_rc=$?
  set -e
  [[ "$stale_identity_rc" -eq 64 ]] || fail "stale child identity did not fail closed: $stale_identity_output"
  kill -0 "$unrelated_pid" 2>/dev/null || fail "stale child identity killed an unrelated process"
  [[ -f "$child_pid_file" ]] || fail "stale child identity state was erased before diagnosis"
  kill -TERM "$unrelated_pid"
  wait "$unrelated_pid" 2>/dev/null || true
  rm -f "$child_pid_file"

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

  local stale_lease="$REPO/.git/agent-shield/leases/repository-sync.lock" stale_lease_output
  mkdir -p "$stale_lease"
  printf 'stale-lease-negative-control\n' > "$stale_lease/worker"
  set +e
  stale_lease_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh start --interval 30 2>&1)"
  local stale_lease_rc=$?
  set -e
  if [[ "$stale_lease_rc" -eq 0 ]]; then
    (cd "$worker" && bash scripts/git-town/background-sync.sh stop) >/dev/null 2>&1 || true
  fi
  rm -rf "$stale_lease"
  [[ "$stale_lease_rc" -eq 64 ]] || fail "stale lease did not block background start: rc=$stale_lease_rc output=$stale_lease_output"
  printf '%s\n' "$stale_lease_output" | grep -Fq 'repository-sync.lock' || fail "stale lease refusal did not name the lock"

  fixture_setup unsafe
  worker="$FIXTURE/worker"
  branch='fix/31-unsafe-origin'
  create_worker "$branch" main "$worker" worker-unsafe-origin GT-LIVE-005
  local fixture_user='fixture-user' fixture_password='fixture-credential' unsafe_origin
  printf -v unsafe_origin '%s%s:%s@%s' 'https://' "$fixture_user" "$fixture_password" 'example.invalid/repo.git'
  git -C "$worker" remote set-url origin "$unsafe_origin"
  set +e
  local unsafe_output
  unsafe_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh start --interval 30 2>&1)"
  local unsafe_rc=$?
  set -e
  git -C "$worker" remote set-url origin "$REMOTE"
  [[ "$unsafe_rc" -eq 64 ]] || fail "unsafe origin did not block background start: rc=$unsafe_rc output=$unsafe_output"
  printf '%s\n' "$unsafe_output" | grep -Fq 'origin URL embeds credentials' || fail "unsafe origin refusal was not diagnostic: $unsafe_output"
  if grep -R -Fq "$fixture_password" "$REPO/.git/agent-shield"; then
    fail "unsafe-origin control retained synthetic credential material"
  fi

  fixture_setup killed
  worker="$FIXTURE/worker"
  branch='fix/31-killed-controller'
  create_worker "$branch" main "$worker" worker-killed-controller GT-LIVE-005
  commit_fixture "$worker" fixture/killed-controller.txt killed-controller killed-controller
  local killed_head
  killed_head="$(git -C "$worker" rev-parse HEAD)"
  local slow_upload_pack="$FIXTURE/slow-upload-pack" slow_git_state="$FIXTURE/slow-git.state" real_git
  real_git="$(command -v git)"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'real_git=%q\n' "$real_git"
    printf 'state_file=%q\n' "$slow_git_state"
    printf '/bin/sleep 30 &\n'
    printf 'delay_pid=$!\n'
    printf 'printf "%%s %%s\\n" "$$" "$delay_pid" > "$state_file"\n'
    printf 'wait "$delay_pid"\n'
    printf 'exec "$real_git" upload-pack "$@"\n'
  } > "$slow_upload_pack"
  chmod +x "$slow_upload_pack"
  git -C "$worker" config remote.origin.uploadpack "$slow_upload_pack"
  start_output_file="$FIXTURE/background-start.out"
  (cd "$worker" && bash scripts/git-town/background-sync.sh start --interval 30 > "$start_output_file")
  local killed_pid_file="$REPO/.git/agent-shield/background/fix_31-killed-controller.pid"
  local killed_child_file="$REPO/.git/agent-shield/background/fix_31-killed-controller.child.pid"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [[ -s "$slow_git_state" ]] && break
    sleep 1
  done
  [[ -s "$slow_git_state" ]] || fail "killed-controller fixture never reached the admitted artifact's git fetch"
  wait_for_live_pid_file "$killed_child_file" || fail "killed-controller fixture exposed no live child"
  local killed_pid killed_child slow_git_pid slow_delay_pid
  killed_pid="$(awk '{print $1}' "$killed_pid_file")"
  killed_child="$(awk '{print $1}' "$killed_child_file")"
  read -r slow_git_pid slow_delay_pid < "$slow_git_state"
  kill -KILL "$killed_pid"
  for _ in 1 2 3 4 5; do
    kill -0 "$killed_pid" 2>/dev/null || break
    sleep 1
  done
  set +e
  status_output="$(cd "$worker" && bash scripts/git-town/background-sync.sh status 2>&1)"
  local killed_status_rc=$?
  set -e
  [[ "$killed_status_rc" -eq 2 ]] || fail "killed controller was not reported STOPPED"
  printf '%s\n' "$status_output" | grep -Fq 'STOPPED' || fail "killed controller red state was ambiguous"
  kill -0 "$killed_child" 2>/dev/null || fail "killed-controller fixture did not preserve an orphan for cleanup control"
  kill -0 "$slow_git_pid" 2>/dev/null || fail "killed-controller fixture exposed no live Git descendant"
  kill -0 "$slow_delay_pid" 2>/dev/null || fail "killed-controller fixture exposed no live delay descendant"
  (cd "$worker" && bash scripts/git-town/background-sync.sh stop) >/dev/null
  wait_for_receipt "$REPO/.git/agent-shield/receipts" 'sync-fix_31-killed-controller-*.json' || fail "killed-controller cleanup emitted no failure receipt"
  assert_receipt "$BACKGROUND_RECEIPT" FAIL FAIL local worker-killed-controller "$branch" main \
    GT-LIVE-005 "$killed_head" "$killed_head" 143 false
  ! kill -0 "$killed_child" 2>/dev/null || fail "stop did not clean the killed controller's orphan child"
  ! kill -0 "$slow_git_pid" 2>/dev/null || fail "stop did not clean the orphaned Git descendant"
  ! kill -0 "$slow_delay_pid" 2>/dev/null || fail "stop did not clean the orphaned delay descendant"
  [[ ! -f "$killed_pid_file" && ! -f "$killed_child_file" ]] || fail "killed-controller PID state remains after cleanup"

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
  local timeout_head
  timeout_head="$(git -C "$worker" rev-parse HEAD)"
  assert_receipt "$BACKGROUND_RECEIPT" FAIL FAIL local worker-timeout "$branch" main \
    GT-LIVE-005 "$timeout_head" "$timeout_head" 124 true
  local timeout_receipt_count
  timeout_receipt_count="$(find "$REPO/.git/agent-shield/receipts" -maxdepth 1 -type f -name 'sync-fix_31-timeout-*.json' | wc -l | tr -d ' ')"
  sleep 1
  [[ "$(find "$REPO/.git/agent-shield/receipts" -maxdepth 1 -type f -name 'sync-fix_31-timeout-*.json' | wc -l | tr -d ' ')" == "$timeout_receipt_count" ]] || fail "background worker repeated after its first failure"
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
  local absent_output absent_rc
  set +e
  absent_output="$(PATH=/nonexistent /bin/bash -c 'source "$1"; sha256_file "$2"' _ \
    "$SCRIPT_DIR/common.sh" "$ROOT/third_party/git-town/LICENSE" 2>&1)"
  absent_rc=$?
  set -e
  [[ "$absent_rc" -eq 64 ]] || fail "unavailable SHA-256 commands did not exit 64: $absent_output"
  printf '%s\n' "$absent_output" | grep -Fq 'ABSENT:' || fail "unavailable SHA-256 commands were not classified ABSENT"
  printf 'GT-LIVE-006 ABSENT Linux artifact/environment was not admitted; macOS behavior and unavailable-command control exercised\n'
}

test_green_and_stale_remote
test_independent_workers_and_lease
test_conflict_fail_closed
test_background_lifecycle
test_portability_boundary
printf 'INTEGRATION GREEN: public Git Town wrappers exercised on admitted macOS artifact\n'
