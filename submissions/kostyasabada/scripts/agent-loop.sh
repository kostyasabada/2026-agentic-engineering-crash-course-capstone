#!/usr/bin/env bash
# Agent loop: runs the project's checks and hands failures to a fresh, non-interactive
# fixer agent until the checks pass or a stop condition is reached.
# Normative behavior: openspec/changes/add-realtime-chat-room/specs/agent-loop/spec.md;
# interface, invocation, log format, and fingerprint: design.md D7.
#
# The loop never commits, pushes, edits tasks.md, or writes review files, and a green
# loop is not acceptance: a separate checker still reviews the task.
#
# Requires bash, git, coreutils (timeout, sha256sum), setsid (util-linux), ps (procps), and iconv.
set -euo pipefail

readonly EX_USAGE=64

usage() {
  cat <<'EOF'
Usage: scripts/agent-loop.sh --task-id <id> --brief <file> [--agent claude|codex] [--max-iterations N] [--agent-timeout SECONDS]

  --task-id         required; matches ^[a-z0-9][a-z0-9-]*$; log: docs/evidence/<id>/loop-run.log
  --brief           required; task brief file (relative paths resolve from the current directory)
  --agent           fixer agent: claude (default, `claude -p`) or codex (`codex exec`)
  --max-iterations  maximum number of fixer runs, 1-10 (default 5)
  --agent-timeout   time limit per fixer run in seconds, 1-86400 (default 900)

Exit codes: 0 checks_passed, 1 max_iterations_reached, 2 agent_error, 3 no_progress,
64 usage error, 130 interrupted.
EOF
}

usage_error() {
  printf 'agent-loop: %s\n' "$1" >&2
  usage >&2
  exit "$EX_USAGE"
}

# ---------------------------------------------------------------------------
# Arguments (usage errors exit 64 before any check, agent, or log write)
# ---------------------------------------------------------------------------
task_id=''
brief=''
agent='claude'
max_iterations='5'
agent_timeout='900'
have_task_id=0
have_brief=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --task-id | --brief | --agent | --max-iterations | --agent-timeout)
      [ "$#" -ge 2 ] || usage_error "option $1 requires a value"
      case "$1" in
        --task-id) task_id=$2 have_task_id=1 ;;
        --brief) brief=$2 have_brief=1 ;;
        --agent) agent=$2 ;;
        --max-iterations) max_iterations=$2 ;;
        --agent-timeout) agent_timeout=$2 ;;
      esac
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage_error "unexpected argument: $1"
      ;;
  esac
done

[ "$have_task_id" -eq 1 ] || usage_error 'missing --task-id'
[[ $task_id =~ ^[a-z0-9][a-z0-9-]*$ ]] || usage_error "invalid task id: '$task_id' (expected ^[a-z0-9][a-z0-9-]*\$)"
[ "$have_brief" -eq 1 ] || usage_error 'missing --brief'
[ -n "$brief" ] && [ -f "$brief" ] && [ -r "$brief" ] || usage_error "brief file not found or not readable: '$brief'"
case "$agent" in
  claude | codex) ;;
  *) usage_error "unknown agent: '$agent' (expected claude or codex)" ;;
esac
[[ $max_iterations =~ ^[0-9]{1,3}$ ]] && ((10#$max_iterations >= 1 && 10#$max_iterations <= 10)) ||
  usage_error "invalid iteration limit: '$max_iterations' (expected an integer from 1 to 10)"
max_iterations=$((10#$max_iterations))
[[ $agent_timeout =~ ^[0-9]{1,6}$ ]] && ((10#$agent_timeout >= 1 && 10#$agent_timeout <= 86400)) ||
  usage_error "invalid agent timeout: '$agent_timeout' (expected an integer from 1 to 86400 seconds)"
agent_timeout=$((10#$agent_timeout))

for tool in git timeout setsid sha256sum ps iconv; do
  command -v "$tool" >/dev/null 2>&1 || usage_error "required command not found on PATH: $tool"
done

# Resolve the brief before leaving the caller's directory, then work in the project root
# (the parent directory of scripts/), wherever the script was invoked from.
brief_abs="$(cd -- "$(dirname -- "$brief")" && pwd -P)/$(basename -- "$brief")"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd -- "$ROOT"

CHECK_CMD="${AGENT_LOOP_CHECK_CMD:-npm run check:loop}"
FULL_CHECK_CMD="${AGENT_LOOP_FULL_CHECK_CMD:-npm run check}"
LOG_DIR="docs/evidence/$task_id"
LOG="$LOG_DIR/loop-run.log"
# The loop's own log and scratch output never count as progress (design D7).
PATHSPEC=(. ":(exclude)$LOG" ':(exclude).agent-loop')

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

RUN_START="$(now)"
RUN_DIR=".agent-loop/$task_id/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p -- "$LOG_DIR" "$RUN_DIR"

CHILD_PID=''
PROMPT_FILE=''
fixer_runs=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Append one line to the log (append-only; earlier records are never rewritten).
log_line() { printf '%s\n' "$1" >>"$LOG"; }

# key=value value: double-quoted (with \ and " escaped) when it contains whitespace,
# quotes, or backslashes; newlines become \n so each record stays on one line.
quote() {
  local v=$1
  if [[ -z $v || $v =~ [[:space:]\"\\] ]]; then
    v=${v//\\/\\\\}
    v=${v//\"/\\\"}
    v=${v//$'\n'/\\n}
    printf '"%s"' "$v"
  else
    printf '%s' "$v"
  fi
}

say() { printf '[agent-loop] %s\n' "$1"; }

strip_ansi() {
  local esc=$'\033'
  LC_ALL=C sed -E "s#${esc}\[[0-9;?]*[ -/]*[@-~]##g; s#${esc}.##g; s#\r\$##; s#\r# #g"
}

# True while any process of the group is alive (zombies do not count).
group_alive() {
  ps -e -o pgid=,stat= 2>/dev/null | awk -v g="$1" '$1 == g && $2 !~ /^Z/ { found = 1 } END { exit !found }'
}

# Terminate every process left in a child's process group: TERM, up to 5 s, then KILL.
stop_group() {
  local pgid=$1 i
  group_alive "$pgid" || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for ((i = 0; i < 50; i++)); do
    group_alive "$pgid" || return 0
    sleep 0.1
  done
  kill -KILL -- "-$pgid" 2>/dev/null || true
  for ((i = 0; i < 50; i++)); do
    group_alive "$pgid" || return 0
    sleep 0.1
  done
}

# Run a command in its own session and process group (setsid), so that a terminal
# Ctrl+C reaches only this script, which then terminates the whole group. The script
# waits with the `wait` builtin so that its INT/TERM trap runs immediately.
# Usage: run_child <output file> <stdin file> <command...>; returns the command's exit code.
run_child() {
  local out=$1 input=$2 rc=0
  shift 2
  setsid "$@" >"$out" 2>&1 <"$input" &
  CHILD_PID=$!
  wait "$CHILD_PID" || rc=$?
  stop_group "$CHILD_PID"
  CHILD_PID=''
  return "$rc"
}

on_signal() {
  local sig=$1
  trap '' INT TERM
  if [ -n "$CHILD_PID" ]; then
    stop_group "$CHILD_PID"
    wait "$CHILD_PID" 2>/dev/null || true
    CHILD_PID=''
  fi
  # Best effort; not one of the four stop reasons (design D7: no footer is guaranteed).
  printf '=== run interrupted=%s signal=%s fixer_runs=%s exit=130\n' "$(now)" "$sig" "$fixer_runs" >>"$LOG" 2>/dev/null || true
  printf '[agent-loop] interrupted by SIG%s; child processes terminated. Independent checker review is still required.\n' "$sig" >&2
  exit 130
}

cleanup() {
  if [ -n "$PROMPT_FILE" ]; then rm -f -- "$PROMPT_FILE"; fi
}

trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap cleanup EXIT

EMPTY_TREE="$(git hash-object -t tree /dev/null 2>/dev/null || echo 4b825dc642cb6eb9a060e54bf8d69288fbee4904)"
diff_base() { git rev-parse --verify -q HEAD 2>/dev/null || printf '%s\n' "$EMPTY_TREE"; }

# One line per untracked, non-ignored entry, sorted by path. Never fails: a symlink
# contributes its target text (broken symlinks work), a readable regular file its
# SHA-256, and anything else the marker unreadable:<path>.
untracked_entries() {
  local p h
  while IFS= read -r -d '' p; do
    if [ -L "$p" ]; then
      printf 'symlink %s -> %s\n' "$p" "$(readlink -- "$p" 2>/dev/null || printf '?')"
    elif [ -f "$p" ] && [ -r "$p" ] && h=$(sha256sum -- "$p" 2>/dev/null); then
      printf 'file %s %s\n' "$p" "${h%% *}"
    else
      printf 'unreadable:%s\n' "$p"
    fi
  done < <(git ls-files --others --exclude-standard -z -- "${PATHSPEC[@]}" 2>/dev/null | LC_ALL=C sort -z || true)
}

# SHA-256 over the working tree state (design D7): status, tracked content, and the
# content of untracked, non-ignored files, all limited by the same pathspec.
fingerprint() {
  local base
  base=$(diff_base)
  {
    printf '## status\n'
    git status --porcelain=v1 --untracked-files=all -- "${PATHSPEC[@]}" 2>/dev/null || printf 'status failed\n'
    printf '## diff\n'
    git diff --binary "$base" -- "${PATHSPEC[@]}" 2>/dev/null || printf 'diff failed\n'
    printf '## untracked\n'
    untracked_entries
  } | sha256sum | cut -d' ' -f1
}

# Informational only: files changed relative to HEAD plus untracked files, comma-separated.
changed_files() {
  local base
  base=$(diff_base)
  {
    git diff --name-only --relative "$base" -- "${PATHSPEC[@]}" 2>/dev/null || true
    git ls-files --others --exclude-standard -- "${PATHSPEC[@]}" 2>/dev/null || true
  } | LC_ALL=C sort -u | paste -sd, -
}

LAST_FAIL_OUT=''
LAST_FAIL_PHASE=''
LAST_FAIL_CMD=''
LAST_FAIL_EXIT=''

# Usage: run_check <iteration> <check|full_check> <command>; returns the check's exit code.
run_check() {
  local iteration=$1 phase=$2 cmd=$3 out start rc=0 duration
  out="$RUN_DIR/iter-$iteration-$phase.txt"
  say "iteration $iteration: $phase: $cmd"
  start=$SECONDS
  run_child "$out" /dev/null bash -c "$cmd" || rc=$?
  duration=$((SECONDS - start))
  if [ "$rc" -eq 0 ]; then
    log_line "iteration=$iteration phase=$phase exit=0 result=pass duration_s=$duration"
    say "iteration $iteration: $phase passed (${duration}s)"
  else
    log_line "iteration=$iteration phase=$phase exit=$rc result=fail duration_s=$duration"
    # Bounded excerpt: last 40 lines, ANSI stripped, at most 500 bytes per line; iconv -c
    # drops a UTF-8 character split by the cut (and any other invalid byte, so the log
    # stays UTF-8); trailing whitespace is removed so the committed log passes
    # whitespace checks (a blank line becomes "  |").
    strip_ansi <"$out" | tail -n 40 | cut -b 1-500 | { iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || true; } |
      sed 's/^/  | /; s/[[:space:]]*$//' >>"$LOG"
    LAST_FAIL_OUT=$out LAST_FAIL_PHASE=$phase LAST_FAIL_CMD=$cmd LAST_FAIL_EXIT=$rc
    say "iteration $iteration: $phase failed with exit $rc (${duration}s); output: $out"
  fi
  return "$rc"
}

write_prompt() {
  cat <<EOF
You are one fix iteration of the project's agent loop (scripts/agent-loop.sh) for task $task_id.
You run as a fresh, non-interactive process; there is no earlier session to resume.

Rules:
- Edit only the files listed under "Owned files" in the task brief below.
- Do not weaken, skip, or delete tests or specifications.
- Do not commit, push, stage, or otherwise change Git history or the index; do not edit tasks.md or tick checkboxes; do not write review files or verdicts.
- You may run npm run lint, npm run typecheck, and npm run test:unit; the loop runs the full checks itself after you finish.
- Stop when you are done. This run does not complete or review the task; a separate checker does.

## Task brief

EOF
  cat -- "$brief_abs"
  printf '\n## Failing check output\n\nPhase: %s; command: %s; exit code: %s. Last 200 lines (at most 20 KB), ANSI escape codes removed:\n\n' \
    "$LAST_FAIL_PHASE" "$LAST_FAIL_CMD" "$LAST_FAIL_EXIT"
  strip_ansi <"$LAST_FAIL_OUT" | tail -n 200 | tail -c 20480
}

finish() {
  local reason=$1 code=$2
  log_line "=== run end=$(now) stop_reason=$reason fixer_runs=$fixer_runs exit=$code"
  printf 'Loop finished: %s. Independent checker review is still required.\n' "$reason"
  exit "$code"
}

# Usage: run_agent <iteration>; stops the loop with agent_error on failure.
run_agent() {
  local iteration=$1 out start rc=0 duration cause='' changed line
  local -a cmd
  if ! command -v "$agent" >/dev/null 2>&1; then
    log_line "iteration=$iteration phase=agent exit=127 duration_s=0 cause=$(quote "$agent not found on PATH")"
    say "iteration $iteration: $agent not found on PATH"
    finish agent_error 2
  fi
  case "$agent" in
    claude)
      cmd=(claude -p --permission-mode acceptEdits
        --allowedTools "Read" "Edit" "Write" "Glob" "Grep"
        "Bash(npm run lint)" "Bash(npm run typecheck)" "Bash(npm run test:unit)"
        --no-session-persistence --output-format text
        --max-budget-usd "${AGENT_LOOP_CLAUDE_MAX_USD:-2}")
      ;;
    codex)
      cmd=(codex exec --sandbox workspace-write --cd "$ROOT" -)
      ;;
  esac
  PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/agent-loop-prompt.XXXXXX")"
  write_prompt >"$PROMPT_FILE"
  out="$RUN_DIR/iter-$iteration-agent.txt"
  say "iteration $iteration: running $agent (time limit ${agent_timeout}s)"
  fixer_runs=$((fixer_runs + 1))
  start=$SECONDS
  run_child "$out" "$PROMPT_FILE" timeout --kill-after=10 "$agent_timeout" "${cmd[@]}" || rc=$?
  duration=$((SECONDS - start))
  rm -f -- "$PROMPT_FILE"
  PROMPT_FILE=''
  if [ "$rc" -eq 124 ] || { [ "$rc" -eq 137 ] && [ "$duration" -ge "$agent_timeout" ]; }; then
    cause=timeout
  elif [ "$rc" -ne 0 ]; then
    cause=exit_code
  fi
  changed=$(changed_files)
  line="iteration=$iteration phase=agent exit=$rc duration_s=$duration"
  [ -z "$cause" ] || line+=" cause=$cause"
  [ -z "$changed" ] || line+=" changed_files=$(quote "$changed")"
  log_line "$line"
  if [ -n "$cause" ]; then
    say "iteration $iteration: $agent failed ($cause, exit $rc); output: $out"
    finish agent_error 2
  fi
  say "iteration $iteration: $agent finished (${duration}s); output: $out"
}

# ---------------------------------------------------------------------------
# Main loop (iteration 0 = initial fast check; each further iteration = one fixer run
# plus one fast check; the full check runs whenever the fast check passes)
# ---------------------------------------------------------------------------
log_line "=== run start=$RUN_START task_id=$task_id agent=$agent max_iterations=$max_iterations agent_timeout_s=$agent_timeout check_cmd=$(quote "$CHECK_CMD") full_check_cmd=$(quote "$FULL_CHECK_CMD") git_head=$(git rev-parse --verify -q HEAD 2>/dev/null || echo none) node=$(node --version 2>/dev/null || echo none)"
say "task $task_id: agent $agent, at most $max_iterations fixer runs; log: $LOG"

iteration=0
while :; do
  if run_check "$iteration" check "$CHECK_CMD" && run_check "$iteration" full_check "$FULL_CHECK_CMD"; then
    finish checks_passed 0
  fi
  if [ "$fixer_runs" -ge "$max_iterations" ]; then
    finish max_iterations_reached 1
  fi
  iteration=$((iteration + 1))
  before=$(fingerprint)
  run_agent "$iteration"
  after=$(fingerprint)
  if [ "$before" = "$after" ]; then
    say "iteration $iteration: the working tree is unchanged and the checks still fail"
    finish no_progress 3
  fi
done
