#!/usr/bin/env bash
# Claude Code SessionStart hook (design D8, specs/session-context-hook/spec.md).
# Prints the active OpenSpec changes for the session context. Plain-text stdout of a
# SessionStart hook that exits 0 is added to the session context by Claude Code.
# Read-only: writes no files, installs nothing, and always exits 0 so the session is never
# blocked. On failure it prints a one-line notice with a short reason instead.
# The project-pinned CLI binary is run directly, not through npm, because every `npm run`
# writes and rotates debug logs under ~/.npm/_logs (user decision, 2026-09-26).

set -u

manual_cmd='npm run --silent openspec -- list --json'

notice() {
  printf 'Active OpenSpec changes could not be loaded (%s). Run: %s\n' "$1" "$manual_cmd"
  exit 0
}

# Project root: $CLAUDE_PROJECT_DIR, falling back to the parent of this script's directory.
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  project_dir=$CLAUDE_PROJECT_DIR
else
  project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd) || project_dir=''
fi
[ -n "$project_dir" ] && cd -- "$project_dir" 2>/dev/null || notice 'project directory not accessible'

cli=./node_modules/.bin/openspec
[ -x "$cli" ] || notice "$cli is missing; dependencies are not installed"
command -v node >/dev/null 2>&1 || notice 'node not found on PATH'
command -v timeout >/dev/null 2>&1 || notice 'timeout command not found on PATH'

# OPENSPEC_TELEMETRY=0 is OpenSpec's documented telemetry opt-out; without it the CLI creates
# its global config file (anonymous id) when none exists and sends a usage event.
# stdin is closed so the CLI cannot wait for input; stderr is discarded (short reason only).
output=$(OPENSPEC_TELEMETRY=0 timeout 10 "$cli" list --json </dev/null 2>/dev/null)
status=$?

case $status in
  0) ;;
  124) notice 'the OpenSpec command did not finish within 10 seconds' ;;
  *) notice "the OpenSpec command exited with status $status" ;;
esac
[ -n "$output" ] || notice 'the OpenSpec command printed nothing'

printf 'Active OpenSpec changes (from `%s list --json`):\n%s\n' "$cli" "$output"
exit 0
